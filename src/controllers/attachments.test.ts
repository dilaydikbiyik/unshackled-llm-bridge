// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlatformAdapter } from '@adapters/types';
import { base64ToBytes, bytesToBase64 } from '@shared/base64';
import {
  captureFile,
  conversationKey,
  mountAttachmentCapture,
  replayAttachments,
  REPLAY_GAP_MS,
  storeGeneratedFile,
} from './attachments';

vi.mock('@domain/attachments', () => ({ MAX_ATTACHMENT_BYTES: 8 }));

afterEach(() => {
  vi.unstubAllGlobals();
  history.pushState({}, '', '/');
});

describe('capture', () => {
  it('sends the file with its metadata, keyed to the current conversation', async () => {
    history.pushState({}, '', '/c/abc');
    const send = vi.fn(async () => undefined);
    const file = new File([new Uint8Array([1, 2, 3])], 'notes.txt', { type: 'text/plain' });

    expect(await captureFile('chatgpt', file, send)).toBe(true);
    const [message] = send.mock.calls[0] as unknown as [
      { meta: Record<string, unknown>; dataBase64: string },
    ];
    expect(message.meta).toMatchObject({
      name: 'notes.txt',
      mime: 'text/plain',
      size: 3,
      sourcePlatform: 'chatgpt',
      conversationKey: 'chatgpt:/c/abc',
    });
    expect(base64ToBytes(message.dataBase64)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('labels a file with no type as a generic binary', async () => {
    const send = vi.fn(async () => undefined);
    await captureFile('claude', new File(['x'], 'blob'), send);
    expect(send.mock.calls[0]).toEqual([
      expect.objectContaining({ meta: expect.objectContaining({ mime: 'application/octet-stream' }) }),
    ]);
  });

  it('skips a file over the size cap', async () => {
    const send = vi.fn(async () => undefined);
    expect(await captureFile('gemini', new File([new Uint8Array(9)], 'big.bin'), send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('ignores synthetic events, so a replayed file is never captured again', () => {
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    const stop = mountAttachmentCapture({ platform: 'chatgpt' } as PlatformAdapter);

    const transfer = new DataTransfer();
    transfer.items.add(new File(['x'], 'replayed.txt'));
    document.body.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
    document.body.dispatchEvent(new Event('change', { bubbles: true }));

    expect(sendMessage).not.toHaveBeenCalled();
    stop();
  });

  it('derives the conversation key from the platform and path', () => {
    history.pushState({}, '', '/chat/xyz');
    expect(conversationKey('claude')).toBe('claude:/chat/xyz');
  });
});

describe('replay', () => {
  const payload = (id: string, name: string) => ({
    meta: {
      id,
      name,
      mime: 'text/plain',
      size: 1,
      sha256: id,
      sourcePlatform: 'chatgpt' as const,
      conversationKey: 'k',
      capturedAt: 't',
    },
    dataBase64: bytesToBase64(new Uint8Array([65])),
  });

  it('uploads each stored file in order, skipping ones that are gone, paced between uploads', async () => {
    const uploaded: string[] = [];
    const adapter = {
      uploadFile: vi.fn(async (_blob: Blob, name: string) => {
        uploaded.push(name);
      }),
    } as unknown as PlatformAdapter;
    const stored: Record<string, ReturnType<typeof payload>> = {
      a: payload('a', 'first.txt'),
      c: payload('c', 'third.txt'),
    };
    const sleep = vi.fn(async () => undefined);

    const count = await replayAttachments(
      adapter,
      ['a', 'b', 'c'],
      async (id) => stored[id] ?? null,
      sleep,
    );

    expect(count).toBe(2);
    expect(uploaded).toEqual(['first.txt', 'third.txt']);
    expect(sleep).toHaveBeenCalledWith(REPLAY_GAP_MS);
  });
});

describe('generated context file', () => {
  it('stores the transcript as markdown and returns its id for the transfer', async () => {
    history.pushState({}, '', '/c/abc');
    const sent: { meta: { mime: string; name: string } }[] = [];
    const send = vi.fn(async (message: unknown) => {
      sent.push(message as { meta: { mime: string; name: string } });
      return { id: 'ctx-1' };
    });
    const id = await storeGeneratedFile('chatgpt', 'chatgpt-conversation.md', 'hi', send);

    expect(id).toBe('ctx-1');
    expect(sent[0]?.meta.mime).toBe('text/markdown');
    expect(sent[0]?.meta.name).toBe('chatgpt-conversation.md');
  });

  it('refuses a transcript past the size cap rather than storing a truncated one', async () => {
    const send = vi.fn(async () => ({ id: 'ctx-1' }));
    // The mocked cap is 8 bytes.
    expect(await storeGeneratedFile('chatgpt', 'c.md', 'x'.repeat(50), send)).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });
});
