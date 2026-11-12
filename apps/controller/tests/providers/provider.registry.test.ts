import { describe, expect, it } from 'vitest';

import { ProviderRegistry } from '../../src/providers/provider.registry.js';
import {
  fakeModule,
  fakeProvider,
  noPages,
  silentLog,
} from '../support/fakes.js';

function start(
  configs: Record<string, unknown>,
  modules: Record<string, ReturnType<typeof fakeModule>>,
) {
  return ProviderRegistry.start(configs, {
    load: async (id) => {
      const module = modules[id];
      if (!module)
        throw new Error(`Cannot find package @kiosk-tv/provider-${id}`);
      return module as never;
    },
    pagesFor: () => noPages,
    log: silentLog,
  });
}

describe('ProviderRegistry', () => {
  it('starts the configured providers and reports them ready', async () => {
    const registry = await start(
      { alpha: { profile: 'Test' } },
      { alpha: fakeModule('alpha', fakeProvider([]).provider) },
    );
    expect(registry.list().map((p) => [p.manifest.id, p.status.state])).toEqual(
      [['alpha', 'ready']],
    );
    expect(registry.get('alpha')).toBeDefined();
  });

  it('keeps a provider with invalid settings out without stopping the others', async () => {
    const registry = await start(
      { alpha: {}, beta: { profile: 'Test' } },
      {
        alpha: fakeModule('alpha', fakeProvider([]).provider),
        beta: fakeModule('beta', fakeProvider([]).provider),
      },
    );
    expect(registry.list().map((p) => p.status)).toEqual([
      { state: 'failed', reason: 'invalid settings' },
      { state: 'ready' },
    ]);
    expect(registry.get('alpha')).toBeUndefined();
  });

  it('reports a provider that is not installed', async () => {
    const registry = await start({ gamma: { profile: 'Test' } }, {});
    expect(registry.list()[0]?.status).toEqual({
      state: 'failed',
      reason: 'not installed',
    });
  });

  it('hides a logged-out provider from callers but still lists it', async () => {
    const { provider } = fakeProvider([], {
      status: async () => ({ state: 'loggedOut' }),
    });
    const registry = await start(
      { alpha: { profile: 'Test' } },
      { alpha: fakeModule('alpha', provider) },
    );
    expect(registry.get('alpha')).toBeUndefined();
    expect(registry.list()).toHaveLength(1);
  });

  it('accepts watch URLs only on the provider’s own sites', async () => {
    const registry = await start(
      { alpha: { profile: 'Test' } },
      { alpha: fakeModule('alpha', fakeProvider([]).provider) },
    );
    expect(registry.owns('alpha', 'https://alpha.example/play/1')).toBe(true);
    expect(registry.owns('alpha', 'https://evil.example/play/1')).toBe(false);
    expect(registry.owns('alpha', 'not a url')).toBe(false);
  });
});
