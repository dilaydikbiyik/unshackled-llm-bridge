import type { PlatformAdapter } from '@adapters/types';
import { MAX_ATTACHMENT_BYTES } from '@domain/attachments';
import type { PlatformId } from '@domain/platforms';
import { base64ToBlob, blobToBase64 } from '@shared/base64';
import { sendToBackground, type AttachmentPayload, type MessageOf } from '@shared/messages';

/**
 * File sandbox, capture and replay. The user's own uploads — through the file
 * input or by drag-and-drop — are mirrored into the local store so they can be
 * replayed on another platform.
 *
 * Only `isTrusted` events are captured: our own replay drops are synthetic,
 * so a replayed file can never loop back into the store.
 */
export function conversationKey(platform: string): string {
  return `${platform}:${location.pathname}`;
}

type SendCapture = (message: MessageOf<'attachment/capture'>) => Promise<unknown>;
type FetchAttachment = (id: string) => Promise<AttachmentPayload | null>;

export function mountAttachmentCapture(adapter: PlatformAdapter): () => void {
  const onChange = (event: Event) => {
    if (!event.isTrusted) return;
    const input = event.target as HTMLInputElement | null;
    if (input?.type !== 'file' || !input.files) return;
    for (const file of input.files) void captureFile(adapter.platform, file);
  };

  const onDrop = (event: DragEvent) => {
    if (!event.isTrusted) return;
    for (const file of event.dataTransfer?.files ?? []) void captureFile(adapter.platform, file);
  };

  document.addEventListener('change', onChange, true);
  document.addEventListener('drop', onDrop, true);
  return () => {
    document.removeEventListener('change', onChange, true);
    document.removeEventListener('drop', onDrop, true);
  };
}

/** Mirrors one user-uploaded file into the sandbox. Returns false when it was skipped. */
export async function captureFile(
  platform: PlatformId,
  file: File,
  send: SendCapture = sendToBackground,
): Promise<boolean> {
  if (file.size > MAX_ATTACHMENT_BYTES) return false;
  await send({
    type: 'attachment/capture',
    meta: {
      name: file.name,
      mime: file.type || 'application/octet-stream',
      size: file.size,
      sourcePlatform: platform,
      conversationKey: conversationKey(platform),
      capturedAt: new Date().toISOString(),
    },
    dataBase64: await blobToBase64(file),
  });
  return true;
}

/** Platforms process uploads one at a time; the replay is paced so their UI keeps up. */
export const REPLAY_GAP_MS = 600;

const fetchFromSandbox: FetchAttachment = (id) => sendToBackground({ type: 'attachment/get', id });
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Replays stored files through the adapter's drop path. Returns how many arrived. */
export async function replayAttachments(
  adapter: PlatformAdapter,
  attachmentIds: string[],
  fetchAttachment: FetchAttachment = fetchFromSandbox,
  sleep: (ms: number) => Promise<void> = wait,
): Promise<number> {
  let replayed = 0;
  for (const id of attachmentIds) {
    const stored = await fetchAttachment(id);
    if (!stored) continue;
    await adapter.uploadFile(base64ToBlob(stored.dataBase64, stored.meta.mime), stored.meta.name);
    replayed += 1;
    await sleep(REPLAY_GAP_MS);
  }
  return replayed;
}
