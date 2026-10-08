import { describe, expect, it } from 'vitest';
import { hostnameOf, isAddableHost, isLocalHost, matchPatternFor, siteInfos } from './sites';

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
    // `localhost` used to be rejected here for having no dot. It is the one
    // dotless name that means something, and rejecting it shut out every
    // local model UI — see the local-model tests below.
    expect(isAddableHost('')).toBe(false);
    expect(isAddableHost('.example.com')).toBe(false);
    expect(isAddableHost('example..com')).toBe(false);
    expect(isAddableHost('intranet')).toBe(false);
  });

  it('builds a pattern covering the site and nothing else', () => {
    expect(matchPatternFor('perplexity.ai')).toBe('https://perplexity.ai/*');
  });
});

/**
 * A local model UI is the case where "any AI site" stops being a slogan. They
 * speak http and live on a port — Ollama on 11434, Open WebUI on 3000, LM
 * Studio on 1234 — and under an https-only, dot-requiring rule not one of them
 * could be added at all.
 */
describe('local model UIs', () => {
  it('accepts localhost, with or without a port', () => {
    expect(isAddableHost('localhost')).toBe(true);
    expect(isAddableHost('localhost:3000')).toBe(true);
    expect(isAddableHost('127.0.0.1:11434')).toBe(true);
  });

  it('asks for http, since nothing local is served over https', () => {
    expect(matchPatternFor('localhost:11434')).toBe('http://localhost/*');
    expect(matchPatternFor('127.0.0.1:1234')).toBe('http://127.0.0.1/*');
  });

  it('drops the port from the pattern, which Chrome does not accept', () => {
    // One grant covers every port on the machine, which is also what a user
    // running several models at once would expect.
    expect(matchPatternFor('localhost:3000')).toBe(matchPatternFor('localhost:8080'));
  });

  it('keeps the port in the address, so a new chat opens where the model is', () => {
    const [info] = siteInfos([{ host: 'localhost:11434', label: 'Ollama' }]);
    expect(info?.newChatUrl).toBe('http://localhost:11434/');
    expect(info?.hosts).toEqual(['localhost']);
  });

  it('still asks for https everywhere else', () => {
    expect(matchPatternFor('perplexity.ai')).toBe('https://perplexity.ai/*');
    expect(siteInfos([{ host: 'perplexity.ai', label: '' }])[0]?.newChatUrl).toBe(
      'https://perplexity.ai/',
    );
  });

  it('knows which hosts are this machine', () => {
    expect(isLocalHost('localhost')).toBe(true);
    expect(isLocalHost('app.localhost')).toBe(true);
    expect(isLocalHost('127.0.0.1')).toBe(true);
    expect(isLocalHost('notlocalhost.com')).toBe(false);
  });

  it('rejects a port that is not a port', () => {
    expect(isAddableHost('localhost:abc')).toBe(false);
    expect(isAddableHost('localhost:3000:80')).toBe(false);
    expect(isAddableHost('localhost:999999')).toBe(false);
  });

  it('separates hostname from port without tripping over either', () => {
    expect(hostnameOf('localhost:3000')).toBe('localhost');
    expect(hostnameOf('perplexity.ai')).toBe('perplexity.ai');
  });
});
