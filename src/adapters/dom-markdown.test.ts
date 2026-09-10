// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { extractMarkdown } from './dom-markdown';

function md(html: string): string {
  const root = document.createElement('div');
  root.innerHTML = html;
  return extractMarkdown(root);
}

describe('DOM → markdown', () => {
  it('renders headings at their level', () => {
    expect(md('<h2>Plan</h2><h3>Step one</h3>')).toBe('## Plan\n\n### Step one');
  });

  it('renders ordered and unordered lists as bullet items', () => {
    expect(md('<ul><li>a</li><li>b</li></ul>')).toBe('- a\n- b');
    expect(md('<ol><li>first</li></ol>')).toBe('- first');
  });

  it('keeps line breaks', () => {
    expect(md('<p>one<br>two</p>')).toBe('one\ntwo');
  });

  it('keeps http links as markdown links', () => {
    expect(md('<a href="https://example.com">docs</a>')).toBe('[docs](https://example.com)');
  });

  it('reduces non-http links to their text, so javascript: URLs never survive', () => {
    // The package is pasted into another platform; a live `javascript:` link
    // in transferred content would be a gift to an attacker.
    expect(md('<a href="javascript:alert(1)">click</a>')).toBe('click');
    expect(md('<a href="/relative">rel</a>')).toBe('rel');
  });

  it('fences code blocks with their language and drops copy-button chrome', () => {
    const out = md(
      '<pre><button>Copy</button><code class="language-ts">const x = 1;\n</code></pre>',
    );
    expect(out).toBe('```ts\nconst x = 1;\n```');
  });

  it('fences a bare <pre> with no language', () => {
    expect(md('<pre>plain</pre>')).toBe('```\nplain\n```');
  });

  it('never leaks UI chrome into content', () => {
    expect(md('<p>text<svg><title>icon</title></svg><style>.x{}</style><script>x()</script></p>')).toBe(
      'text',
    );
  });

  it('collapses runs of blank lines', () => {
    expect(md('<p>a</p><p></p><p></p><p>b</p>')).toBe('a\n\nb');
  });

  it('degrades unknown wrappers to their text instead of losing it', () => {
    expect(md('<custom-el><span>kept</span></custom-el>')).toBe('kept');
  });
});
