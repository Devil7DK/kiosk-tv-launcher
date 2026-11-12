import { describe, expect, it } from 'vitest';

import { ProviderIdSchema, ProviderStatusSchema } from '../../src/index.js';

describe('ProviderIdSchema', () => {
  it('accepts the ids provider packages are named after', () => {
    expect(ProviderIdSchema.safeParse('sun-nxt').success).toBe(true);
  });

  it('rejects ids that would not make a valid package name', () => {
    expect(ProviderIdSchema.safeParse('Sun NXT').success).toBe(false);
  });
});

describe('ProviderStatusSchema', () => {
  it('names both profiles when the provider is stuck on the wrong one', () => {
    expect(
      ProviderStatusSchema.parse({
        state: 'wrongProfile',
        expected: 'Home',
        actual: 'Kids',
      }),
    ).toMatchObject({ expected: 'Home', actual: 'Kids' });
  });

  it('rejects an expiry without a time zone, which could be read as local time', () => {
    expect(
      ProviderStatusSchema.safeParse({
        state: 'expiring',
        at: '2026-11-16T10:00:00',
      }).success,
    ).toBe(false);
  });
});
