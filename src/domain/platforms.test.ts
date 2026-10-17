import { afterEach, describe, expect, it } from 'vitest';
import {
  BUILT_IN_PLATFORM_IDS,
  detectPlatform,
  isBuiltIn,
  isPlatformId,
  knownPlatforms,
  platformInfo,
  platformLabel,
  registerCustomSites,
  siteIdForHost,
} from './platforms';

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
  afterEach(() => {
    registerCustomSites([]);
  });

  it('has an entry for every built-in id', () => {
    for (const id of BUILT_IN_PLATFORM_IDS) {
      expect(platformInfo(id).id).toBe(id);
      expect(platformInfo(id).hosts.length).toBeGreaterThan(0);
    }
  });

  it('opens new chats over https only', () => {
    for (const id of BUILT_IN_PLATFORM_IDS) {
      expect(platformInfo(id).newChatUrl).toMatch(/^https:\/\//);
    }
  });
});

/**
 * The point of the registry: a site the user adds is the same kind of thing as
 * a built-in one. Nothing downstream asks which is which.
 */
describe('user-added sites', () => {
  const perplexity = {
    id: siteIdForHost('perplexity.ai'),
    label: 'Perplexity',
    hosts: ['perplexity.ai'],
    newChatUrl: 'https://perplexity.ai/',
    acceptsFileUpload: true,
    heuristic: true,
  };

  afterEach(() => {
    registerCustomSites([]);
  });

  it('is detected on its own host, exactly like a built-in', () => {
    registerCustomSites([perplexity]);
    expect(detectPlatform('perplexity.ai')).toBe('site:perplexity.ai');
    expect(detectPlatform('www.perplexity.ai')).toBe('site:perplexity.ai');
  });

  it('respects the same dot boundary, so a look-alike host is still rejected', () => {
    registerCustomSites([perplexity]);
    expect(detectPlatform('notperplexity.ai')).toBeNull();
    expect(detectPlatform('perplexity.ai.attacker.example')).toBeNull();
  });

  it('appears in the list the UI offers as a fork target', () => {
    registerCustomSites([perplexity]);
    expect(knownPlatforms().map((site) => site.id)).toContain('site:perplexity.ai');
  });

  it('replaces the previous set without disturbing the built-ins', () => {
    registerCustomSites([perplexity]);
    registerCustomSites([]);
    expect(detectPlatform('perplexity.ai')).toBeNull();
    expect(detectPlatform('claude.ai')).toBe('claude');
  });

  it('is distinguishable from a built-in where that matters', () => {
    expect(isBuiltIn('claude')).toBe(true);
    expect(isBuiltIn('site:perplexity.ai')).toBe(false);
  });

  it('keeps an archived conversation readable after its site is removed', () => {
    // The record outlives the site list; losing it would be worse than
    // showing a plain label.
    expect(platformLabel('site:perplexity.ai')).toBe('perplexity.ai');
    expect(isPlatformId('site:perplexity.ai')).toBe(true);
  });

  it('rejects a stored value that names nothing', () => {
    expect(isPlatformId('site:')).toBe(false);
    expect(isPlatformId('bogus')).toBe(false);
    expect(isPlatformId(42)).toBe(false);
  });
});

/**
 * Two models running on the same machine differ only by port. Matching on the
 * hostname alone made the second one answer to the first one's identity — its
 * label, its relay history, and a return trip opening the wrong port.
 */
describe('sites that share a hostname', () => {
  afterEach(() => {
    registerCustomSites([]);
  });

  const local = (port: string, label: string) => ({
    id: `site:localhost:${port}` as const,
    label,
    hosts: [`localhost:${port}`],
    newChatUrl: `http://localhost:${port}/`,
    acceptsFileUpload: false,
    heuristic: true,
  });

  it('identifies each by its port', () => {
    registerCustomSites([local('11434', 'Ollama'), local('3000', 'Open WebUI')]);

    expect(detectPlatform('localhost:11434')).toBe('site:localhost:11434');
    expect(detectPlatform('localhost:3000')).toBe('site:localhost:3000');
  });

  it('claims nothing on a port the user never added', () => {
    registerCustomSites([local('11434', 'Ollama')]);
    expect(detectPlatform('localhost:8080')).toBeNull();
  });

  it('still matches a plain domain on any port', () => {
    expect(detectPlatform('chatgpt.com')).toBe('chatgpt');
    expect(detectPlatform('www.chatgpt.com')).toBe('chatgpt');
  });

  it('still rejects a look-alike host', () => {
    expect(detectPlatform('evilclaude.ai')).toBeNull();
    expect(detectPlatform('claude.ai.attacker.example')).toBeNull();
  });
});
