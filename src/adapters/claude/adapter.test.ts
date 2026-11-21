// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import selectorConfig from '../../../config/selectors.json';
import type { PlatformSelectors } from '@data/config/selector-config';
import { ClaudeAdapter } from './adapter';

/**
 * Fixture mirrors claude.ai DOM as of the selector config version. When a
 * live selector breaks, update config/selectors.json AND this fixture together.
 */
const FIXTURE = `
<main>
  <div data-testid="user-message">
    <p>Design a landing page for me</p>
  </div>
  <div data-is-streaming="false">
    <div class="font-claude-response">
      <p>Here is a first draft, see the artifact:</p>
      <div data-testid="artifact-block"><button>Landing page v1</button></div>
      <p>Key choices are <em>contrast</em> and spacing.</p>
    </div>
    <button>Copy</button>
  </div>
</main>
`;

const selectors = selectorConfig.platforms.claude as PlatformSelectors;

describe('ClaudeAdapter.readConversation', () => {
  beforeEach(() => {
    document.body.innerHTML = FIXTURE;
  });

  // Regression, live check 2026-09-10: the old selector combined user and
  // assistant turns in one rule. When the assistant half broke, the rule still
  // matched user messages, so it looked healthy while dropping every reply.
  it('detects user vs assistant messages', async () => {
    const conversation = await new ClaudeAdapter(selectors).readConversation();
    expect(conversation.sourcePlatform).toBe('claude');
    expect(conversation.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('replaces artifact cells with an explicit marker instead of dropping them', async () => {
    const conversation = await new ClaudeAdapter(selectors).readConversation();
    const assistant = conversation.messages[1]?.content ?? '';
    expect(assistant).toContain('[artifact from Claude — not transferred]');
    expect(assistant).not.toContain('Landing page v1');
    expect(assistant).toContain('*contrast*');
  });

  it('does not mutate the live DOM while marking artifacts', async () => {
    await new ClaudeAdapter(selectors).readConversation();
    expect(document.querySelector("[data-testid='artifact-block']")).not.toBeNull();
  });
});

/**
 * Live markup, checked 2026-11-05: Claude rebuilt its reply markup. Answers are
 * no longer `.font-claude-response`; they are `[data-testid="assistant-message"]`,
 * and the extension was reading the user's side of every conversation and none
 * of Claude's — the same failure as September, back again.
 *
 * The rebuilt turn also leads with a status line from Claude's reasoning and
 * tool use. Reading the whole turn carried it into the package as though it
 * were part of the answer.
 */
const LIVE_FIXTURE_NOV_5 = `
<main>
  <div data-testid="user-message"><p>Microsoft partner programı nedir?</p></div>
  <div data-testid="assistant-message" data-cds="AssistantMessage">
    <div data-cds="TurnStatus"><button>Checking how Microsoft partners are tiered</button>Checking how Microsoft partners are tiered</div>
    <div class="standard-markdown">
      <p>Bu cevap, <strong>Microsoft sertifikaları</strong> üzerine.</p>
      <ol><li>Başvuru</li><li>Onay</li></ol>
    </div>
    <div data-testid="message-actions"><button>Copy</button></div>
  </div>
</main>
`;

describe('ClaudeAdapter.readConversation — live markup, November 5', () => {
  beforeEach(() => {
    document.body.innerHTML = LIVE_FIXTURE_NOV_5;
  });

  it('reads Claude’s answers again, not only the user’s messages', async () => {
    const conversation = await new ClaudeAdapter(selectors).readConversation();
    expect(conversation.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });

  it('leaves the reasoning status line out of the answer', async () => {
    const answer = (await new ClaudeAdapter(selectors).readConversation()).messages[1]?.content ?? '';

    expect(answer).not.toContain('Checking how Microsoft partners');
    expect(answer).toContain('**Microsoft sertifikaları**');
    expect(answer).toContain('1. Başvuru\n2. Onay');
  });
});

describe('ClaudeAdapter.readConversation — both markups at once', () => {
  // Two candidates, one per markup, blocked each other: whichever came first
  // half-matched the other markup through its user-message half, and the
  // fallback never ran. One rule now covers both.
  it('reads the older markup with the same configuration', async () => {
    document.body.innerHTML = `
      <div data-testid="user-message"><p>old question</p></div>
      <div class="font-claude-response"><p>old answer</p></div>`;
    const roles = (await new ClaudeAdapter(selectors).readConversation()).messages.map((m) => m.role);
    expect(roles).toEqual(['user', 'assistant']);
  });

  it('does not read a turn twice when an older marker sits inside a newer one', async () => {
    document.body.innerHTML = `
      <div data-testid="user-message"><p>q</p></div>
      <div data-testid="assistant-message">
        <div class="font-claude-response"><p>one answer</p></div>
      </div>`;
    const messages = (await new ClaudeAdapter(selectors).readConversation()).messages;
    expect(messages).toHaveLength(2);
    expect(messages[1]?.content).toBe('one answer');
  });
});

/**
 * Claude's transcript as seen live (2026-11-20): each message in a row
 * numbered by its place (`data-index`) inside an article that says how many
 * there are ("Message 10 of 18"), and only the rows near the screen in the DOM.
 */
function virtualizedTranscript(total: number) {
  const ROW = 900;
  const VIEWPORT = 800;
  const height = total * ROW;
  document.body.innerHTML = '<main><div class="overflow-y-auto" id="scroller"><div role="feed" id="feed"></div></div></main>';
  const scroller = document.getElementById('scroller')!;
  const feed = document.getElementById('feed')!;
  let scrollTop = height - VIEWPORT;
  const render = () => {
    feed.innerHTML = '';
    for (let i = 0; i < total; i += 1) {
      const top = i * ROW;
      if (top + ROW < scrollTop - 100 || top > scrollTop + VIEWPORT + 100) continue;
      const user = i % 2 === 0;
      const row = document.createElement('div');
      row.setAttribute('data-testid', 'transcript-row');
      row.setAttribute('data-index', String(i));
      row.innerHTML = `<div role="article" aria-setsize="${String(total)}" aria-posinset="${String(i + 1)}">${
        user
          ? `<div data-testid="user-message"><p>soru ${String(i)}</p></div><div data-testid="user-message-actions"><button aria-label="Show message actions">⋯</button></div>`
          : `<div data-testid="assistant-message"><p>cevap ${String(i)}</p><div data-testid="message-actions"><button aria-label="Copy">c</button></div></div>`
      }</div>`;
      const turn = row.querySelector('[data-testid$="-message"]')!;
      turn.getBoundingClientRect = () => ({ top: top - scrollTop, bottom: top + ROW - scrollTop }) as DOMRect;
      feed.append(row);
    }
  };
  Object.defineProperty(scroller, 'scrollTop', {
    get: () => scrollTop,
    set: (v: number) => {
      scrollTop = Math.max(0, Math.min(v, height - VIEWPORT));
      render();
    },
  });
  Object.defineProperty(scroller, 'scrollHeight', { get: () => height });
  Object.defineProperty(scroller, 'clientHeight', { get: () => VIEWPORT });
  scroller.style.overflowY = 'auto';
  scroller.getBoundingClientRect = () => ({ top: 0, bottom: VIEWPORT }) as DOMRect;
  render();
}

describe('ClaudeAdapter.readConversation — a long, virtualized transcript', () => {
  it('reads all of it when asked, in order, without the action bars', async () => {
    virtualizedTranscript(8);
    const partial = await new ClaudeAdapter(selectors).readConversation();
    expect(partial.messages.length).toBeLessThan(8);

    const whole = await new ClaudeAdapter(selectors).readConversation({ complete: true });
    expect(whole.messages.map((m) => `${m.role}:${m.content}`)).toEqual(
      Array.from({ length: 8 }, (_, i) => (i % 2 === 0 ? `user:soru ${String(i)}` : `assistant:cevap ${String(i)}`)),
    );
  }, 20_000);

  it('finds the action bar of a prompt beside it and of a reply inside it', () => {
    virtualizedTranscript(4);
    const adapter = new ClaudeAdapter(selectors);
    const turns = adapter.locateTurns();
    const bars = turns.map((t) => adapter.locateActionBar(t)?.getAttribute('data-testid'));
    expect(bars).toContain('user-message-actions');
    expect(bars).toContain('message-actions');
  });
});

/**
 * Seen live (2026-11-21): a prompt that is only a file — a long paste Claude
 * turned into "Pasted text.txt" — has no user-message element, only a file
 * card, and was left out: the fork carried 25 of 26 messages, and the reply
 * after it answered nothing anyone could see.
 */
const FILE_ONLY_PROMPT = `
<div role="feed">
  <div data-testid="transcript-row" data-index="0" data-perf-row="human">
    <div data-testid="user-message"><p>Şu metni özetle</p></div>
    <div data-testid="user-message-actions"><button aria-label="Show message actions">⋯</button></div>
  </div>
  <div data-testid="transcript-row" data-index="1" data-perf-row="assistant">
    <div data-testid="assistant-message"><p>Metni bekliyorum.</p></div>
  </div>
  <div data-testid="transcript-row" data-index="2" data-perf-row="human">
    <div data-testid="file-thumbnail"><span>Pasted text.txt</span><span>TXT</span></div>
    <div data-testid="user-message-actions"><button aria-label="Show message actions">⋯</button></div>
    <div data-testid="failed-send-status-region"></div>
  </div>
  <div data-testid="transcript-row" data-index="3" data-perf-row="assistant">
    <div data-testid="assistant-message"><p>Özet: üç ana fikir var.</p></div>
  </div>
</div>`;

describe('ClaudeAdapter.readConversation — a prompt that is only a file', () => {
  beforeEach(() => {
    document.body.innerHTML = FILE_ONLY_PROMPT;
  });

  it('reads it as the user’s turn, naming the file, in its place', async () => {
    const conversation = await new ClaudeAdapter(selectors).readConversation();
    expect(conversation.messages.map((m) => `${m.role}: ${m.content}`)).toEqual([
      'user: Şu metni özetle',
      'assistant: Metni bekliyorum.',
      'user: [attached file: Pasted text.txt]',
      'assistant: Özet: üç ana fikir var.',
    ]);
  });

  it('gives it a Fork in its own action bar', () => {
    const adapter = new ClaudeAdapter(selectors);
    const fileTurn = adapter.locateTurns()[2]!;
    expect(adapter.locateActionBar(fileTurn)?.getAttribute('data-testid')).toBe('user-message-actions');
  });
});
