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
import { t } from '@shared/i18n';
import { detectPlatform } from '@domain/platforms';
import { sendToBackground } from '@shared/messages';
import { getSettings } from '@shared/settings';
import { mountForkButtons } from '@views/content/fork-button';
import { openForkDialog } from '@views/content/fork-dialog';
import { showToast } from '@views/content/toast';

/**
 * Content-script entry: detect the platform, wire adapter ⟷ background, mount
 * the in-page UI, and claim any package targeted at this platform.
 */
async function main(): Promise<void> {
  const platform = detectPlatform(location.hostname);
  if (!platform) return;

  const config = await loadSelectorConfig();
  const adapter = createAdapter(platform, config);
  if (!adapter) return;

  await reportHealth(adapter);
  mountAttachmentCapture(adapter);
  mountFork(adapter, config);
  void watchForArchive(adapter);
  await claimPendingInjection(adapter);
}

async function reportHealth(adapter: PlatformAdapter): Promise<void> {
  const health = await adapter.healthCheck();
  await sendToBackground({ type: 'adapter/health-report', health });
}

function mountFork(adapter: PlatformAdapter, config: SelectorConfig): void {
  const selectors = config.platforms[adapter.platform] ?? {};
  mountForkButtons({
    locateMessages: () => resolveSelectorAll(document, selectors['messageContainer']),
    onFork: (messageIndex) => void openDialogFor(adapter, messageIndex),
  });
}

async function openDialogFor(adapter: PlatformAdapter, messageIndex: number): Promise<void> {
  const [conversation, settings, attachments] = await Promise.all([
    adapter.readConversation(),
    getSettings(),
    sendToBackground({
      type: 'attachment/list',
      conversationKey: conversationKey(adapter.platform),
    }),
  ]);

  openForkDialog({
    conversation,
    settings,
    attachments,
    buildPackage: createTransferPackageBuilder({
      conversation,
      cutIndex: messageIndex,
      language: settings.language,
    }),
    // The warning is sized for the default scope, the whole conversation.
    showLengthWarning: exceedsTransferBudget(conversation, messageIndex, 'whole'),
    scopeCounts: {
      whole: conversation.messages.length,
      upToMessage: messagesInScope(conversation, messageIndex, 'upToMessage').length,
    },
    onTransfer: async ({ target, text, scope, contextFile, attachmentIds }) => {
      // The context travels as a file: store it, then reference it like any
      // other attachment so the target replays it through the same path.
      const contextId = contextFile
        ? await storeGeneratedFile(adapter.platform, contextFile.name, contextFile.text)
        : null;
      await sendToBackground({
        type: 'inject/initiate',
        request: {
          targetPlatform: target,
          injection: {
            text,
            attachmentIds: contextId ? [contextId, ...attachmentIds] : attachmentIds,
            // Nothing is lost if the upload fails on the far side.
            ...(contextFile ? { fallbackText: contextFile.text } : {}),
          },
          lineage: {
            sourceConversationId: conversation.id,
            sourcePlatform: conversation.sourcePlatform,
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
  try {
    await waitUntilReady(adapter);
    // Injection fills the composer only; sending stays a user action.
    await adapter.injectText(pending.text);
    if (pending.attachmentIds.length) {
      const replayed = await replayAttachments(adapter, pending.attachmentIds);
      // A continuation note with no conversation attached is worse than a
      // plain paste, so fall back to the full package in the composer.
      if (replayed === 0 && pending.fallbackText) {
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
 */
function reportComparisonAnswer(adapter: PlatformAdapter, comparisonId: string): void {
  const startedAt = Date.now();
  const stop = adapter.observeMessages(() => {
    void (async () => {
      if (Date.now() - startedAt > 10 * 60 * 1000) return stop();
      const conversation = await adapter.readConversation();
      const last = conversation.messages.at(-1);
      if (last?.role !== 'assistant' || last.content.length < 40) return;
      await sendToBackground({
        type: 'compare/report',
        comparisonId,
        platform: adapter.platform,
        content: last.content,
      });
    })();
  });
}

/** Opt-in passive archiving of whatever conversation the user is looking at. */
async function watchForArchive(adapter: PlatformAdapter): Promise<void> {
  if (!(await getSettings()).archiveEnabled) return;
  let lastSignature = '';
  adapter.observeMessages(() => {
    void (async () => {
      const conversation = await adapter.readConversation();
      if (conversation.messages.length === 0) return;
      const signature = `${conversation.id}:${conversation.messages.length}`;
      if (signature === lastSignature) return;
      lastSignature = signature;
      await sendToBackground({ type: 'archive/save', conversation });
    })();
  });
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
