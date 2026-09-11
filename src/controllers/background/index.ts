import * as repo from '@data/store/repo';
import { summarizeTranscript } from '@data/summarize/client';
import { onRuntimeMessage } from '@shared/messages';
import { getSettings } from '@shared/settings';
import { chromeStore } from '@shared/storage';
import { createHandlers } from './handlers';

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
