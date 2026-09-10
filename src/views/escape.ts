/**
 * Shared by both view surfaces (side panel and in-page shadow DOM). Every
 * interpolation into an HTML template string goes through this — conversation
 * text, file names and persona text are all user-controlled, and the in-page
 * views render inside pages we do not control.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
