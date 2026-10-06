/**
 * Which sites this extension can bridge.
 *
 * Three of them ship with maintained selectors, because they are the ones most
 * people use. They are not, however, privileged: a site the user adds is the
 * same kind of thing, carried in the same registry, driven by the same
 * adapters. The core never knows which is which, so "works with ChatGPT,
 * Claude and Gemini" is a fact about the default configuration rather than a
 * limit of the design.
 */
export const BUILT_IN_PLATFORM_IDS = ['chatgpt', 'claude', 'gemini'] as const;
export type BuiltInPlatformId = (typeof BUILT_IN_PLATFORM_IDS)[number];

/** A site the user taught the extension about. Prefixed so ids cannot collide. */
export type CustomSiteId = `site:${string}`;
export type PlatformId = BuiltInPlatformId | CustomSiteId;

export interface PlatformInfo {
  id: PlatformId;
  label: string;
  hosts: string[];
  newChatUrl: string;
  /** False disables attachment delivery for this target in the fork dialog. */
  acceptsFileUpload: boolean;
  /**
   * True when the site is read by the heuristics rather than by maintained
   * selectors. Surfaced in the UI: a user-added site is best-effort, and
   * saying so is more useful than letting it fail silently.
   */
  heuristic?: boolean;
}

const BUILT_INS: Record<BuiltInPlatformId, PlatformInfo> = {
  chatgpt: {
    id: 'chatgpt',
    label: 'ChatGPT',
    hosts: ['chatgpt.com'],
    newChatUrl: 'https://chatgpt.com/',
    acceptsFileUpload: true,
  },
  claude: {
    id: 'claude',
    label: 'Claude',
    hosts: ['claude.ai'],
    newChatUrl: 'https://claude.ai/new',
    acceptsFileUpload: true,
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    hosts: ['gemini.google.com'],
    newChatUrl: 'https://gemini.google.com/app',
    acceptsFileUpload: true,
  },
};

/**
 * The live registry: built-ins, plus whatever the user has added in this
 * context. Each context (content script, side panel, service worker) fills it
 * from storage at startup, so the domain stays free of browser APIs.
 */
const registry = new Map<PlatformId, PlatformInfo>(
  BUILT_IN_PLATFORM_IDS.map((id) => [id, BUILT_INS[id]]),
);

export function registerSite(info: PlatformInfo): void {
  registry.set(info.id, info);
}

/** Replaces every user-added site, leaving the built-ins alone. */
export function registerCustomSites(sites: readonly PlatformInfo[]): void {
  for (const id of [...registry.keys()]) {
    if (!isBuiltIn(id)) registry.delete(id);
  }
  for (const site of sites) registerSite(site);
}

export function isBuiltIn(id: PlatformId): id is BuiltInPlatformId {
  return (BUILT_IN_PLATFORM_IDS as readonly string[]).includes(id);
}

/** Every known site, built-in first, in the order the UI should list them. */
export function knownPlatforms(): PlatformInfo[] {
  return [...registry.values()];
}

export function platformIds(): PlatformId[] {
  return [...registry.keys()];
}

/**
 * A site's details. Unknown ids get a readable placeholder rather than
 * throwing: an archived conversation may name a site the user has since
 * removed, and losing the record would be worse than showing its id.
 */
export function platformInfo(id: PlatformId): PlatformInfo {
  return (
    registry.get(id) ?? {
      id,
      label: id.startsWith('site:') ? id.slice('site:'.length) : id,
      hosts: [],
      newChatUrl: '',
      acceptsFileUpload: false,
      heuristic: true,
    }
  );
}

/** Convenience for the common case of showing a site's name. */
export function platformLabel(id: PlatformId): string {
  return platformInfo(id).label;
}

export function detectPlatform(hostname: string): PlatformId | null {
  for (const info of registry.values()) {
    if (info.hosts.some((h) => hostname === h || hostname.endsWith(`.${h}`))) {
      return info.id;
    }
  }
  return null;
}

/**
 * Whether a stored string names a site. Not "is it registered": an archived
 * conversation outlives the site list, and a record that names a site the user
 * has since removed is still a valid record.
 */
export function isPlatformId(value: unknown): value is PlatformId {
  if (typeof value !== 'string') return false;
  if (isBuiltIn(value as PlatformId)) return true;
  return value.startsWith('site:') && value.length > 'site:'.length;
}

/** The id a host gets when the user adds it. */
export function siteIdForHost(host: string): CustomSiteId {
  return `site:${host.toLowerCase()}`;
}
