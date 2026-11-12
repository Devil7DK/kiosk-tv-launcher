import { describe, expect, it } from 'vitest';

import { newerProgress, progressAt, ProgressSchema } from '../../src/index.js';

describe('progressAt', () => {
  it('marks an episode stopped during the end credits as completed', () => {
    expect(progressAt(1220, 1271, 'launcher').completed).toBe(true);
  });

  it('keeps a position past the reported duration at a fraction of 1', () => {
    expect(progressAt(2605, 1320, 'launcher').fraction).toBe(1);
  });

  it('treats an unknown duration as not started rather than dividing by zero', () => {
    expect(progressAt(30, 0, 'launcher').fraction).toBe(0);
  });
});

describe('newerProgress', () => {
  const launcher = progressAt(300, 1200, 'launcher', '2026-11-12T10:00:00Z');
  const provider = progressAt(600, 1200, 'provider', '2026-11-12T11:00:00Z');

  it('prefers the more recent record whichever side recorded it', () => {
    expect(newerProgress(launcher, provider)).toBe(provider);
    expect(newerProgress(provider, launcher)).toBe(provider);
  });

  it('prefers a dated record over an undated one', () => {
    const undated = progressAt(900, 1200, 'provider');
    expect(newerProgress(undated, launcher)).toBe(launcher);
    expect(newerProgress(launcher, undated)).toBe(launcher);
  });
});

describe('ProgressSchema', () => {
  it('rejects a fraction above 1, so a percentage is not mistaken for a fraction', () => {
    expect(
      ProgressSchema.safeParse({
        fraction: 45,
        completed: false,
        source: 'provider',
      }).success,
    ).toBe(false);
  });
});
