import { registerCustomSites, siteIdForHost, type PlatformInfo } from '@domain/platforms';
import { getSettings, type CustomSiteSetting } from './settings';

/**
 * Turns the user's saved sites into registry entries. Every context — content
 * script, side panel, service worker — does this at startup, which is what
 * makes a user-added site indistinguishable from a built-in one everywhere
 * downstream.
 */
export function siteInfos(sites: readonly CustomSiteSetting[]): PlatformInfo[] {
  return sites.map((site) => ({
    id: siteIdForHost(site.host),
    label: site.label || site.host,
    hosts: [site.host],
    // Without site knowledge the home page is the best guess at a new chat.
    newChatUrl: `https://${site.host}/`,
    // Unknowable in advance, and claiming it falsely would strand a transfer
    // with a note and no conversation. The dialog degrades to inline text.
    acceptsFileUpload: false,
    heuristic: true,
  }));
}

/** Loads the user's sites into the registry for this context. */
export async function loadRegisteredSites(): Promise<PlatformInfo[]> {
  const infos = siteInfos((await getSettings()).customSites);
  registerCustomSites(infos);
  return infos;
}

/** The match pattern a site needs for its host permission and content script. */
export function matchPatternFor(host: string): string {
  return `https://${host}/*`;
}

/**
 * A host this extension may be asked to add. Rejects anything that is not a
 * plain hostname, so a stored value cannot widen the permission being
 * requested into a pattern that covers the web.
 */
export function isAddableHost(host: string): boolean {
  if (!/^[a-z0-9.-]+$/i.test(host)) return false;
  if (host.startsWith('.') || host.endsWith('.') || host.includes('..')) return false;
  return host.includes('.');
}
