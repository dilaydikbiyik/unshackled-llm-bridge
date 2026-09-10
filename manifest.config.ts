import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

/**
 * Permissions minimalism: `storage` (local sandbox + settings), `sidePanel`
 * (the UI surface), `tabs` (opening the target platform on transfer), plus one
 * host permission per supported platform. Nothing else is requested.
 * Adding a permission means justifying it in the README.
 */
const PLATFORM_HOSTS = [
  'https://chatgpt.com/*',
  'https://claude.ai/*',
  'https://gemini.google.com/*',
];

export default defineManifest({
  manifest_version: 3,
  name: '__MSG_appName__',
  version: pkg.version,
  description: '__MSG_appDesc__',
  default_locale: 'tr',
  permissions: ['storage', 'sidePanel', 'tabs'],
  host_permissions: PLATFORM_HOSTS,
  background: {
    service_worker: 'src/controllers/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: PLATFORM_HOSTS,
      js: ['src/controllers/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  side_panel: {
    default_path: 'src/views/sidepanel/index.html',
  },
  action: {
    default_title: 'Unshackled LLM Bridge',
  },
  icons: {
    '128': 'icon-128.png',
  },
});
