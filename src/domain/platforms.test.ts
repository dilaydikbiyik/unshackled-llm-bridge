import { describe, expect, it } from 'vitest';
import { detectPlatform, PLATFORM_IDS, PLATFORMS } from './platforms';

describe('platform detection', () => {
  it('recognizes each supported host', () => {
    expect(detectPlatform('chatgpt.com')).toBe('chatgpt');
    expect(detectPlatform('claude.ai')).toBe('claude');
    expect(detectPlatform('gemini.google.com')).toBe('gemini');
  });

  it('accepts subdomains of a supported host', () => {
    expect(detectPlatform('www.chatgpt.com')).toBe('chatgpt');
  });

  it('rejects look-alike hosts — suffix matching must respect the dot boundary', () => {
    // A naive `endsWith('claude.ai')` would let an attacker-registered domain
    // run the content script's logic against their own page.
    expect(detectPlatform('evilclaude.ai')).toBeNull();
    expect(detectPlatform('notchatgpt.com')).toBeNull();
    expect(detectPlatform('claude.ai.attacker.example')).toBeNull();
  });

  it('returns null for an unrelated host', () => {
    expect(detectPlatform('example.com')).toBeNull();
  });
});

describe('platform registry', () => {
  it('has an entry for every declared platform id', () => {
    for (const id of PLATFORM_IDS) {
      expect(PLATFORMS[id].id).toBe(id);
      expect(PLATFORMS[id].hosts.length).toBeGreaterThan(0);
    }
  });

  it('opens new chats over https only', () => {
    for (const id of PLATFORM_IDS) {
      expect(PLATFORMS[id].newChatUrl).toMatch(/^https:\/\//);
    }
  });
});
