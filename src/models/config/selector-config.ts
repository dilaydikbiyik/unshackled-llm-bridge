import bundledConfig from '../../../config/selectors.json';
import type { PlatformId } from '@shared/platforms';

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
export async function loadSelectorConfig(): Promise<SelectorConfig> {
  const bundled = bundledConfig as SelectorConfig;
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return bundled; // test env

  try {
    const stored = await chrome.storage.local.get(CACHE_KEY);
    const cached = stored[CACHE_KEY] as CachedConfig | undefined;

    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return newest(bundled, cached.config);
    }

    const headers: HeadersInit = cached?.etag ? { 'If-None-Match': cached.etag } : {};
    const response = await fetch(REMOTE_URL, { headers });

    if (response.status === 304 && cached) {
      await chrome.storage.local.set({ [CACHE_KEY]: { ...cached, fetchedAt: Date.now() } });
      return newest(bundled, cached.config);
    }
    if (!response.ok) throw new Error(`remote config HTTP ${response.status}`);

    const remote = validate(await response.json());
    await chrome.storage.local.set({
      [CACHE_KEY]: {
        config: remote,
        etag: response.headers.get('etag'),
        fetchedAt: Date.now(),
      } satisfies CachedConfig,
    });
    return newest(bundled, remote);
  } catch {
    return bundled;
  }
}

/** A stale remote config must never downgrade a newer bundled one. */
function newest(bundled: SelectorConfig, remote: SelectorConfig): SelectorConfig {
  return remote.version >= bundled.version ? remote : bundled;
}

function validate(raw: unknown): SelectorConfig {
  const obj = raw as SelectorConfig;
  if (
    typeof obj !== 'object' ||
    obj === null ||
    typeof obj.version !== 'number' ||
    typeof obj.platforms !== 'object'
  ) {
    throw new Error('remote selector config has an invalid shape');
  }
  return obj;
}

export function resolveSelector(
  root: ParentNode,
  candidates: string[] | undefined,
): SelectorMatch | null {
  for (const selector of candidates ?? []) {
    const element = root.querySelector(selector);
    if (element) return { element, matched: selector };
  }
  return null;
}

export function resolveSelectorAll(root: ParentNode, candidates: string[] | undefined): Element[] {
  for (const selector of candidates ?? []) {
    const elements = root.querySelectorAll(selector);
    if (elements.length > 0) return [...elements];
  }
  return [];
}
