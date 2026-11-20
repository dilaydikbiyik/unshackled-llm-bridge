/**
 * Chrome's built-in, on-device translation and language detection.
 *
 * The models run on the user's machine (Chrome 138+): nothing is sent to a
 * translation service, which is the only way translating a conversation fits
 * an extension whose promise is that conversations stay local. Where the API
 * is missing — another browser, an older Chrome, a managed policy — every
 * function here says so rather than failing, and the option is not offered.
 */

export type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

interface TranslatorInstance {
  translate(text: string): Promise<string>;
  destroy?(): void;
}

interface MonitorTarget {
  addEventListener(type: 'downloadprogress', listener: (event: { loaded: number }) => void): void;
}

interface TranslatorStatic {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<Availability>;
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (target: MonitorTarget) => void;
  }): Promise<TranslatorInstance>;
}

interface DetectorStatic {
  availability(): Promise<Availability>;
  create(): Promise<{ detect(text: string): Promise<{ detectedLanguage: string; confidence: number }[]> }>;
}

/**
 * How long a question to the browser's models may take. Seen in CI: where
 * the API exists but its model does not, a call can simply never answer —
 * and the fork dialog, waiting on it, never opened. A question that is not
 * answered in time is answered "no".
 */
export const PROBE_TIMEOUT_MS = 1500;
/** Creating a translator may download a model; past this it is given up on. */
export const CREATE_TIMEOUT_MS = 120_000;
/** One piece of text; a paragraph translates in well under a second. */
export const TRANSLATE_TIMEOUT_MS = 30_000;

/** `promise`, or `fallback` if it has not settled within `ms`. */
export function within<T>(ms: number, promise: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

const api = () =>
  globalThis as unknown as { Translator?: TranslatorStatic; LanguageDetector?: DetectorStatic };

/** Whether this pair can be translated here, and whether a model must download first. */
export async function translationAvailability(source: string, target: string): Promise<Availability> {
  const { Translator } = api();
  if (!Translator) return 'unavailable';
  return within(
    PROBE_TIMEOUT_MS,
    Translator.availability({ sourceLanguage: source, targetLanguage: target }),
    'unavailable',
  );
}

/**
 * A translate function for one pair. Creating it may download the model the
 * first time, which Chrome allows only right after a user gesture — so this
 * is called from the change of the option itself. Repeated texts are
 * translated once.
 */
export async function createTranslation(
  source: string,
  target: string,
  onProgress?: (fraction: number) => void,
): Promise<((text: string) => Promise<string>) | null> {
  const { Translator } = api();
  if (!Translator) return null;
  const instance = await within<TranslatorInstance | null>(
    CREATE_TIMEOUT_MS,
    Translator.create({
      sourceLanguage: source,
      targetLanguage: target,
      ...(onProgress
        ? { monitor: (m: MonitorTarget) => m.addEventListener('downloadprogress', (e) => onProgress(e.loaded)) }
        : {}),
    }),
    null,
  );
  if (!instance) return null;
  const done = new Map<string, Promise<string>>();
  return (text) => {
    // A text the translator does not answer for in time goes untranslated:
    // the original is always a correct thing to send.
    if (!done.has(text)) done.set(text, within(TRANSLATE_TIMEOUT_MS, instance.translate(text), text));
    return done.get(text)!;
  };
}

/**
 * The conversation's language, from what the user wrote. Chrome's detector
 * where it exists; otherwise only Turkish is recognised, by its letters —
 * the case this was built for — and anything else is left undetected.
 */
export async function detectLanguage(sample: string): Promise<string | null> {
  const text = sample.slice(0, 4000);
  if (!text.trim()) return null;
  const { LanguageDetector } = api();
  if (LanguageDetector) {
    const detected = await within(
      PROBE_TIMEOUT_MS,
      (async () => {
        if ((await LanguageDetector.availability()) !== 'available') return null;
        const detector = await LanguageDetector.create();
        const [best] = await detector.detect(text);
        return best && best.confidence >= 0.6 ? (best.detectedLanguage.split('-')[0] ?? null) : null;
      })(),
      null,
    );
    if (detected) return detected;
  }
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  const turkish = text.match(/[ğĞışŞİçÇöÖüÜ]/g)?.length ?? 0;
  return letters > 0 && turkish / letters > 0.01 ? 'tr' : null;
}
