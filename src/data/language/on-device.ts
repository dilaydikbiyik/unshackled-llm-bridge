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

const api = () =>
  globalThis as unknown as { Translator?: TranslatorStatic; LanguageDetector?: DetectorStatic };

/** Whether this pair can be translated here, and whether a model must download first. */
export async function translationAvailability(source: string, target: string): Promise<Availability> {
  const { Translator } = api();
  if (!Translator) return 'unavailable';
  try {
    return await Translator.availability({ sourceLanguage: source, targetLanguage: target });
  } catch {
    return 'unavailable';
  }
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
  let instance: TranslatorInstance;
  try {
    instance = await Translator.create({
      sourceLanguage: source,
      targetLanguage: target,
      ...(onProgress
        ? { monitor: (m: MonitorTarget) => m.addEventListener('downloadprogress', (e) => onProgress(e.loaded)) }
        : {}),
    });
  } catch {
    return null;
  }
  const done = new Map<string, Promise<string>>();
  return (text) => {
    if (!done.has(text)) done.set(text, instance.translate(text));
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
    try {
      if ((await LanguageDetector.availability()) === 'available') {
        const detector = await LanguageDetector.create();
        const [best] = await detector.detect(text);
        if (best && best.confidence >= 0.6) return best.detectedLanguage.split('-')[0] ?? null;
      }
    } catch {
      // Fall through to the heuristic.
    }
  }
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  const turkish = text.match(/[ğĞışŞİçÇöÖüÜ]/g)?.length ?? 0;
  return letters > 0 && turkish / letters > 0.01 ? 'tr' : null;
}
