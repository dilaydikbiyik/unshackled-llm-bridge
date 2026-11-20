import { afterEach, describe, expect, it } from 'vitest';
import { createTranslation, detectLanguage, translationAvailability } from './on-device';

const g = globalThis as Record<string, unknown>;
afterEach(() => {
  delete g['Translator'];
  delete g['LanguageDetector'];
});

describe('on-device translation', () => {
  it('says unavailable where the browser has no translator, instead of failing', async () => {
    expect(await translationAvailability('tr', 'en')).toBe('unavailable');
    expect(await createTranslation('tr', 'en')).toBeNull();
  });

  it('translates each distinct text once', async () => {
    let calls = 0;
    g['Translator'] = {
      availability: async () => 'available',
      create: async () => ({ translate: async (t: string) => (calls++, `EN:${t}`) }),
    };
    const translate = (await createTranslation('tr', 'en'))!;
    expect(await translate('merhaba')).toBe('EN:merhaba');
    await translate('merhaba');
    expect(calls).toBe(1);
  });

  it('gives null when the model cannot be created (no user gesture, policy)', async () => {
    g['Translator'] = { availability: async () => 'downloadable', create: async () => Promise.reject(new Error('NotAllowedError')) };
    expect(await createTranslation('tr', 'en')).toBeNull();
  });
});

describe('detectLanguage', () => {
  it('uses Chrome’s detector when it is confident', async () => {
    g['LanguageDetector'] = {
      availability: async () => 'available',
      create: async () => ({ detect: async () => [{ detectedLanguage: 'de', confidence: 0.9 }] }),
    };
    expect(await detectLanguage('Guten Tag')).toBe('de');
  });

  it('recognises Turkish by its letters where there is no detector', async () => {
    expect(await detectLanguage('Şemayı nasıl sadeleştiririm, örnek verir misin?')).toBe('tr');
    expect(await detectLanguage('How do I simplify the scheme?')).toBeNull();
  });
});
