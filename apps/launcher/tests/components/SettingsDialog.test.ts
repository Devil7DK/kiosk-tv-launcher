import { describe, expect, it } from 'vitest';

import { nextBrightness, nextScale } from '../../src/components/SettingsDialog';

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

describe('nextBrightness', () => {
  it('goes to the next step either way when the screen sits between steps', () => {
    expect(nextBrightness(43, 1)).toBe(50);
    expect(nextBrightness(43, -1)).toBe(40);
    expect(nextBrightness(40, -1)).toBe(30);
    expect(nextBrightness(40, 1)).toBe(50);
  });

  it('never goes fully dark and never past full', () => {
    expect(nextBrightness(10, -1)).toBe(10);
    expect(nextBrightness(3, -1)).toBe(10);
    expect(nextBrightness(100, 1)).toBe(100);
  });
});
