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
