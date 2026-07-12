import { BaseAdapter } from '@adapters/base-adapter';
import type { AdapterCapabilities } from '@adapters/types';
import type { PlatformId } from '@shared/platforms';

/**
 * ChatGPT (chatgpt.com) adapter.
 * TODO(phase-1.2): readConversation from DOM, openNewChat, observeMessages,
 * injection hardening for the React composer.
 */
export class ChatGptAdapter extends BaseAdapter {
  readonly platform: PlatformId = 'chatgpt';
  readonly capabilities: AdapterCapabilities = {
    readConversation: false,
    injectText: true,
    uploadFile: false,
    readModelMode: false,
    openNewChat: false,
  };
}
