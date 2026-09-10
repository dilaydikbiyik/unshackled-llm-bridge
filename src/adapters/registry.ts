import type { SelectorConfig } from '@data/config/selector-config';
import type { PlatformId } from '@domain/platforms';
import { ChatGptAdapter } from './chatgpt/adapter';
import { ClaudeAdapter } from './claude/adapter';
import { GeminiAdapter } from './gemini/adapter';
import type { PlatformAdapter } from './types';

/** Adding a platform = one adapter file + one case here + selectors in config. */
export function createAdapter(
  platform: PlatformId,
  config: SelectorConfig,
): PlatformAdapter | null {
  const selectors = config.platforms[platform] ?? {};
  switch (platform) {
    case 'chatgpt':
      return new ChatGptAdapter(selectors);
    case 'claude':
      return new ClaudeAdapter(selectors);
    case 'gemini':
      return new GeminiAdapter(selectors);
  }
}
