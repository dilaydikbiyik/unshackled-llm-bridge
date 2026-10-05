export const PLATFORM_IDS = ['chatgpt', 'claude', 'gemini'] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];

export interface PlatformInfo {
  id: PlatformId;
  label: string;
  hosts: string[];
  newChatUrl: string;
  /** False disables attachment delivery for this target in the fork dialog. */
  acceptsFileUpload: boolean;
}

export const PLATFORMS: Record<PlatformId, PlatformInfo> = {
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
  // Adapter lands in phase 2.2; listed so the UI can show it as "coming soon".
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    hosts: ['gemini.google.com'],
    newChatUrl: 'https://gemini.google.com/app',
    acceptsFileUpload: true,
  },
};

export function detectPlatform(hostname: string): PlatformId | null {
  for (const info of Object.values(PLATFORMS)) {
    if (info.hosts.some((h) => hostname === h || hostname.endsWith(`.${h}`))) {
      return info.id;
    }
  }
  return null;
}
