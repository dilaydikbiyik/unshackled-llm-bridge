import { registerCustomSites, siteIdForHost, type PlatformInfo } from '@domain/platforms';
import { getSettings, type CustomSiteSetting } from './settings';

/**
 * Turns the user's saved sites into registry entries. Every context — content
 * script, side panel, service worker — does this at startup, which is what
 * makes a user-added site indistinguishable from a built-in one everywhere
 * downstream.
 */
/**
 * Hosts served from the machine itself. They speak http, not https, which is
 * the whole reason this distinction exists: a local model UI is the case where
 * "any AI site" stops being a slogan, and it would have been unreachable under
 * an https-only rule.
 */
export function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  );
}

/** The hostname alone. A stored host may carry a port, which is not part of it. */
export function hostnameOf(host: string): string {
  return host.split(':')[0] ?? host;
}

export function schemeFor(host: string): 'http' | 'https' {
  return isLocalHost(hostnameOf(host)) ? 'http' : 'https';
}

export function siteInfos(sites: readonly CustomSiteSetting[]): PlatformInfo[] {
  return sites.map((site) => ({
    id: siteIdForHost(site.host),
    label: site.label || site.host,
    hosts: [hostnameOf(site.host)],
    // Keeps the port: a local UI lives on one, and a new chat opened without
    // it would land nowhere.
    newChatUrl: `${schemeFor(site.host)}://${site.host}/`,
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

/**
 * The match pattern a site needs for its host permission and content script.
 * Chrome's patterns carry no port — `http://localhost/*` covers every port on
 * the machine — so the port is dropped here and kept only for addresses.
 */
export function matchPatternFor(host: string): string {
  return `${schemeFor(host)}://${hostnameOf(host)}/*`;
}

/**
 * A host this extension may be asked to add. Rejects anything that is not a
 * plain hostname with an optional port, so a stored value cannot widen the
 * permission being requested into a pattern that covers the web.
 */
export function isAddableHost(host: string): boolean {
  const [hostname, port, ...rest] = host.split(':');
  if (!hostname || rest.length > 0) return false;
  if (port !== undefined && !/^\d{1,5}$/.test(port)) return false;
  if (!/^[a-z0-9.-]+$/i.test(hostname)) return false;
  if (hostname.startsWith('.') || hostname.endsWith('.') || hostname.includes('..')) return false;
  // A dotless name is only meaningful on this machine; elsewhere it would be a
  // pattern with no registrable domain behind it.
  return hostname.includes('.') || isLocalHost(hostname);
}
