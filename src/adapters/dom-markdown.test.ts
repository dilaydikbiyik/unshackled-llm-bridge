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

  it('renders unordered lists as bullets and ordered lists as numbers', () => {
    // This test used to assert that an ordered list came out as bullets —
    // the bug written down as the specification. Step-by-step instructions
    // are the commonest shape of an answer, and their order is the point.
    expect(md('<ul><li>a</li><li>b</li></ul>')).toBe('- a\n- b');
    expect(md('<ol><li>first</li><li>second</li></ol>')).toBe('1. first\n2. second');
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

describe('extractMarkdown — blank-looking lines', () => {
  // Seen against a real local model UI: the whitespace between block elements
  // collapsed to a single space and then stood alone on its own line, on both
  // sides of every code block.
  it('leaves no line holding only a space', () => {
    const el = document.createElement('div');
    el.innerHTML = `
      <p>Here it is:</p>
      <pre><code class="language-rust">let x = 1;</code></pre>
      <p>That is all.</p>`;

    const output = extractMarkdown(el);
    expect(output.split('\n').every((line) => line === line.trimEnd())).toBe(true);
    expect(output).not.toMatch(/\n \n/);
    expect(output).toBe('Here it is:\n\n```rust\nlet x = 1;\n```\n\nThat is all.');
  });
})

/**
 * What an assistant's answer actually contains in 2026. Run against the
 * extractor, almost all of it came out wrong: a comparison table became a run
 * of cell text, a formula came out twice and mangled, numbered steps lost their
 * order, and a struck-through "var" read as a recommendation for it.
 */
describe('extractMarkdown — modern answer content', () => {
  it('keeps a table as a table', () => {
    const out = md(
      '<table><thead><tr><th>Model</th><th>Context</th></tr></thead>' +
        '<tbody><tr><td>GPT</td><td>128k</td></tr><tr><td>Claude</td><td>200k</td></tr></tbody></table>',
    );
    expect(out).toBe('| Model | Context |\n| --- | --- |\n| GPT | 128k |\n| Claude | 200k |');
  });

  it('pads a ragged row and escapes a pipe inside a cell', () => {
    const out = md('<table><tr><th>a</th><th>b</th></tr><tr><td>x|y</td></tr></table>');
    expect(out).toBe('| a | b |\n| --- | --- |\n| x\\|y |  |');
  });

  it('carries a formula once, as the TeX its author wrote', () => {
    const out = md(
      '<p>Energy is <span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi>E</mi>' +
        '</mrow><annotation encoding="application/x-tex">E=mc^2</annotation></semantics></math></span>' +
        '<span class="katex-html" aria-hidden="true">E=mc2</span></span>.</p>',
    );
    expect(out).toBe('Energy is $E=mc^2$.');
  });

  it('keeps a display formula on its own line', () => {
    const out = md(
      '<span class="katex-display"><span class="katex"><math><semantics><mrow></mrow>' +
        '<annotation encoding="application/x-tex">\\int_0^1 x\\,dx</annotation></semantics></math></span></span>',
    );
    expect(out).toBe('$$\\int_0^1 x\\,dx$$');
  });

  it('keeps nesting in a list', () => {
    const out = md('<ul><li>Fruits<ul><li>Apple</li><li>Pear</li></ul></li><li>Veg</li></ul>');
    expect(out).toBe('- Fruits\n   - Apple\n   - Pear\n- Veg');
  });

  it('honours an ordered list that does not start at one', () => {
    expect(md('<ol start="3"><li>c</li><li>d</li></ol>')).toBe('3. c\n4. d');
  });

  it('marks a quotation as one', () => {
    expect(md('<blockquote><p>Premature optimization is the root of all evil.</p></blockquote>')).toBe(
      '> Premature optimization is the root of all evil.',
    );
  });

  it('keeps the line through struck-out text', () => {
    expect(md('<p>Use <code>let</code>, not <del>var</del>.</p>')).toBe('Use `let`, not ~~var~~.');
  });

  it('keeps a section break', () => {
    expect(md('<p>Part one</p><hr><p>Part two</p>')).toBe('Part one\n\n---\n\nPart two');
  });
});

/**
 * Seen live on 2026-11-05: ChatGPT ends an answer with questions to pick from.
 * Their radio buttons are dropped as chrome, and the labels were left glued
 * together — "30 dakika1 saat2 saat veya daha fazla".
 */
describe('extractMarkdown — choices inside an answer', () => {
  const group = `
    <div role="radiogroup">
      <div><label for="a">30 dakika</label><div><button role="radio" id="a" aria-checked="true"></button></div></div>
      <div><label for="b">1 saat</label><div><button role="radio" id="b" aria-checked="false"></button></div></div>
      <div><label for="c">2 saat veya daha fazla</label><div><button role="radio" id="c" aria-checked="false"></button></div></div>
    </div>`;

  it('lists each option on its own line', () => {
    expect(md(group)).toBe('- [x] 30 dakika\n- [ ] 1 saat\n- [ ] 2 saat veya daha fazla');
  });

  it('reads an option labelled by aria-label alone', () => {
    const out = md('<div role="radiogroup"><button role="radio" aria-label="Yes" aria-checked="false"></button></div>');
    expect(out).toBe('- [ ] Yes');
  });

  it('keeps the question that precedes the choices', () => {
    const out = md(`<p>3. Günde kaç dakika ayırabilirsin?</p>${group}`);
    expect(out.startsWith('3. Günde kaç dakika ayırabilirsin?\n\n- [x] 30 dakika')).toBe(true);
  });
});
