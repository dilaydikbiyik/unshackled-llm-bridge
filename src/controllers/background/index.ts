import type { AdapterHealth } from '@adapters/types';
import { conversationToMarkdown, exportFilename } from '@models/export';
import { serializeConversation } from '@models/conversation/serializer';
import {
  getAttachment,
  getConversation,
  listAttachments,
  recordFork,
  saveAttachment,
  saveConversation,
  searchConversations,
} from '@models/store/repo';
import { summarizeTranscript } from '@models/summarize/client';
import { getSettings } from '@shared/settings';
import { PLATFORMS, type PlatformId } from '@shared/platforms';
import {
  onRuntimeMessage,
  type ComparisonState,
  type PendingInjection,
  type SummarizeResponse,
} from '@shared/messages';

/**
 * MV3 service worker: the messaging hub and the only context that touches the
 * local database and the user's API key. Business logic lives in models/;
 * this file routes.
 */

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

const pendingKey = (platform: PlatformId) => `pending-injection:${platform}`;
const healthKey = (platform: PlatformId) => `health:${platform}`;
const COMPARISONS_KEY = 'comparisons';

onRuntimeMessage(async (msg) => {
  switch (msg.type) {
    case 'adapter/health-report': {
      await chrome.storage.session.set({ [healthKey(msg.health.platform)]: msg.health });
      return { ok: true };
    }

    case 'health/list-request': {
      const keys = Object.keys(PLATFORMS).map((p) => healthKey(p as PlatformId));
      const stored = await chrome.storage.session.get(keys);
      return Object.values(stored) as AdapterHealth[];
    }

    case 'inject/initiate': {
      // Hand-off across tabs: park the package in session storage, open the
      // target platform; its content script claims the package once ready.
      const { targetPlatform, injection, lineage } = msg.request;
      await chrome.storage.session.set({ [pendingKey(targetPlatform)]: injection });
      if (lineage) await recordFork(lineage, targetPlatform);
      await chrome.tabs.create({ url: PLATFORMS[targetPlatform].newChatUrl });
      return { ok: true };
    }

    case 'inject/pending-check': {
      const key = pendingKey(msg.platform);
      const stored = await chrome.storage.session.get(key);
      const pending = (stored[key] as PendingInjection | undefined) ?? null;
      if (pending) await chrome.storage.session.remove(key);
      return pending;
    }

    case 'attachment/capture': {
      return saveAttachment(msg.meta, base64ToBytes(msg.dataBase64));
    }

    case 'attachment/list': {
      return listAttachments(msg.conversationKey);
    }

    case 'attachment/get': {
      const stored = await getAttachment(msg.id);
      if (!stored) return null;
      const bytes = new Uint8Array(await stored.blob.arrayBuffer());
      return { meta: stored.meta, dataBase64: bytesToBase64(bytes) };
    }

    case 'archive/save': {
      if (!(await getSettings()).archiveEnabled) return { ok: false };
      await saveConversation(msg.conversation);
      return { ok: true };
    }

    case 'archive/search': {
      return searchConversations(msg.query);
    }

    case 'archive/export': {
      const conversation = await getConversation(msg.id);
      if (!conversation) return null;
      return {
        filename: exportFilename(conversation, msg.format),
        content:
          msg.format === 'markdown'
            ? conversationToMarkdown(conversation)
            : JSON.stringify(JSON.parse(serializeConversation(conversation)), null, 2),
      };
    }

    case 'compare/start': {
      const comparison: ComparisonState = {
        id: crypto.randomUUID(),
        text: msg.text,
        targets: msg.targets,
        createdAt: new Date().toISOString(),
        responses: {},
      };
      await saveComparison(comparison);
      // Stagger the tab opens: bursting N identical prompts at once is exactly
      // the pattern rate limiters look for.
      for (const target of msg.targets) {
        await chrome.storage.session.set({
          [pendingKey(target)]: {
            text: msg.text,
            attachmentIds: [],
            comparisonId: comparison.id,
          } satisfies PendingInjection,
        });
        await chrome.tabs.create({ url: PLATFORMS[target].newChatUrl, active: false });
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      return { comparisonId: comparison.id };
    }

    case 'compare/report': {
      const comparisons = await loadComparisons();
      const comparison = comparisons.find((c) => c.id === msg.comparisonId);
      if (!comparison) return { ok: false };
      comparison.responses[msg.platform] = {
        content: msg.content,
        updatedAt: new Date().toISOString(),
      };
      await chrome.storage.local.set({ [COMPARISONS_KEY]: comparisons });
      return { ok: true };
    }

    case 'summarize/run': {
      const settings = await getSettings();
      if (!settings.anthropicApiKey) {
        return { ok: false, error: 'no-api-key' } satisfies SummarizeResponse;
      }
      try {
        const summary = await summarizeTranscript({
          apiKey: settings.anthropicApiKey,
          model: settings.summaryModel,
          transcript: msg.transcript,
          language: msg.language,
        });
        return { ok: true, summary } satisfies SummarizeResponse;
      } catch (error) {
        return { ok: false, error: String(error) } satisfies SummarizeResponse;
      }
    }
  }
});

async function loadComparisons(): Promise<ComparisonState[]> {
  const stored = await chrome.storage.local.get(COMPARISONS_KEY);
  return (stored[COMPARISONS_KEY] as ComparisonState[] | undefined) ?? [];
}

async function saveComparison(comparison: ComparisonState): Promise<void> {
  const comparisons = await loadComparisons();
  // Keep the log bounded; the newest 20 comparisons are plenty for a side panel.
  await chrome.storage.local.set({ [COMPARISONS_KEY]: [comparison, ...comparisons].slice(0, 20) });
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
