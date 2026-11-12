import { describe, expect, it } from 'vitest';

import { isLow, levelWidth } from '../../src/components/BatteryIcon';

describe('BatteryIcon', () => {
  it('fills the outline in proportion to the level', () => {
    expect(levelWidth(100)).toBe(19);
    expect(levelWidth(50)).toBe(9.5);
    expect(levelWidth(0)).toBe(0);
  });

  it('turns red when low, but not while it charges', () => {
    expect(isLow({ percent: 10, charging: false })).toBe(true);
    expect(isLow({ percent: 10, charging: true })).toBe(false);
    expect(isLow({ percent: 60, charging: false })).toBe(false);
  });
});
