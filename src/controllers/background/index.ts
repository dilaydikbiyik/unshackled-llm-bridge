import type { AdapterHealth } from '@adapters/types';
import { PLATFORMS, type PlatformId } from '@shared/platforms';
import { onRuntimeMessage, type ForkRequest } from '@shared/messages';

/**
 * MV3 service worker: the messaging hub. Holds no business logic beyond
 * routing — fork packaging happens in the content-side fork controller,
 * rendering in the side panel view.
 */

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

const PENDING_FORK_KEY = (platform: PlatformId) => `pending-fork:${platform}`;
const HEALTH_KEY = (platform: PlatformId) => `health:${platform}`;

onRuntimeMessage(async (msg) => {
  switch (msg.type) {
    case 'adapter/health-report': {
      await chrome.storage.session.set({ [HEALTH_KEY(msg.health.platform)]: msg.health });
      return { ok: true };
    }

    case 'health/list-request': {
      const keys = Object.keys(PLATFORMS).map((p) => HEALTH_KEY(p as PlatformId));
      const stored = await chrome.storage.session.get(keys);
      return Object.values(stored) as AdapterHealth[];
    }

    case 'fork/initiate': {
      // Hand-off across tabs: park the package in session storage, open the
      // target platform; its content script claims the package once ready.
      const { targetPlatform } = msg.request;
      await chrome.storage.session.set({ [PENDING_FORK_KEY(targetPlatform)]: msg.request });
      await chrome.tabs.create({ url: PLATFORMS[targetPlatform].newChatUrl });
      return { ok: true };
    }

    case 'fork/pending-check': {
      const key = PENDING_FORK_KEY(msg.platform);
      const stored = await chrome.storage.session.get(key);
      const pending = (stored[key] as ForkRequest | undefined) ?? null;
      if (pending) await chrome.storage.session.remove(key);
      return pending;
    }
  }
});
