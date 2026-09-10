import type { BridgeConversation } from '@models/conversation/schema';
import { parseConversation, serializeConversation } from '@models/conversation/serializer';
import type { PlatformId } from '@shared/platforms';
import type { ArchiveHit, CapturedAttachmentMeta, ForkLineage } from '@shared/messages';
import { createDatabase, type BridgeDatabase } from './db';

/**
 * Data-access layer over Dexie. IMPORTANT: only extension-context code
 * (service worker, side panel) may import this — a content script would write
 * into the host page's origin database instead of ours.
 */

let db: BridgeDatabase | null = null;

function getDb(): BridgeDatabase {
  db ??= createDatabase();
  return db;
}

// --- Attachments (file sandbox) ---

export async function saveAttachment(
  meta: Omit<CapturedAttachmentMeta, 'id' | 'sha256'>,
  bytes: Uint8Array,
): Promise<CapturedAttachmentMeta> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');

  const existing = await getDb()
    .attachments.where('sha256')
    .equals(sha256)
    .and((a) => a.conversationKey === meta.conversationKey)
    .first();
  if (existing) return toMeta(existing);

  const record = {
    id: crypto.randomUUID(),
    name: meta.name,
    mime: meta.mime,
    size: meta.size,
    sha256,
    sourcePlatform: meta.sourcePlatform,
    conversationKey: meta.conversationKey,
    createdAt: meta.capturedAt,
    blob: new Blob([bytes.slice().buffer], { type: meta.mime }),
  };
  await getDb().attachments.add(record);
  return toMeta(record);
}

export async function listAttachments(conversationKey: string): Promise<CapturedAttachmentMeta[]> {
  const records = await getDb().attachments.where('conversationKey').equals(conversationKey).toArray();
  return records.map(toMeta);
}

export async function getAttachment(
  id: string,
): Promise<{ meta: CapturedAttachmentMeta; blob: Blob } | null> {
  const record = await getDb().attachments.get(id);
  return record ? { meta: toMeta(record), blob: record.blob } : null;
}

function toMeta(record: {
  id: string;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  sourcePlatform: PlatformId;
  conversationKey: string;
  createdAt: string;
}): CapturedAttachmentMeta {
  return {
    id: record.id,
    name: record.name,
    mime: record.mime,
    size: record.size,
    sha256: record.sha256,
    sourcePlatform: record.sourcePlatform,
    conversationKey: record.conversationKey,
    capturedAt: record.createdAt,
  };
}

// --- Archive ---

export async function saveConversation(conversation: BridgeConversation): Promise<void> {
  const now = new Date().toISOString();
  await getDb().conversations.put({
    id: conversation.id,
    sourcePlatform: conversation.sourcePlatform,
    title: conversation.title ?? firstLine(conversation),
    createdAt: conversation.createdAt,
    updatedAt: now,
    data: serializeConversation(conversation),
  });
}

export async function getConversation(id: string): Promise<BridgeConversation | null> {
  const record = await getDb().conversations.get(id);
  return record ? parseConversation(JSON.parse(record.data)) : null;
}

/** Naive local full-text search; empty query returns the most recent entries. */
export async function searchConversations(query: string, limit = 20): Promise<ArchiveHit[]> {
  const needle = query.trim().toLowerCase();
  const records = await getDb().conversations.orderBy('updatedAt').reverse().toArray();
  const hits: ArchiveHit[] = [];
  for (const record of records) {
    if (hits.length >= limit) break;
    if (!needle) {
      hits.push({ id: record.id, sourcePlatform: record.sourcePlatform, title: record.title, snippet: '', updatedAt: record.updatedAt });
      continue;
    }
    const conversation = parseConversation(JSON.parse(record.data));
    const match = conversation.messages.find((m) => m.content.toLowerCase().includes(needle));
    if (match || record.title.toLowerCase().includes(needle)) {
      hits.push({
        id: record.id,
        sourcePlatform: record.sourcePlatform,
        title: record.title,
        snippet: match ? snippetAround(match.content, needle) : '',
        updatedAt: record.updatedAt,
      });
    }
  }
  return hits;
}

// --- Fork lineage ---

export async function recordFork(lineage: ForkLineage, targetPlatform: PlatformId): Promise<void> {
  await getDb().forks.add({
    id: crypto.randomUUID(),
    sourceConversationId: lineage.sourceConversationId,
    sourcePlatform: lineage.sourcePlatform,
    targetPlatform,
    cutIndex: lineage.cutIndex,
    createdAt: new Date().toISOString(),
  });
}

function firstLine(conversation: BridgeConversation): string {
  const text = conversation.messages[0]?.content ?? '';
  return text.split('\n')[0]?.slice(0, 80) || conversation.id;
}

function snippetAround(content: string, needle: string): string {
  const idx = content.toLowerCase().indexOf(needle);
  const start = Math.max(0, idx - 40);
  return `${start > 0 ? '…' : ''}${content.slice(start, idx + needle.length + 60)}…`;
}
