import { describe, expect, it } from 'vitest';
import { isAddableHost, matchPatternFor, siteInfos } from './sites';

describe('siteInfos', () => {
  it('turns a saved site into a registry entry', () => {
    const [info] = siteInfos([{ host: 'perplexity.ai', label: 'Perplexity' }]);

    expect(info?.id).toBe('site:perplexity.ai');
    expect(info?.label).toBe('Perplexity');
    expect(info?.hosts).toEqual(['perplexity.ai']);
    expect(info?.heuristic).toBe(true);
  });

  it('falls back to the host when the user named nothing', () => {
    expect(siteInfos([{ host: 'chat.example.com', label: '' }])[0]?.label).toBe('chat.example.com');
  });

  it('does not claim file uploads it cannot know about', () => {
    // Claiming it would strand a transfer: a continuation note would arrive
    // with no conversation attached.
    expect(siteInfos([{ host: 'x.ai', label: 'Grok' }])[0]?.acceptsFileUpload).toBe(false);
  });
});

describe('isAddableHost', () => {
  it('accepts an ordinary hostname', () => {
    expect(isAddableHost('perplexity.ai')).toBe(true);
    expect(isAddableHost('chat.example.co.uk')).toBe(true);
  });

  it('rejects anything that would widen the permission being requested', () => {
    // These become a match pattern, so a wildcard or a path here would ask the
    // user to grant far more than the site in front of them.
    expect(isAddableHost('*')).toBe(false);
    expect(isAddableHost('*.example.com')).toBe(false);
    expect(isAddableHost('example.com/*')).toBe(false);
    expect(isAddableHost('example.com/../other')).toBe(false);
    expect(isAddableHost('https://example.com')).toBe(false);
  });

  it('rejects a malformed host', () => {
    expect(isAddableHost('')).toBe(false);
    expect(isAddableHost('localhost')).toBe(false);
    expect(isAddableHost('.example.com')).toBe(false);
    expect(isAddableHost('example..com')).toBe(false);
  });

  it('builds a pattern covering the site and nothing else', () => {
    expect(matchPatternFor('perplexity.ai')).toBe('https://perplexity.ai/*');
  });
});
