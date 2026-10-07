import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

/**
 * Permissions minimalism: `storage` (local sandbox + settings), `sidePanel`
 * (the UI surface), `tabs` (opening the target platform on transfer), and
 * `scripting` (registering the content script on a site the user adds), plus
 * one host permission per built-in platform. Adding a permission means
 * justifying it in the README.
 *
 * Any other site is an *optional* host permission, requested one host at a
 * time when the user adds it and revocable from the same place. The extension
 * never asks for access to the web; it asks for the site in front of you.
 */
const PLATFORM_HOSTS = [
  'https://chatgpt.com/*',
  'https://claude.ai/*',
  'https://gemini.google.com/*',
];

const ICONS = {
  '16': 'icon-16.png',
  '32': 'icon-32.png',
  '48': 'icon-48.png',
  '128': 'icon-128.png',
};

export default defineManifest({
  manifest_version: 3,
  name: '__MSG_appName__',
  version: pkg.version,
  description: '__MSG_appDesc__',
  default_locale: 'tr',
  permissions: ['storage', 'sidePanel', 'tabs', 'scripting'],
  host_permissions: PLATFORM_HOSTS,
  optional_host_permissions: ['https://*/*'],
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
    default_icon: ICONS,
  },
  icons: ICONS,
});
