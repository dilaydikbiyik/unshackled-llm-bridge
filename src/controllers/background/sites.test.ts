import { describe, expect, it, vi } from 'vitest';
import { scriptIdFor, syncSiteScripts, type RegisteredScript, type ScriptingPort } from './sites';

function scripting(existing: RegisteredScript[] = []) {
  const registered = [...existing];
  const port: ScriptingPort = {
    getRegisteredContentScripts: vi.fn(async () => registered),
    registerContentScripts: vi.fn(async (scripts: RegisteredScript[]) => {
      registered.push(...scripts);
    }),
    unregisterContentScripts: vi.fn(async ({ ids }: { ids: string[] }) => {
      for (const id of ids) {
        const at = registered.findIndex((script) => script.id === id);
        if (at >= 0) registered.splice(at, 1);
      }
    }),
  };
  return { port, registered };
}

const granted = async () => true;
const PATH = 'assets/content.js';

describe('syncSiteScripts', () => {
  it('registers a script for a site the user added', async () => {
    const { port } = scripting();
    const result = await syncSiteScripts(['perplexity.ai'], port, granted, PATH);

    expect(result.registered).toEqual(['ulb-site:perplexity.ai']);
    expect(port.registerContentScripts).toHaveBeenCalledWith([
      { id: 'ulb-site:perplexity.ai', matches: ['https://perplexity.ai/*'], js: [PATH] },
    ]);
  });

  it('removes the script when the site is removed, so access ends with it', async () => {
    const { port } = scripting([{ id: scriptIdFor('perplexity.ai') }]);
    const result = await syncSiteScripts([], port, granted, PATH);

    expect(result.unregistered).toEqual(['ulb-site:perplexity.ai']);
    expect(port.registerContentScripts).not.toHaveBeenCalled();
  });

  it('leaves an already-registered site alone', async () => {
    const { port } = scripting([{ id: scriptIdFor('perplexity.ai') }]);
    const result = await syncSiteScripts(['perplexity.ai'], port, granted, PATH);

    expect(result).toEqual({ registered: [], unregistered: [], skipped: [] });
    expect(port.registerContentScripts).not.toHaveBeenCalled();
    expect(port.unregisterContentScripts).not.toHaveBeenCalled();
  });

  it('skips a site whose permission was revoked in Chrome rather than here', async () => {
    // Permission can be withdrawn from the browser's own settings. Registering
    // a script for it would fail, and pretending otherwise would be a lie in
    // the side panel.
    const { port } = scripting();
    const result = await syncSiteScripts(['perplexity.ai'], port, async () => false, PATH);

    expect(result).toEqual({ registered: [], unregistered: [], skipped: ['perplexity.ai'] });
    expect(port.registerContentScripts).not.toHaveBeenCalled();
  });

  it('never touches the built-in platforms’ manifest-declared scripts', async () => {
    const { port } = scripting([{ id: 'built-in-somehow' }, { id: scriptIdFor('old.ai') }]);
    const result = await syncSiteScripts([], port, granted, PATH);

    expect(result.unregistered).toEqual(['ulb-site:old.ai']);
  });
});
