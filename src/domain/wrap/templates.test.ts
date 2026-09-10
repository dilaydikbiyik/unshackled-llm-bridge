import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@domain/conversation/schema';
import { wrapForTarget } from './templates';

const messages: ChatMessage[] = [
  { role: 'user', content: 'How do I center a div?', index: 0, attachmentRefs: [] },
  { role: 'assistant', content: 'Use flexbox.', index: 1, attachmentRefs: [] },
];

describe('structural wrapping', () => {
  it('uses XML-style sectioning for Claude', () => {
    const output = wrapForTarget({ sourcePlatform: 'chatgpt', messages }, 'claude');
    expect(output).toContain('<conversation>');
    expect(output).toContain('<message role="user">');
    expect(output).toContain('conversation I had with ChatGPT');
  });

  it('uses markdown sectioning for ChatGPT and Gemini', () => {
    for (const target of ['chatgpt', 'gemini'] as const) {
      const output = wrapForTarget({ sourcePlatform: 'claude', messages }, target);
      expect(output).toContain('## Previous conversation context');
      expect(output).not.toContain('<conversation>');
    }
  });

  it('carries the source model so the target knows what produced the answers', () => {
    const output = wrapForTarget({ sourcePlatform: 'chatgpt', model: 'GPT-5', messages }, 'claude');
    expect(output).toContain('model: GPT-5');
  });

  it('marks elided messages instead of dropping them silently', () => {
    const output = wrapForTarget(
      { sourcePlatform: 'chatgpt', messages, trimmedCount: 7 },
      'claude',
    );
    expect(output).toContain('7 earlier messages omitted');
  });

  it('replaces the transcript entirely when a summary is supplied', () => {
    const output = wrapForTarget(
      { sourcePlatform: 'chatgpt', messages, summary: 'User wants CSS centering help.' },
      'claude',
    );
    expect(output).toContain('User wants CSS centering help.');
    expect(output).not.toContain('How do I center a div?');
  });

  it('includes the persona only when one is supplied', () => {
    const withPersona = wrapForTarget(
      { sourcePlatform: 'chatgpt', messages, personaText: 'I prefer terse answers.' },
      'claude',
    );
    expect(withPersona).toContain('<about_me>');
    expect(wrapForTarget({ sourcePlatform: 'chatgpt', messages }, 'claude')).not.toContain(
      '<about_me>',
    );
  });
});
