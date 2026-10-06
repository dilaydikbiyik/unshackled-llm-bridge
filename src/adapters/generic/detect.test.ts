// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { assignRoles, findComposer, findTurns, type Measure } from './detect';

/**
 * happy-dom has no layout, so every rectangle is zero. Boxes come from a
 * `data-box="top,width,height"` attribute instead, which also makes each
 * fixture state its own geometry where it can be read.
 */
const measure: Measure = (el) => {
  const [top = 0, width = 100, height = 20] = (el.dataset['box'] ?? '')
    .split(',')
    .map(Number)
    .filter((n) => !Number.isNaN(n));
  return { top, width, height };
};

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('findComposer', () => {
  it('finds a contenteditable box no selector knows about', () => {
    document.body.innerHTML = `<div id="c" contenteditable="true" data-box="500,400,40"></div>`;
    expect(findComposer(document, measure)?.id).toBe('c');
  });

  it('finds a textarea just as well', () => {
    document.body.innerHTML = `<textarea id="t" data-box="500,400,40"></textarea>`;
    expect(findComposer(document, measure)?.id).toBe('t');
  });

  it('takes the lowest box, so a search field at the top is not mistaken for it', () => {
    document.body.innerHTML = `
      <input id="ignored" />
      <div id="search" contenteditable="true" data-box="10,200,30"></div>
      <div id="composer" contenteditable="true" data-box="700,600,50"></div>`;
    expect(findComposer(document, measure)?.id).toBe('composer');
  });

  it('ignores a hidden editor, which is how some sites park an unused one', () => {
    document.body.innerHTML = `
      <div id="hidden" contenteditable="true" data-box="900,0,0"></div>
      <div id="real" contenteditable="true" data-box="700,600,50"></div>`;
    expect(findComposer(document, measure)?.id).toBe('real');
  });

  it('says so, rather than guessing, when there is nothing to type into', () => {
    document.body.innerHTML = `<p data-box="10,100,20">just a page</p>`;
    expect(findComposer(document, measure)).toBeNull();
  });

  it('skips a read-only textarea: it is a transcript, not a composer', () => {
    document.body.innerHTML = `<textarea readonly data-box="700,600,50"></textarea>`;
    expect(findComposer(document, measure)).toBeNull();
  });
});

describe('findTurns', () => {
  it('reads a conversation on a site it has never seen', () => {
    document.body.innerHTML = `
      <nav data-box="0,200,40"><a data-box="0,60,20">Home</a><a data-box="0,60,20">New</a></nav>
      <main data-box="100,800,600">
        <div data-box="100,800,40">What is a monad?</div>
        <div data-box="160,800,200">A monad is a monoid in the category of endofunctors, which is
          a sentence that explains nothing until you have seen a few examples.</div>
        <div data-box="400,800,40">Give me one.</div>
        <div data-box="460,800,160">Promise chaining is the one most people have already used.</div>
      </main>`;

    const turns = findTurns(document, measure);
    expect(turns).toHaveLength(4);
    expect(turns[0]?.textContent).toContain('What is a monad?');
    expect(turns[3]?.textContent).toContain('Promise chaining');
  });

  it('prefers the conversation over a sidebar of equal-length links', () => {
    document.body.innerHTML = `
      <aside data-box="0,200,400">
        <a data-box="0,180,20">Chat about cats</a>
        <a data-box="30,180,20">Chat about dogs</a>
        <a data-box="60,180,20">Chat about rats</a>
        <a data-box="90,180,20">Chat about bats</a>
      </aside>
      <main data-box="0,800,600">
        <div data-box="100,800,40">Hi</div>
        <div data-box="160,800,300">A much longer answer, the kind an assistant actually writes,
          running on for several lines and carrying the bulk of the text on the page.</div>
      </main>`;

    const turns = findTurns(document, measure);
    expect(turns.map((t) => t.tagName)).toEqual(['DIV', 'DIV']);
  });

  it('returns nothing on a page with no conversation, instead of inventing one', () => {
    document.body.innerHTML = `<main data-box="0,800,100"><p data-box="0,800,40">Welcome</p></main>`;
    expect(findTurns(document, measure)).toEqual([]);
  });
});

describe('assignRoles', () => {
  it('alternates from the user, because a chat starts with someone asking', () => {
    const turns = [0, 1, 2, 3].map(() => document.createElement('div'));
    expect(assignRoles(turns)).toEqual(['user', 'assistant', 'user', 'assistant']);
  });
});
