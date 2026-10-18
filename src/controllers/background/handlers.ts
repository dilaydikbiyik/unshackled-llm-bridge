import type * as RepoModule from '@data/store/repo';
import type { summarizeTranscript } from '@data/summarize/client';
import { MAX_ATTACHMENT_BYTES } from '@domain/attachments';
import { serializeConversation } from '@domain/conversation/serializer';
import { conversationToMarkdown, exportFilename } from '@domain/export';
import { distilMemory } from '@domain/memory/distil';
import { platformIds, platformInfo, type PlatformId } from '@domain/platforms';
import { base64ToBytes, bytesToBase64 } from '@shared/base64';
import { readComparisons, writeComparisons } from '@shared/comparisons';
import type { AdapterHealth } from '@shared/health';
import type { ComparisonState, HandlerMap, PendingInjection } from '@shared/messages';
import type { Settings } from '@shared/settings';
import type { KeyValueStore } from '@shared/storage';

export type RepoPort = Pick<
  typeof RepoModule,
  | 'saveAttachment'
  | 'listAttachments'
  | 'rekeyAttachments'
  | 'getAttachment'
  | 'saveConversation'
  | 'getConversation'
  | 'searchConversations'
  | 'listConversations'
  | 'recordFork'
  | 'listForksFrom'
>;

/**
 * Everything the service worker touches in the outside world. The handlers
 * receive it instead of calling chrome.* themselves, which is what makes the
 * hub unit-testable: index.ts wires the real browser, tests wire fakes.
 */
export interface BackgroundDeps {
  /** Cleared when the browser closes: pending transfers and adapter health. */
  session: KeyValueStore;
  /** Persistent: the comparison log. */
  local: KeyValueStore;
  openTab: (url: string, options: { active: boolean }) => Promise<void>;
  repo: RepoPort;
  summarize: typeof summarizeTranscript;
  getSettings: () => Promise<Settings>;
  sleep: (ms: number) => Promise<void>;
  now?: () => Date;
  newId?: () => string;
}

export const pendingKey = (platform: PlatformId): string => `pending-injection:${platform}`;
export const healthKey = (platform: PlatformId): string => `health:${platform}`;

/** Gap between comparison tab opens: N identical prompts at once is what rate limiters look for. */
/**
 * How long a parked package waits to be collected. Long enough for a slow tab
 * and a slow login; short enough that it cannot surprise the user later.
 */
export const PENDING_TTL_MS = 10 * 60 * 1000;

export const COMPARE_STAGGER_MS = 800;

/**
 * An address the extension is willing to reopen: http or https, and on a host
 * the target site actually claims. Anything else — another scheme, another
 * site — is discarded in favour of that platform's new-chat page, so a bad
 * value loses the return trip rather than opening something unexpected.
 */
export function safeReturnUrl(candidate: string | undefined, target: PlatformId): string | null {
  if (!candidate) return null;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const hosts = platformInfo(target).hosts;
  const allowed = hosts.some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
  );
  return allowed ? url.href : null;
}

export function createHandlers(deps: BackgroundDeps): HandlerMap {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => crypto.randomUUID());

  return {
    'adapter/health-report': async ({ health }) => {
      await deps.session.set(healthKey(health.platform), health);
      return { ok: true };
    },

    'health/list-request': async () => {
      const all = await Promise.all(
        platformIds().map((platform: PlatformId) => deps.session.get<AdapterHealth>(healthKey(platform))),
      );
      return all.filter((health): health is AdapterHealth => health !== undefined);
    },

    'inject/initiate': async ({ request }) => {
      // Hand-off across tabs: park the package, open the target, and let the
      // target's content script claim it once its composer is ready.
      // The lineage travels with the package: the target needs it to offer the
      // trip back, and only the forking side knows it.
      await deps.session.set(pendingKey(request.targetPlatform), {
        ...request.injection,
        parkedAt: now().toISOString(),
        ...(request.lineage ? { lineage: request.lineage } : {}),
      });
      if (request.lineage) await deps.repo.recordFork(request.lineage, request.targetPlatform);
      // A return trip reopens the origin conversation; a fork starts a new one.
      // The address is checked rather than trusted: it reaches the worker from
      // a content script, and "open whatever you are handed" is how an
      // extension becomes a way to open anything.
      const fallback = platformInfo(request.targetPlatform).newChatUrl;
      await deps.openTab(safeReturnUrl(request.openUrl, request.targetPlatform) ?? fallback, {
        active: true,
      });
      return { ok: true };
    },

    'inject/pending-check': async ({ platform }) => {
      const key = pendingKey(platform);
      const pending = await deps.session.get<PendingInjection>(key);
      if (!pending) return null;
      // Claimed exactly once: a second tab on the same platform must not re-inject it.
      await deps.session.remove(key);

      // A package nobody collected is stale, not pending. Handing it to a tab
      // opened long afterwards would drop a prompt into unrelated work.
      if (pending.parkedAt && now().getTime() - Date.parse(pending.parkedAt) > PENDING_TTL_MS) {
        return null;
      }
      return pending;
    },

    'attachment/capture': async ({ meta, dataBase64 }) => {
      const bytes = base64ToBytes(dataBase64);
      if (bytes.length > MAX_ATTACHMENT_BYTES) return { ok: false, error: 'too-large' };
      return deps.repo.saveAttachment(meta, bytes);
    },

    // Only the user's own files. A transcript this extension generated for an
    // earlier fork lives in the same store, and offering it back would make
    // each fork carry every previous fork's transcript with it.
    'attachment/list': async ({ conversationKey }) =>
      (await deps.repo.listAttachments(conversationKey)).filter((meta) => !meta.generated),

    'attachment/rekey': async ({ from, to }) => ({
      moved: await deps.repo.rekeyAttachments(from, to),
    }),

    'attachment/get': async ({ id }) => {
      const stored = await deps.repo.getAttachment(id);
      if (!stored) return null;
      const bytes = new Uint8Array(await stored.blob.arrayBuffer());
      return { meta: stored.meta, dataBase64: bytesToBase64(bytes) };
    },

    'archive/save': async ({ conversation }) => {
      // Archiving is opt-in, and the check lives here so no caller can bypass it.
      if (!(await deps.getSettings()).archiveEnabled) return { ok: false };
      await deps.repo.saveConversation(conversation);
      return { ok: true };
    },

    'archive/search': ({ query }) => deps.repo.searchConversations(query),

    // Distilled in the worker, where the archive lives. Nothing leaves the
    // browser: the profile is counted from the user's own conversations.
    'memory/distil': async () => distilMemory(await deps.repo.listConversations()),

    'archive/export': async ({ id, format }) => {
      const conversation = await deps.repo.getConversation(id);
      if (!conversation) return null;
      const content =
        format === 'markdown'
          ? conversationToMarkdown(conversation, await deps.repo.listForksFrom(conversation.id))
          : JSON.stringify(JSON.parse(serializeConversation(conversation)), null, 2);
      return { filename: exportFilename(conversation, format), content };
    },

    'compare/start': async ({ text, targets }) => {
      const comparison: ComparisonState = {
        id: newId(),
        text,
        targets,
        createdAt: now().toISOString(),
        responses: {},
      };
      await writeComparisons(deps.local, [comparison, ...(await readComparisons(deps.local))]);
      for (const [index, target] of targets.entries()) {
        if (index > 0) await deps.sleep(COMPARE_STAGGER_MS);
        await deps.session.set(pendingKey(target), {
          text,
          attachmentIds: [],
          comparisonId: comparison.id,
        } satisfies PendingInjection);
        await deps.openTab(platformInfo(target).newChatUrl, { active: false });
      }
      return { comparisonId: comparison.id };
    },

    'compare/report': async ({ comparisonId, platform, content }) => {
      const comparisons = await readComparisons(deps.local);
      const comparison = comparisons.find((c) => c.id === comparisonId);
      if (!comparison) return { ok: false };
      comparison.responses[platform] = { content, updatedAt: now().toISOString() };
      await writeComparisons(deps.local, comparisons);
      return { ok: true };
    },

    'summarize/run': async ({ transcript, language }) => {
      const settings = await deps.getSettings();
      if (!settings.anthropicApiKey) return { ok: false, error: 'no-api-key' };
      try {
        const summary = await deps.summarize({
          apiKey: settings.anthropicApiKey,
          model: settings.summaryModel,
          transcript,
          language,
        });
        return { ok: true, summary };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
