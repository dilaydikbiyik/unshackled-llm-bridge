import { describe, expect, it } from 'vitest';
import { t, type StringKey } from './i18n';

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

  it('keeps the privacy promise present in both languages', () => {
    // This string is the product's core claim; losing it in a translation
    // would quietly drop the thing the extension is built to promise.
    expect(t('tr', 'privacyNote')).toMatch(/tarayıcıda kalır/);
    expect(t('en', 'privacyNote')).toMatch(/never leaves this browser/);
  });
});
