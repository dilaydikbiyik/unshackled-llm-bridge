import { matchPatternFor } from '@shared/sites';

/**
 * Content scripts for the sites the user added.
 *
 * The three built-in platforms are declared in the manifest. Everything else is
 * registered at runtime, only after the user has granted that host — so the
 * extension's reach is exactly the list the user can see and edit, and removing
 * a site removes the script with it.
 */
export const SITE_SCRIPT_PREFIX = 'ulb-site:';

export interface RegisteredScript {
  id: string;
  matches?: string[];
  js?: string[];
}

/** The slice of `chrome.scripting` this needs, so it can be tested without one. */
export interface ScriptingPort {
  getRegisteredContentScripts(): Promise<RegisteredScript[]>;
  registerContentScripts(scripts: RegisteredScript[]): Promise<void>;
  unregisterContentScripts(filter: { ids: string[] }): Promise<void>;
}

export const scriptIdFor = (host: string): string => `${SITE_SCRIPT_PREFIX}${host}`;

export interface SyncResult {
  registered: string[];
  unregistered: string[];
  skipped: string[];
}

/**
 * Brings the registered scripts in line with the granted sites: registers what
 * is missing, removes what is gone, and skips a site whose permission the user
 * has revoked in Chrome's own settings rather than here.
 */
export async function syncSiteScripts(
  hosts: readonly string[],
  scripting: ScriptingPort,
  hasPermission: (host: string) => Promise<boolean>,
  contentScriptPath: string,
): Promise<SyncResult> {
  const existing = (await scripting.getRegisteredContentScripts())
    .map((script) => script.id)
    .filter((id) => id.startsWith(SITE_SCRIPT_PREFIX));

  const wanted: string[] = [];
  const skipped: string[] = [];
  for (const host of hosts) {
    if (await hasPermission(host)) wanted.push(host);
    else skipped.push(host);
  }

  const wantedIds = wanted.map(scriptIdFor);
  const unregistered = existing.filter((id) => !wantedIds.includes(id));
  if (unregistered.length > 0) await scripting.unregisterContentScripts({ ids: unregistered });

  const toRegister = wanted.filter((host) => !existing.includes(scriptIdFor(host)));
  if (toRegister.length > 0) {
    await scripting.registerContentScripts(
      toRegister.map((host) => ({
        id: scriptIdFor(host),
        matches: [matchPatternFor(host)],
        js: [contentScriptPath],
      })),
    );
  }

  return { registered: toRegister.map(scriptIdFor), unregistered, skipped };
}
