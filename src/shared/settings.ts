import type { Lang } from './i18n';
import { chromeStore, type KeyValueStore } from './storage';

export interface Persona {
  id: string;
  name: string;
  text: string;
}

/**
 * A site the user taught the extension about. Only the host is required: the
 * generic adapter needs no selectors, and the label is for the user's benefit.
 */
export interface CustomSiteSetting {
  host: string;
  label: string;
}

export interface Settings {
  language: Lang;
  /**
   * Sites beyond the three built-in ones. Each needs host permission, granted
   * per site by the user — this extension never asks for access to the web.
   */
  customSites: CustomSiteSetting[];
  /** Opt-in passive archiving of visited conversations (local only). */
  archiveEnabled: boolean;
  /** BYO key for summarize-on-fork; stored only in chrome.storage.local, never synced. */
  anthropicApiKey: string;
  summaryModel: string;
  personas: Persona[];
  activePersonaId: string | null;
  onboardingDone: boolean;
}

// Cheap by default; the user can switch to Opus in settings.
export const SUMMARY_MODELS = ['claude-haiku-4-5', 'claude-opus-4-8'] as const;

export const DEFAULT_SETTINGS: Settings = {
  language: 'tr',
  customSites: [],
  archiveEnabled: false,
  anthropicApiKey: '',
  summaryModel: SUMMARY_MODELS[0],
  personas: [],
  activePersonaId: null,
  onboardingDone: false,
};

const KEY = 'settings';

let store: KeyValueStore | null = null;
const settingsStore = (): KeyValueStore => (store ??= chromeStore('local'));

/** Routes settings through another store — the seam unit tests use. */
export function useSettingsStore(next: KeyValueStore): void {
  store = next;
}

export async function getSettings(): Promise<Settings> {
  const stored = await settingsStore().get<Partial<Settings>>(KEY);
  // Stored settings are merged over defaults, so a field added in a later
  // version gets its default instead of `undefined` for existing users.
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await settingsStore().set(KEY, next);
  return next;
}

export function activePersona(settings: Settings): Persona | null {
  return settings.personas.find((p) => p.id === settings.activePersonaId) ?? null;
}
