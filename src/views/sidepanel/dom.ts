export function el<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`missing element: ${selector}`);
  return found;
}

/** Momentary "Saved ✓" style feedback on a button. */
export function flash(button: HTMLButtonElement, message: string, ms = 1600): void {
  const original = button.textContent ?? '';
  button.textContent = message;
  setTimeout(() => {
    button.textContent = original;
  }, ms);
}

/**
 * Offers text as a file download. The side panel is an extension page, so a
 * blob anchor works here (unlike inside a content script's host page).
 */
export function downloadText(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
