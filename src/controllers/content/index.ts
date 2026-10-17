import { createAdapter } from '@adapters/registry';
import type { PlatformAdapter } from '@adapters/types';
import {
  loadSelectorConfig,
  resolveSelectorAll,
  type SelectorConfig,
} from '@data/config/selector-config';
import {
  conversationKey,
  mountAttachmentCapture,
  replayAttachments,
  storeGeneratedFile,
} from '@controllers/attachments';
import {
  createTransferPackageBuilder,
  exceedsTransferBudget,
  messagesInScope,
} from '@controllers/fork';
import { t, type Lang } from '@shared/i18n';
import { detectPlatform, platformIds, platformLabel } from '@domain/platforms';
import { sendToBackground } from '@shared/messages';
import { isForkCommand } from '@shared/commands';
import { guardContext } from '@shared/lifecycle';
import { watchForAnswer } from './compare-watch';
import { bindOrigin, readOrigin, rememberOrigin } from './origin';
import { markRelayed, readRelayPoints } from './relay';
import { loadRegisteredSites } from '@shared/sites';
import { getSettings } from '@shared/settings';
import { mountForkButtons } from '@views/content/fork-button';
import type { DraggedConversation } from '@views/content/drag-out';
import { openForkDialog } from '@views/content/fork-dialog';
import { showToast } from '@views/content/toast';

/**
 * Content-script entry: detect the platform, wire adapter ⟷ background, mount
 * the in-page UI, and claim any package targeted at this platform.
 */
/** Everything this script added to the page, undone when it is orphaned. */
const teardowns: (() => void)[] = [];
let orphaned = false;

/**
 * Reloading the extension leaves this script running in every open tab, bound
 * to a runtime that no longer exists. Rather than throwing on every listener
 * that fires afterwards, it removes its own UI and stops; reloading the tab
 * brings back a live script.
 */
function abandonPage(): void {
  if (orphaned) return;
  orphaned = true;
  for (const teardown of teardowns.splice(0)) {
    try {
      teardown();
    } catch {
      // Nothing left to report to: the runtime is gone.
    }
  }
}

async function main(): Promise<void> {
  // A site the user added is only detectable once it is in the registry.
  await loadRegisteredSites();
  // The full host: a local model is identified by its port.
  const platform = detectPlatform(location.host);
  if (!platform) return;

  const config = await loadSelectorConfig();
  const adapter = createAdapter(platform, config);
  if (!adapter) return;

  await guardContext(async () => {
    await reportHealth(adapter);
    teardowns.push(mountAttachmentCapture(adapter));
    teardowns.push(mountFork(adapter, config, (await getSettings()).language));
    teardowns.push(listenForShortcut(adapter));
    void watchConversation(adapter);
    await claimPendingInjection(adapter);
  }, abandonPage);
}

async function reportHealth(adapter: PlatformAdapter): Promise<void> {
  const health = await adapter.healthCheck();
  await sendToBackground({ type: 'adapter/health-report', health });
}

function mountFork(
  adapter: PlatformAdapter,
  config: SelectorConfig,
  lang: Lang,
): () => void {
  const selectors = config.platforms[adapter.platform] ?? {};
  return mountForkButtons({
    hint: t(lang, 'forkHint'),
    locateMessages: () => resolveSelectorAll(document, selectors['messageContainer']),
    onFork: (messageIndex) => void openDialogFor(adapter, messageIndex),
    prepareDrag: () => prepareConversationDrag(adapter),
  });
}

/**
 * The keyboard shortcut, which forks the conversation as a whole — there is no
 * pointer resting on a message to take a cut point from.
 */
function listenForShortcut(adapter: PlatformAdapter): () => void {
  const listener = (message: unknown, sender: chrome.runtime.MessageSender): undefined => {
    if (!isForkCommand(message, sender.id ?? '', chrome.runtime.id)) return undefined;
    void adapter.readConversation().then((conversation) => {
      const lastIndex = conversation.messages.at(-1)?.index ?? 0;
      void openDialogFor(adapter, lastIndex);
    });
    return undefined;
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

/**
 * The conversation, ready to be dragged out of the page and let go anywhere —
 * another tab, another window, another browser, a desktop app. The drop target
 * needs to know nothing about this extension; it receives a file.
 *
 * Always the whole conversation: a drag has no dialog to choose a scope in,
 * and moving the chat is what the gesture means.
 */
async function prepareConversationDrag(
  adapter: PlatformAdapter,
): Promise<DraggedConversation | null> {
  const [conversation, settings] = await Promise.all([adapter.readConversation(), getSettings()]);
  if (conversation.messages.length === 0) return null;

  const cutIndex = conversation.messages.length - 1;
  const build = createTransferPackageBuilder({
    conversation,
    cutIndex,
    language: settings.language,
  });
  const asFile = await build({
    target: adapter.platform,
    mode: 'full',
    scope: 'whole',
    delivery: 'attachment',
  });
  const asText = await build({
    target: adapter.platform,
    mode: 'full',
    scope: 'whole',
    delivery: 'inline',
  });
  if (!asFile.contextFile) return null;

  return {
    fileName: asFile.contextFile.name,
    fileText: asFile.contextFile.text,
    plainText: asText.text,
  };
}

async function openDialogFor(adapter: PlatformAdapter, messageIndex: number): Promise<void> {
  const [conversation, settings, attachments, origin, relayPoints] = await Promise.all([
    adapter.readConversation(),
    getSettings(),
    sendToBackground({
      type: 'attachment/list',
      conversationKey: conversationKey(adapter.platform),
    }),
    readOrigin(conversationKey(adapter.platform)),
    readRelayPoints(conversationKey(adapter.platform), platformIds()),
  ]);

  openForkDialog({
    conversation,
    settings,
    attachments,
    buildPackage: createTransferPackageBuilder({
      conversation,
      cutIndex: messageIndex,
      language: settings.language,
      relayedThrough: (target) => relayPoints.get(target),
    }),
    // The warning is sized for the default scope, the whole conversation.
    showLengthWarning: exceedsTransferBudget(conversation, messageIndex, 'whole'),
    ...(origin
      ? {
          origin: {
            platform: origin.platform,
            label: platformLabel(origin.platform),
            url: origin.url,
          },
        }
      : {}),
    // Per target: the same conversation may be new to one assistant and
    // half-known to another.
    scopeCounts: (target) => {
      const relayed = relayPoints.get(target);
      return {
        whole: conversation.messages.length,
        upToMessage: messagesInScope(conversation, messageIndex, 'upToMessage').length,
        sinceLast:
          relayed === undefined
            ? 0
            : messagesInScope(conversation, messageIndex, 'sinceLast', relayed).length,
      };
    },
    onTransfer: async ({ target, text, scope, contextFile, returnUrl, attachmentIds }) => {
      // The context travels as a file: store it, then reference it like any
      // other attachment so the target replays it through the same path.
      const contextId = contextFile
        ? await storeGeneratedFile(adapter.platform, contextFile.name, contextFile.text)
        : null;
      // The pair is now in step up to here, so the next leg carries only what
      // comes after it.
      const lastIndex = conversation.messages.at(-1)?.index;
      if (lastIndex !== undefined) {
        await markRelayed(conversationKey(adapter.platform), target, lastIndex);
      }

      await sendToBackground({
        type: 'inject/initiate',
        request: {
          targetPlatform: target,
          ...(returnUrl ? { openUrl: returnUrl } : {}),
          injection: {
            text,
            attachmentIds: contextId ? [contextId, ...attachmentIds] : attachmentIds,
            // Nothing is lost if the upload fails on the far side.
            ...(contextFile
              ? { fallbackText: contextFile.text, contextFileName: contextFile.name }
              : {}),
          },
          lineage: {
            sourceConversationId: conversation.id,
            sourcePlatform: conversation.sourcePlatform,
            sourceUrl: location.href,
            // A whole-conversation fork branches from the end, not from the
            // message the dialog happened to be opened from.
            cutIndex: scope === 'whole' ? conversation.messages.length - 1 : messageIndex,
          },
        },
      });
    },
  });
}

async function claimPendingInjection(adapter: PlatformAdapter): Promise<void> {
  const pending = await sendToBackground({
    type: 'inject/pending-check',
    platform: adapter.platform,
  });
  if (!pending) return;

  const settings = await getSettings();
  // Remembered before injection: this is what makes the trip back possible.
  rememberOrigin(pending.lineage);
  try {
    await waitUntilReady(adapter);
    // Injection fills the composer only; sending stays a user action.
    await adapter.injectText(pending.text);
    if (pending.attachmentIds.length) {
      const replayed = await replayAttachments(adapter, pending.attachmentIds);
      // A continuation note with no conversation attached is worse than a
      // plain paste. A synthetic drop is dispatched rather than acknowledged,
      // so a count of attempts proves nothing — the page is asked whether the
      // file actually arrived.
      const landed =
        replayed > 0 && pending.contextFileName
          ? await waitForAttachment(adapter, pending.contextFileName)
          : replayed > 0;

      if (!landed && pending.fallbackText) {
        await adapter.injectText(pending.fallbackText);
        showToast(t(settings.language, 'contextFileFailed'));
      }
    }
  } catch {
    // The package is never lost: offer it on the clipboard instead.
    showToast(t(settings.language, 'injectFailed'), {
      label: t(settings.language, 'copyAction'),
      text: pending.fallbackText ?? pending.text,
    });
  }

  if (pending.comparisonId) void reportComparisonAnswer(adapter, pending.comparisonId);
}

/**
 * Parallel comparison: once the user sends the injected prompt, capture the
 * assistant's reply and hand it to the side panel's side-by-side view.
 *
 * The watching itself lives in compare-watch.ts, where it is tested: it has to
 * cope with a streaming answer, with having no way to ask the page whether
 * generation finished, and with the user carrying on in the tab afterwards.
 */
function reportComparisonAnswer(adapter: PlatformAdapter, comparisonId: string): void {
  const stop = watchForAnswer(adapter, (content) =>
    guardContext(
      () =>
        sendToBackground({
          type: 'compare/report',
          comparisonId,
          platform: adapter.platform,
          content,
        }).then(() => undefined),
      abandonPage,
    ).then(() => undefined),
  );
  teardowns.push(stop);
}

/** Opt-in passive archiving of whatever conversation the user is looking at. */
/**
 * One observer over the conversation, doing two jobs that used to be one.
 *
 * Binding the origin lived inside the archive watcher, behind the archiving
 * setting — which is off by default. A conversation created by a fork
 * therefore forgot where it came from as soon as the page reloaded, for almost
 * everyone, and the trip back quietly stopped being offered. Binding happens
 * whatever the setting; archiving is the part that is opt-in.
 */
async function watchConversation(adapter: PlatformAdapter): Promise<void> {
  const archiving = (await getSettings()).archiveEnabled;
  let lastSignature = '';

  // The longest-lived listener in the page, and so the one most likely to fire
  // after the extension has been reloaded out from under it.
  const stop = adapter.observeMessages(() => {
    if (orphaned) return;
    void guardContext(async () => {
      const conversation = await adapter.readConversation();
      if (conversation.messages.length === 0) return;

      // The platform assigns a conversation id at some point after the first
      // message; this is where a fork's origin becomes attachable to it.
      await bindOrigin(conversationKey(adapter.platform));

      if (!archiving) return;
      const signature = `${conversation.id}:${conversation.messages.length}`;
      if (signature === lastSignature) return;
      lastSignature = signature;
      await sendToBackground({ type: 'archive/save', conversation });
    }, abandonPage);
  });
  teardowns.push(stop);
}

/**
 * Gives the platform a moment to show the dropped file. Uploads render
 * asynchronously, so a single check right after the drop would call every
 * transfer a failure.
 */
export const ATTACHMENT_WAIT_MS = 4000;
const ATTACHMENT_POLL_MS = 250;

async function waitForAttachment(adapter: PlatformAdapter, name: string): Promise<boolean> {
  const deadline = Date.now() + ATTACHMENT_WAIT_MS;
  while (Date.now() < deadline) {
    if (adapter.attachmentVisible(name)) return true;
    await new Promise((resolve) => setTimeout(resolve, ATTACHMENT_POLL_MS));
  }
  return false;
}

async function waitUntilReady(adapter: PlatformAdapter, timeoutMs = 20_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await adapter.isReady()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${adapter.platform}: not ready within ${timeoutMs}ms`);
}

void main();
