import { describe, expect, it } from 'vitest';

import { betweenDates } from '../../src/api/sunnxt.api.js';
import { monthGroups } from '../../src/catalog/episode-months.js';

describe('betweenDates', () => {
  it('writes the day before the month, as the Sun NXT API expects', () => {
    expect(betweenDates(2026, 11)).toBe('20260111T000000-20263011T235900');
  });

  it('ends February on the 28th in a common year', () => {
    expect(betweenDates(2026, 2)).toBe('20260102T000000-20262802T235900');
  });
});

describe('monthGroups', () => {
  it('lists months newest first across a year boundary', () => {
    expect(
      monthGroups({ year: 2025, month: 11 }, { year: 2026, month: 2 }).map(
        (g) => g.label,
      ),
    ).toEqual(['Feb 2026', 'Jan 2026', 'Dec 2025', 'Nov 2025']);
  });
});
