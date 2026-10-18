import bundledConfig from '../../../config/selectors.json';
import type { PlatformId } from '@domain/platforms';

/**
 * DOM selectors are config, not code: a platform UI change is fixed by a
 * remote config push instead of waiting out a store review cycle.
 * Each target has an ordered list of candidate selectors, tried in order.
 */
export interface SelectorConfig {
  version: number;
  minExtensionVersion: string;
  platforms: Partial<Record<PlatformId, PlatformSelectors>>;
}

export type PlatformSelectors = Record<string, string[]>;

export interface SelectorMatch {
  element: Element;
  /** Which candidate selector matched — feeds the health check diagnostics. */
  matched: string;
}

const REMOTE_URL =
  'https://raw.githubusercontent.com/dilaydikbiyik/unshackled-llm-bridge/main/config/selectors.json';
const CACHE_KEY = 'selector-config-cache';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // re-check remote at most every 6h

interface CachedConfig {
  config: SelectorConfig;
  etag: string | null;
  fetchedAt: number;
}

/**
 * Remote-first with bundled fallback. Fetches ONLY this repo's selectors.json
 * — never conversation data. Any failure degrades to the bundled copy, so the
 * extension keeps working offline.
 */
/**
 * How long the fetch may take before the page is given what is already known.
 *
 * The content script waits on this before it mounts anything, so a request
 * that hangs — a captive portal, a blocked host, a slow network — left the
 * extension looking dead on the page. Selector repairs can wait; the fork
 * button cannot.
 */
export const CONFIG_FETCH_TIMEOUT_MS = 4000;

export async function loadSelectorConfig(): Promise<SelectorConfig> {
  const bundled = bundledConfig as SelectorConfig;
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return bundled; // test env

  let cached: CachedConfig | undefined;
  try {
    const stored = await chrome.storage.local.get(CACHE_KEY);
    cached = stored[CACHE_KEY] as CachedConfig | undefined;

    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return newest(bundled, cached.config);
    }

    const headers: HeadersInit = cached?.etag ? { 'If-None-Match': cached.etag } : {};
    const response = await fetch(REMOTE_URL, {
      headers,
      signal: AbortSignal.timeout(CONFIG_FETCH_TIMEOUT_MS),
    });

    if (response.status === 304 && cached) {
      await chrome.storage.local.set({ [CACHE_KEY]: { ...cached, fetchedAt: Date.now() } });
      return newest(bundled, cached.config);
    }
    if (!response.ok) throw new Error(`remote config HTTP ${response.status}`);

    const remote = validateSelectorConfig(await response.json());
    await chrome.storage.local.set({
      [CACHE_KEY]: {
        config: remote,
        etag: response.headers.get('etag'),
        fetchedAt: Date.now(),
      } satisfies CachedConfig,
    });
    return newest(bundled, remote);
  } catch {
    // A failed refresh is not a reason to forget what was already fetched.
    // Returning the bundled config here would undo a repair the user had
    // already received — the one thing the remote config exists to deliver —
    // the moment their network went down.
    return cached ? newest(bundled, cached.config) : bundled;
  }
}

/** A stale remote config must never downgrade a newer bundled one. */
function newest(bundled: SelectorConfig, remote: SelectorConfig): SelectorConfig {
  return remote.version >= bundled.version ? remote : bundled;
}

/** Every leaf must be a list of strings; anything else rejects the whole file. */
export function validateSelectorConfig(raw: unknown): SelectorConfig {
  const fail = (why: string): never => {
    throw new Error(`remote selector config rejected: ${why}`);
  };
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) fail('not an object');
  const obj = raw as Record<string, unknown>;
  if (typeof obj['version'] !== 'number') fail('version must be a number');
  const platforms = obj['platforms'];
  if (typeof platforms !== 'object' || platforms === null || Array.isArray(platforms)) {
    fail('platforms must be an object');
  }
  for (const [platform, targets] of Object.entries(platforms as Record<string, unknown>)) {
    if (typeof targets !== 'object' || targets === null || Array.isArray(targets)) {
      fail(`${platform} must map targets to selector lists`);
    }
    for (const [target, list] of Object.entries(targets as Record<string, unknown>)) {
      if (!Array.isArray(list) || list.some((s) => typeof s !== 'string' || s.length > 500)) {
        fail(`${platform}.${target} must be a list of selector strings`);
      }
    }
  }
  return raw as SelectorConfig;
}

/**
 * The config is remote input. A syntactically invalid candidate makes
 * querySelector throw, which would take down the whole content script — so a
 * bad candidate is skipped and the next one is tried, as if it matched nothing.
 */
function safeQueryAll(root: ParentNode, selector: string): Element[] {
  try {
    return [...root.querySelectorAll(selector)];
  } catch {
    return [];
  }
}

export function resolveSelector(
  root: ParentNode,
  candidates: string[] | undefined,
): SelectorMatch | null {
  for (const selector of candidates ?? []) {
    const [element] = safeQueryAll(root, selector);
    if (element) return { element, matched: selector };
  }
  return null;
}

export function resolveSelectorAll(root: ParentNode, candidates: string[] | undefined): Element[] {
  for (const selector of candidates ?? []) {
    const elements = safeQueryAll(root, selector);
    if (elements.length > 0) return elements;
  }
  return [];
}
