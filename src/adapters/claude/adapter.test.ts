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
