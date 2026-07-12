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

/**
 * Returns the bundled selector config.
 * TODO(phase-1.1): fetch remote config (repo-hosted JSON) with ETag caching
 * and fall back to this bundled copy on failure. Config fetch only — never
 * conversation data.
 */
export async function loadSelectorConfig(): Promise<SelectorConfig> {
  return bundledConfig as SelectorConfig;
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
