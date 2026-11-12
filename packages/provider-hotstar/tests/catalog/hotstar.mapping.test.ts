import { describe, expect, it } from 'vitest';

import { parseDate, parseDuration } from '../../src/catalog/hotstar.mapping.js';

describe('Hotstar tags', () => {
  it('reads an air date tag as an ISO date', () => {
    expect(parseDate('12 Nov 2026')).toBe('2026-11-12');
    expect(parseDate('S1 E1173')).toBeUndefined();
  });

  it('reads durations with and without hours', () => {
    expect(parseDuration('19m')).toBe(1140);
    expect(parseDuration('1h 5m')).toBe(3900);
    expect(parseDuration('2h')).toBe(7200);
    expect(parseDuration('12 Nov 2026')).toBeUndefined();
  });
});
