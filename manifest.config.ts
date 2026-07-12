import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
  manifest_version: 3,
  name: '__MSG_appName__',
  version: pkg.version,
  description: '__MSG_appDesc__',
  default_locale: 'tr',
  permissions: ['storage', 'sidePanel', 'tabs'],
  host_permissions: ['https://chatgpt.com/*', 'https://claude.ai/*'],
  background: {
    service_worker: 'src/controllers/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['https://chatgpt.com/*', 'https://claude.ai/*'],
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
