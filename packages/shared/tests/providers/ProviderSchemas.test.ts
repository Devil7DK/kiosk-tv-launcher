import { describe, expect, it } from 'vitest';

import { ProviderIdSchema } from '../../src/index.js';

describe('ProviderIdSchema', () => {
  it('accepts the ids provider packages are named after', () => {
    expect(ProviderIdSchema.safeParse('sun-nxt').success).toBe(true);
  });

  it('rejects ids that would not make a valid package name', () => {
    expect(ProviderIdSchema.safeParse('Sun NXT').success).toBe(false);
  });
});
