import type { PlatformAdapter } from '@adapters/types';
import { sendToBackground, type AttachmentGetResponse } from '@shared/messages';

/**
 * File sandbox capture side. Listens for the user's own uploads — both the
 * file-input path and drag-and-drop — and mirrors each file into the local
 * store so it can be replayed on another platform.
 *
 * Only `isTrusted` events are captured: our own replay drops are synthetic,
 * so this can never loop a file back into the store.
 */
export function conversationKey(platform: string): string {
  return `${platform}:${location.pathname}`;
}

export function mountAttachmentCapture(adapter: PlatformAdapter): () => void {
  const onChange = (event: Event) => {
    if (!event.isTrusted) return;
    const input = event.target as HTMLInputElement | null;
    if (input?.type !== 'file' || !input.files) return;
    for (const file of input.files) void capture(adapter.platform, file);
  };

  const onDrop = (event: DragEvent) => {
    if (!event.isTrusted) return;
    for (const file of event.dataTransfer?.files ?? []) void capture(adapter.platform, file);
  };

  document.addEventListener('change', onChange, true);
  document.addEventListener('drop', onDrop, true);
  return () => {
    document.removeEventListener('change', onChange, true);
    document.removeEventListener('drop', onDrop, true);
  };
}

/** Files above this are skipped — IndexedDB quota is not worth a 200MB video. */
const MAX_CAPTURE_BYTES = 25 * 1024 * 1024;

async function capture(platform: string, file: File): Promise<void> {
  if (file.size > MAX_CAPTURE_BYTES) return;
  const dataBase64 = await blobToBase64(file);
  await sendToBackground({
    type: 'attachment/capture',
    meta: {
      name: file.name,
      mime: file.type || 'application/octet-stream',
      size: file.size,
      sourcePlatform: platform as never,
      conversationKey: conversationKey(platform),
      capturedAt: new Date().toISOString(),
    },
    dataBase64,
  });
}

/** Replays stored files into the current page via the adapter's drop path. */
export async function replayAttachments(
  adapter: PlatformAdapter,
  attachmentIds: string[],
): Promise<void> {
  for (const id of attachmentIds) {
    const stored = await sendToBackground<AttachmentGetResponse>({ type: 'attachment/get', id });
    if (!stored) continue;
    const blob = base64ToBlob(stored.dataBase64, stored.meta.mime);
    await adapter.uploadFile(blob, stored.meta.name);
    // Platforms process uploads one at a time; pace the replay so the UI keeps up.
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes.buffer], { type: mime });
}
