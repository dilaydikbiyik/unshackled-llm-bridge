/**
 * Dragging a conversation out of the page, the way a window is dragged to the
 * second monitor: you pick the thing up here and let go of it over there.
 *
 * The receiving side needs to know nothing about this extension, because what
 * lands on it is an ordinary file drop. Chrome's `DownloadURL` entry is what
 * makes that possible: a dragged element can declare a file, and the drop
 * target — another tab, another window, another browser, or a desktop app —
 * receives it exactly as if it had come from the file system.
 *
 * A `text/plain` copy rides along for targets that take dropped text but not
 * dropped files, so the gesture does something sensible wherever it is let go.
 */
export interface DraggedConversation {
  fileName: string;
  /** The transcript, as the dropped file's contents. */
  fileText: string;
  /** What a text-accepting target receives instead: the whole package. */
  plainText: string;
}

export const DRAG_MIME = 'text/markdown';

/**
 * Fills a dragstart's dataTransfer. Returns the object URL to revoke when the
 * drag ends — the file is held in memory until then.
 */
export function setDragPayload(
  dataTransfer: DataTransfer,
  dragged: DraggedConversation,
  createUrl: (blob: Blob) => string = URL.createObjectURL,
): string {
  const url = createUrl(new Blob([dragged.fileText], { type: DRAG_MIME }));
  dataTransfer.effectAllowed = 'copy';
  // `mime:filename:url` — Chrome's format, and the whole trick.
  dataTransfer.setData('DownloadURL', `${DRAG_MIME}:${dragged.fileName}:${url}`);
  dataTransfer.setData('text/plain', dragged.plainText);
  return url;
}
