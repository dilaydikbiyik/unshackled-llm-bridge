import Dexie, { type EntityTable } from 'dexie';
import type { PlatformId } from '@shared/platforms';

export interface ConversationRecord {
  id: string;
  sourcePlatform: PlatformId;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** Serialized BridgeConversation JSON (see models/conversation/serializer). */
  data: string;
}

export interface AttachmentRecord {
  id: string;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  sourcePlatform: PlatformId;
  /** `${platform}:${pathname}` — the conversation the file was captured in. */
  conversationKey: string;
  createdAt: string;
  blob: Blob;
}

/** Fork lineage: which conversation spawned which, and where it was cut. */
export interface ForkRecord {
  id: string;
  sourceConversationId: string;
  sourcePlatform: PlatformId;
  targetPlatform: PlatformId;
  cutIndex: number;
  createdAt: string;
}

export type BridgeDatabase = Dexie & {
  conversations: EntityTable<ConversationRecord, 'id'>;
  attachments: EntityTable<AttachmentRecord, 'id'>;
  forks: EntityTable<ForkRecord, 'id'>;
};

export function createDatabase(name = 'unshackled-bridge'): BridgeDatabase {
  const db = new Dexie(name) as BridgeDatabase;
  db.version(1).stores({
    conversations: 'id, sourcePlatform, updatedAt',
    attachments: 'id, sha256, sourcePlatform, conversationKey',
    forks: 'id, sourceConversationId, createdAt',
  });
  return db;
}
