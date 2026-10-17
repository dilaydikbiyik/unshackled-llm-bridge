// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import selectorConfig from '../../config/selectors.json';
import type { SelectorConfig } from '@data/config/selector-config';
import { ChatGptAdapter } from './chatgpt/adapter';
import { ClaudeAdapter } from './claude/adapter';
import { GeminiAdapter } from './gemini/adapter';
import { GenericAdapter } from './generic/adapter';
import { createAdapter } from './registry';

const config = selectorConfig as SelectorConfig;

/**
 * The switch that decides how a site is read. Its default case is what makes
 * the extension universal: a site nobody wrote an adapter for is not a missing
 * case, it is the ordinary one.
 */
describe('createAdapter', () => {
  it('gives each built-in platform its maintained adapter', () => {
    expect(createAdapter('chatgpt', config)).toBeInstanceOf(ChatGptAdapter);
    expect(createAdapter('claude', config)).toBeInstanceOf(ClaudeAdapter);
    expect(createAdapter('gemini', config)).toBeInstanceOf(GeminiAdapter);
  });

  it('reads a site the user added with the generic adapter', () => {
    const adapter = createAdapter('site:perplexity.ai', config);
    expect(adapter).toBeInstanceOf(GenericAdapter);
    expect(adapter.platform).toBe('site:perplexity.ai');
  });

  it('never returns nothing — an unknown site has a reader, not a gap', () => {
    expect(createAdapter('site:anything.example', config)).not.toBeNull();
  });

  it('hands each built-in its own selectors', () => {
    // A platform reading another's selectors would fail in a way no unit test
    // of the adapter itself would catch.
    expect(createAdapter('claude', config).capabilities.readConversation).toBe(true);
    expect(createAdapter('site:x.ai', config).capabilities.readModelMode).toBe(false);
  });
});
