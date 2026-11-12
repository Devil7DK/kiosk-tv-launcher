import { describe, expect, it } from 'vitest';

import { isPower, isSettings, topBarLength } from '../../src/components/TopBar';

const tabs = [
  { id: 'home', label: 'Home' },
  { id: 'sunnxt', label: 'Sun NXT' },
];

describe('top bar', () => {
  it('puts the power button after the settings only where the TV allows it', () => {
    expect(topBarLength(tabs, true)).toBe(4);
    expect(isSettings(tabs, 2)).toBe(true);
    expect(isPower(tabs, 3)).toBe(true);
    expect(topBarLength(tabs, false)).toBe(3);
  });
});
