import { describe, expect, it } from 'vitest';

import { nextScale } from '../../src/components/SettingsDialog';

describe('nextScale', () => {
  it('steps by a tenth without drifting from rounding', () => {
    expect(nextScale(0.7, 1)).toBe(0.8);
    expect(nextScale(1, -1)).toBe(0.9);
  });

  it('stops at the smallest and largest sizes', () => {
    expect(nextScale(0.6, -1)).toBe(0.6);
    expect(nextScale(1.6, 1)).toBe(1.6);
  });
});
