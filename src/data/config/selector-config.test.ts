// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import bundled from '../../../config/selectors.json';
import { resolveSelector, resolveSelectorAll, validateSelectorConfig } from './selector-config';

describe('selector resolution — hostile or broken config', () => {
  it('skips a malformed candidate instead of throwing', () => {
    document.body.innerHTML = '<div id="ok"></div>';
    // Unbalanced bracket: querySelector throws a SyntaxError on this.
    expect(resolveSelector(document, ['div[broken', '#ok'])?.matched).toBe('#ok');
    expect(resolveSelectorAll(document, ['div[broken', '#ok'])).toHaveLength(1);
  });

  it('returns nothing, rather than throwing, when every candidate is malformed', () => {
    expect(resolveSelector(document, ['[[', '::nope('])).toBeNull();
    expect(resolveSelectorAll(document, ['[['])).toEqual([]);
  });
});

describe('remote config validation', () => {
  it('accepts the bundled config', () => {
    expect(() => validateSelectorConfig(bundled)).not.toThrow();
  });

  it.each([
    ['a non-object', 'selectors'],
    ['a missing version', { platforms: {} }],
    ['platforms as an array', { version: 9, platforms: [] }],
    ['a target that is not a list', { version: 9, platforms: { claude: { composer: '#x' } } }],
    ['a non-string candidate', { version: 9, platforms: { claude: { composer: [42] } } }],
    [
      'an absurdly long candidate',
      { version: 9, platforms: { claude: { composer: ['a'.repeat(501)] } } },
    ],
  ])('rejects %s', (_label, raw) => {
    expect(() => validateSelectorConfig(raw)).toThrow(/rejected/);
  });
});
