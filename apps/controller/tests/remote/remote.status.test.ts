import { describe, expect, it } from 'vitest';

import {
  batteryPercent,
  RemoteStatusTracker,
} from '../../src/remote/remote.status.js';

describe('batteryPercent', () => {
  it('reads a full and an empty cell as 100 and 0', () => {
    expect(batteryPercent(4250)).toBe(100);
    expect(batteryPercent(3200)).toBe(0);
  });

  it('follows the flat middle of the LiPo curve', () => {
    expect(batteryPercent(3800)).toBe(50);
    expect(batteryPercent(3850)).toBe(58);
  });
});

describe('RemoteStatusTracker', () => {
  it('reports a change of level once, not with every press', () => {
    const tracker = new RemoteStatusTracker();
    expect(
      tracker.update({ button: 'up', repeat: false, batteryMillivolts: 3900 }),
    ).toMatchObject({
      batteryPercent: 65,
      batteryLow: false,
    });
    expect(
      tracker.update({
        button: 'down',
        repeat: false,
        batteryMillivolts: 3900,
      }),
    ).toBeUndefined();
  });

  it('asks for a charge at 15 % or below', () => {
    const tracker = new RemoteStatusTracker();
    expect(
      tracker.update({ button: 'ok', repeat: false, batteryMillivolts: 3610 })
        ?.batteryLow,
    ).toBe(true);
  });

  it('takes the level from the report sent before sleep, without a press', () => {
    const tracker = new RemoteStatusTracker();
    expect(tracker.report(3700)).toMatchObject({
      batteryPercent: 30,
      batteryLow: false,
    });
    expect(tracker.current.lastHeardAt).toBeDefined();
  });

  it('knows no level from a remote without the divider', () => {
    const tracker = new RemoteStatusTracker();
    expect(tracker.update({ button: 'ok', repeat: false })).toBeUndefined();
    expect(tracker.current).toMatchObject({ batteryLow: false });
    expect(tracker.current.batteryPercent).toBeUndefined();
  });
});
