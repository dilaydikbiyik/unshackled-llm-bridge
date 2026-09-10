export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function el<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`missing element: ${selector}`);
  return found;
}

/** Momentary "Saved ✓" style feedback on a button. */
export function flash(button: HTMLButtonElement, message: string): void {
  const original = button.textContent ?? '';
  button.textContent = message;
  setTimeout(() => {
    button.textContent = original;
  }, 1600);
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
