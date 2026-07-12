import { BaseAdapter } from '@adapters/base-adapter';
import type { AdapterCapabilities } from '@adapters/types';
import type { PlatformId } from '@shared/platforms';

/**
 * Claude (claude.ai) adapter.
 * TODO(phase-1.3): readConversation from DOM (decide artifact representation),
 * openNewChat, observeMessages, ProseMirror-safe injection.
 */
export class ClaudeAdapter extends BaseAdapter {
  readonly platform: PlatformId = 'claude';
  readonly capabilities: AdapterCapabilities = {
    readConversation: false,
    injectText: true,
    uploadFile: false,
    readModelMode: false,
    openNewChat: false,
  };
}
