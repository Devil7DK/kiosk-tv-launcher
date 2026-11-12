import { describe, expect, it } from 'vitest';

import {
  airDateLabel,
  formatDate,
  progressLabel,
} from '../../src/format/format';

describe('formatDate', () => {
  it('keeps the calendar date whatever the time zone', () => {
    expect(formatDate('2026-11-11')).toBe('11 Nov 2026');
  });
});

describe('airDateLabel', () => {
  it('leaves the date out when the title already has it', () => {
    expect(
      airDateLabel({ title: 'E688 - Nov 11, 2026', airDate: '2026-11-11' }),
    ).toBeUndefined();
    expect(airDateLabel({ title: 'Episode 272', airDate: '2026-11-10' })).toBe(
      '10 Nov 2026',
    );
  });
});

describe('progressLabel', () => {
  it('says how many minutes are left', () => {
    expect(
      progressLabel({
        positionSeconds: 600,
        durationSeconds: 2520,
        fraction: 0.24,
        completed: false,
        source: 'launcher',
      }),
    ).toBe('32 min left');
  });
});
