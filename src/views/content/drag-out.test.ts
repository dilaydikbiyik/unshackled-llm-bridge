// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { DRAG_MIME, setDragPayload } from './drag-out';

const dragged = {
  fileName: 'gemini-conversation.md',
  fileText: '# transcript\nmsg0',
  plainText: 'whole package',
};

describe('setDragPayload', () => {
  it('declares a real file, so any drop target receives an ordinary file', () => {
    const transfer = new DataTransfer();
    const url = setDragPayload(transfer, dragged, () => 'blob:fake');

    expect(url).toBe('blob:fake');
    expect(transfer.getData('DownloadURL')).toBe(
      `${DRAG_MIME}:gemini-conversation.md:blob:fake`,
    );
  });

  it('carries text as well, for a target that takes dropped text but not files', () => {
    const transfer = new DataTransfer();
    setDragPayload(transfer, dragged, () => 'blob:fake');
    expect(transfer.getData('text/plain')).toBe('whole package');
  });

  it('puts the transcript itself in the dragged file', () => {
    const transfer = new DataTransfer();
    const blobs: Blob[] = [];
    const createUrl = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:fake';
    });
    setDragPayload(transfer, dragged, createUrl);

    expect(blobs[0]?.type).toBe(DRAG_MIME);
    return expect(blobs[0]?.text()).resolves.toContain('msg0');
  });
});
