import { describe, expect, it } from 'vitest';
import { STRINGS, t, type StringKey } from './i18n';

/**
 * The catalogs must stay in lockstep. A key added to one language and not the
 * other is invisible until a user switches language and sees an English string
 * in a Turkish UI — so it is checked here instead.
 */
const KEYS: StringKey[] = [
  'appTitle',
  'privacyNote',
  'onboardTitle',
  'statusSection',
  'compareSection',
  'personaSection',
  'archiveSection',
  'settingsSection',
  'forkTitle',
  'forkTransfer',
  'injectFailed',
];

describe('i18n catalogs', () => {
  it('resolves every sampled key in both languages', () => {
    for (const key of KEYS) {
      expect(t('tr', key), `tr:${key}`).toBeTruthy();
      expect(t('en', key), `en:${key}`).toBeTruthy();
    }
  });

  it('actually translates rather than falling through to English', () => {
    expect(t('tr', 'forkTransfer')).not.toBe(t('en', 'forkTransfer'));
    expect(t('tr', 'settingsSave')).toBe('Kaydet');
  });

  // Caught on the first real install (2026-10-05): the side panel rendered
  // "1. 1. Open a conversation…", because the steps carried their own numbers
  // and <ol> numbers them again. Markers belong to the list, not the copy.
  it('leaves list numbering to the list, in both languages', () => {
    for (const lang of ['tr', 'en'] as const) {
      for (const key of ['onboardStep1', 'onboardStep2', 'onboardStep3'] as const) {
        expect(t(lang, key)).not.toMatch(/^\s*\d+[.)]/);
      }
    }
  });

  it('keeps the privacy promise present in both languages', () => {
    // This string is the product's core claim; losing it in a translation
    // would quietly drop the thing the extension is built to promise.
    expect(t('tr', 'privacyNote')).toMatch(/tarayıcıda kalır/);
    expect(t('en', 'privacyNote')).toMatch(/never leaves this browser/);
  });
});

describe('catalog parity — every key, not a sample', () => {
  // The existing test samples keys. A translation added to one catalog and
  // forgotten in the other falls straight through a sample.
  it('has exactly the same keys in both languages', () => {
    const trKeys = Object.keys(STRINGS.tr).sort();
    const enKeys = Object.keys(STRINGS.en).sort();

    expect(enKeys.filter((key) => !trKeys.includes(key))).toEqual([]);
    expect(trKeys.filter((key) => !enKeys.includes(key))).toEqual([]);
  });

  it('leaves no string empty in either language', () => {
    for (const [lang, catalog] of Object.entries(STRINGS)) {
      for (const [key, value] of Object.entries(catalog)) {
        expect(value.trim(), `${lang}.${key}`).not.toBe('');
      }
    }
  });

  it('keeps every placeholder in the translation', () => {
    // A dropped {percent} or {file} renders as a sentence missing its subject.
    for (const [key, english] of Object.entries(STRINGS.en)) {
      const placeholders = [...english.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      const turkish = (STRINGS.tr as Record<string, string>)[key] ?? '';
      const theirs = [...turkish.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      expect(theirs, key).toEqual(placeholders);
    }
  });
});
