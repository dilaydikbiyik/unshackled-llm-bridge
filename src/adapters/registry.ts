import type { SelectorConfig } from '@models/config/selector-config';
import type { PlatformId } from '@shared/platforms';
import { ChatGptAdapter } from './chatgpt/adapter';
import { ClaudeAdapter } from './claude/adapter';
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
      // TODO(phase-2.2): Gemini adapter.
      return null;
  }
}
