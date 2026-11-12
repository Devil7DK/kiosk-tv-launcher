import { describe, expect, it } from 'vitest';

import { TtlCache } from '../../src/catalog/ttl.cache.js';

describe('TtlCache', () => {
  it('answers from memory until the entry expires', async () => {
    let now = 0;
    let loads = 0;
    const cache = new TtlCache<number>(1000, () => now);
    const load = async () => ++loads;
    await cache.get('a', load);
    await cache.get('a', load);
    now = 1500;
    await expect(cache.get('a', load)).resolves.toBe(2);
  });

  it('asks again after a failure instead of remembering it', async () => {
    const cache = new TtlCache<number>(60_000);
    await expect(
      cache.get('a', () => Promise.reject(new Error('offline'))),
    ).rejects.toThrow();
    await expect(cache.get('a', async () => 1)).resolves.toBe(1);
  });
});
