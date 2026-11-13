import { describe, expect, it } from 'vitest';

import { CatalogService } from '../../src/catalog/catalog.service.js';
import { ProviderRegistry } from '../../src/providers/provider.registry.js';
import {
  fakeModule,
  fakeProvider,
  noPages,
  show,
  silentLog,
} from '../support/fakes.js';

const serial = show('alpha', 's1', 'Moondru Mudichu');

async function catalogOf(
  providers: Record<string, ReturnType<typeof fakeProvider>>,
) {
  const registry = await ProviderRegistry.start(
    Object.fromEntries(
      Object.keys(providers).map((id) => [id, { profile: 'Test' }]),
    ),
    {
      load: async (id) => fakeModule(id, providers[id]!.provider) as never,
      pagesFor: () => noPages,
      log: silentLog,
    },
  );
  return new CatalogService(registry, silentLog);
}

describe('searchAll', () => {
  it('answers with every service that found something, without waiting for one that hangs', async () => {
    const catalog = await catalogOf({
      alpha: fakeProvider([], { search: async () => [serial] }),
      beta: fakeProvider([], { search: () => new Promise(() => {}) }),
      gamma: fakeProvider([]),
    });
    const started = Date.now();
    const results = await catalog.searchAll(
      'moondru',
      { languages: ['ta'] },
      50,
    );
    expect(Date.now() - started).toBeLessThan(1000);
    expect(results).toEqual([
      { provider: 'alpha', items: [serial], failed: false },
      { provider: 'beta', items: [], failed: true },
    ]);
  });

  it('reports a service whose search fails, and keeps the others', async () => {
    const catalog = await catalogOf({
      alpha: fakeProvider([], {
        search: async () => {
          throw new Error('site changed');
        },
      }),
      beta: fakeProvider([], { search: async () => [serial] }),
    });
    const results = await catalog.searchAll('moondru', { languages: ['ta'] });
    expect(results.map((r) => [r.provider, r.failed, r.items.length])).toEqual([
      ['alpha', true, 0],
      ['beta', false, 1],
    ]);
  });
});
