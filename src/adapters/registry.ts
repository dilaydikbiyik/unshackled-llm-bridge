import type { SelectorConfig } from '@data/config/selector-config';
import type { PlatformId } from '@domain/platforms';
import { ChatGptAdapter } from './chatgpt/adapter';
import { ClaudeAdapter } from './claude/adapter';
import { GeminiAdapter } from './gemini/adapter';
import { GenericAdapter } from './generic/adapter';
import type { PlatformAdapter } from './types';

/**
 * Three platforms have adapters written against maintained selectors. Every
 * other site — anything the user adds — is read by the generic adapter, which
 * needs no selectors at all. A site the extension has never seen is therefore
 * not a missing case here; it is the default case.
 */
export function createAdapter(platform: PlatformId, config: SelectorConfig): PlatformAdapter {
  const selectors = config.platforms[platform] ?? {};
  switch (platform) {
    case 'chatgpt':
      return new ChatGptAdapter(selectors);
    case 'claude':
      return new ClaudeAdapter(selectors);
    case 'gemini':
      return new GeminiAdapter(selectors);
    default:
      return new GenericAdapter(platform, selectors);
  }
}
