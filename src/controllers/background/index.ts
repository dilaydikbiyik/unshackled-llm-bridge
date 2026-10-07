import * as repo from '@data/store/repo';
import { summarizeTranscript } from '@data/summarize/client';
import { onRuntimeMessage } from '@shared/messages';
import { getSettings } from '@shared/settings';
import { loadRegisteredSites } from '@shared/sites';
import { chromeStore, watchChromeKey } from '@shared/storage';
import { createHandlers } from './handlers';
import { syncSiteScripts } from './sites';

/**
 * MV3 service worker entry: wires the real browser into the handler map.
 * All behaviour lives in handlers.ts, where it is unit-tested against fakes;
 * this file is exercised end to end by the Playwright suite.
 */
void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

onRuntimeMessage(
  createHandlers({
    session: chromeStore('session'),
    local: chromeStore('local'),
    openTab: async (url, { active }) => {
      await chrome.tabs.create({ url, active });
    },
    repo,
    summarize: summarizeTranscript,
    getSettings,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }),
);

/**
 * The user's own sites. Their content scripts are registered at runtime rather
 * than declared in the manifest, so the extension's reach is exactly the list
 * the user can see and edit — and a site removed here loses its script too.
 *
 * The content script's built filename is read from the manifest instead of
 * being hard-coded: the bundler hashes it, and a stale path would register a
 * script that cannot load.
 */
function contentScriptPath(): string | null {
  return chrome.runtime.getManifest().content_scripts?.[0]?.js?.[0] ?? null;
}

async function syncSites(): Promise<void> {
  const path = contentScriptPath();
  if (!path) return;
  const sites = await loadRegisteredSites();
  await syncSiteScripts(
    sites.flatMap((site) => site.hosts),
    chrome.scripting,
    (host) => chrome.permissions.contains({ origins: [`https://${host}/*`] }),
    path,
  );
}

void syncSites();
// The side panel edits the list; the worker reacts rather than being told.
watchChromeKey('local', 'settings', () => void syncSites());
chrome.runtime.onStartup.addListener(() => void syncSites());
