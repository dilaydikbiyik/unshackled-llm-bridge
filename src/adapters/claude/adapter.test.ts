// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import selectorConfig from '../../../config/selectors.json';
import type { PlatformSelectors } from '@models/config/selector-config';
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
  <div class="font-claude-message">
    <p>Here is a first draft, see the artifact:</p>
    <div data-testid="artifact-block"><button>Landing page v1</button></div>
    <p>Key choices are <em>contrast</em> and spacing.</p>
  </div>
</main>
`;

const selectors = selectorConfig.platforms.claude as PlatformSelectors;

describe('ClaudeAdapter.readConversation', () => {
  beforeEach(() => {
    document.body.innerHTML = FIXTURE;
  });

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
