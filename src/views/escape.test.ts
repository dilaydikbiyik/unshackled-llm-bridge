import { describe, expect, it } from 'vitest';
import { escapeHtml } from './escape';

/**
 * Every view interpolates user-controlled text — conversation content, file
 * names, persona text — into HTML template strings, and the in-page views
 * render inside pages we do not control. This is the single chokepoint.
 */
describe('escapeHtml', () => {
  it('neutralizes a script tag', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('escapes both quote styles so attribute contexts stay safe', () => {
    // File names and persona text land inside value="…" attributes.
    expect(escapeHtml('" onerror="x')).toBe('&quot; onerror=&quot;x');
    expect(escapeHtml("' onerror='x")).toBe('&#39; onerror=&#39;x');
  });

  it('escapes ampersands first, so escaping is not double-applied', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('leaves ordinary text — including non-Latin scripts — untouched', () => {
    expect(escapeHtml('Merhaba, düğün çiçeği')).toBe('Merhaba, düğün çiçeği');
    expect(escapeHtml('')).toBe('');
  });
});
