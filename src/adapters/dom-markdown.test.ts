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

describe('DOM → markdown — images', () => {
  it('marks an image where it stood instead of dropping it', () => {
    expect(md('<p>see <img src="x" alt="chart.png"> here</p>')).toBe('see [image: chart.png] here');
  });

  it('marks an image with no alt text generically', () => {
    expect(md('<img src="x">')).toBe('[image]');
  });

  it('still drops icon images that sit inside UI controls', () => {
    expect(md('<p>text<button><img alt="copy icon"></button></p>')).toBe('text');
  });
});

/**
 * Found on the first real fork (2026-10-05): Gemini renders every user turn
 * twice — once visibly, once as `h5.cdk-visually-hidden` reading "Siz şunu
 * dediniz: …" for screen readers. The transferred package carried the label
 * and the message twice over.
 */
describe('extractMarkdown — accessibility-only nodes', () => {
  it('drops a visually hidden screen-reader duplicate of the message', () => {
    const el = document.createElement('div');
    el.innerHTML =
      '<h5 class="cdk-visually-hidden screen-reader-user-query-label">Siz şunu dediniz: slmcnm</h5>' +
      '<p>slmcnm</p>';
    expect(extractMarkdown(el)).toBe('slmcnm');
  });

  it('drops aria-hidden chrome and sr-only text, keeping what is on screen', () => {
    const el = document.createElement('div');
    el.innerHTML =
      '<span class="sr-only">Assistant said:</span>' +
      '<span aria-hidden="true">★</span>' +
      '<span hidden>draft</span>' +
      '<p>Visible answer</p>';
    expect(extractMarkdown(el)).toBe('Visible answer');
  });

  it('keeps a class that merely contains the word, like “screenshot”', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p class="screenshot-caption">Kept</p>';
    expect(extractMarkdown(el)).toBe('Kept');
  });
});

/**
 * Found by pointing the generic adapter at a local model UI (2026-10-08). The
 * three built-in platforms generate their markup without indentation, so the
 * source's own whitespace never showed up in a transcript. A hand-written page
 * indents, and every one of those spaces was arriving as text.
 */
describe('extractMarkdown — whitespace in the source', () => {
  it('does not carry the markup’s indentation into the transcript', () => {
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="msg bot">Here is the shape:
        <pre><code class="language-rust">let x = 1;</code></pre>
        The guard releases the lock.
      </div>`;

    const output = extractMarkdown(el);
    expect(output).not.toMatch(/\n {2,}/);
    expect(output).toContain('```rust\nlet x = 1;\n```');
    expect(output).toContain('The guard releases the lock.');
  });

  it('keeps the code block’s own whitespace, which is content', () => {
    const el = document.createElement('div');
    el.innerHTML =
      '<pre><code class="language-python">def f():\n    return 1\n</code></pre>';
    expect(extractMarkdown(el)).toContain('def f():\n    return 1');
  });

  it('still separates words that were split across source lines', () => {
    const el = document.createElement('div');
    el.innerHTML = '<p>one\n        two</p>';
    expect(extractMarkdown(el)).toBe('one two');
  });
});
