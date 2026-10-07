import { loadRegisteredSites } from '@shared/sites';
import { renderPanel } from './panel';

const root = document.getElementById('app');
// The user's sites join the registry before anything reads it, so they appear
// as fork targets and in the status list exactly like the built-in platforms.
if (root) void loadRegisteredSites().then(() => renderPanel(root));
