import { beforeEach, describe, expect, it } from 'vitest';
import {
  activePersona,
  DEFAULT_SETTINGS,
  getSettings,
  updateSettings,
  useSettingsStore,
} from './settings';
import { memoryStore } from './storage';

beforeEach(() => {
  useSettingsStore(memoryStore());
});

describe('settings', () => {
  it('returns the defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps archiving off and the API key empty by default — both are opt-in', () => {
    expect(DEFAULT_SETTINGS.archiveEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.anthropicApiKey).toBe('');
  });

  it('merges stored values over defaults, so a field added later gets its default', async () => {
    useSettingsStore(memoryStore({ settings: { language: 'en' } }));
    const settings = await getSettings();
    expect(settings.language).toBe('en');
    expect(settings.summaryModel).toBe(DEFAULT_SETTINGS.summaryModel);
    expect(settings.personas).toEqual([]);
  });

  it('persists a patch without dropping the other fields', async () => {
    await updateSettings({ language: 'en' });
    await updateSettings({ archiveEnabled: true });
    const settings = await getSettings();
    expect(settings.language).toBe('en');
    expect(settings.archiveEnabled).toBe(true);
  });
});

describe('activePersona', () => {
  const personas = [
    { id: 'a', name: 'Work', text: 'terse' },
    { id: 'b', name: 'Study', text: 'explain' },
  ];

  it('returns the persona the user made active', () => {
    expect(activePersona({ ...DEFAULT_SETTINGS, personas, activePersonaId: 'b' })?.name).toBe('Study');
  });

  it('returns null when none is active, or the active one was deleted', () => {
    expect(activePersona({ ...DEFAULT_SETTINGS, personas, activePersonaId: null })).toBeNull();
    expect(activePersona({ ...DEFAULT_SETTINGS, personas, activePersonaId: 'gone' })).toBeNull();
  });
});
