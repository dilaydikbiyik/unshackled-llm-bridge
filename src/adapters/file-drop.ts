/**
 * File replay uses a synthetic drag-and-drop rather than driving the
 * platforms' hidden file inputs: every one of them supports drop uploads, and
 * a drop survives their input markup changing.
 */

/** The event sequence platforms listen for. A bare `drop` is often ignored. */
export const DROP_SEQUENCE = ['dragenter', 'dragover', 'drop'] as const;

export function createFileTransfer(blob: Blob, name: string): DataTransfer {
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(new File([blob], name, { type: blob.type }));
  return dataTransfer;
}

export function dispatchFileDrop(target: Element, dataTransfer: DataTransfer): void {
  for (const type of DROP_SEQUENCE) {
    target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer }));
  }
}
