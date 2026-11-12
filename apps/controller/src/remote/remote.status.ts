import type { RemoteStatus } from '@kiosk-tv/shared';

import type { RemotePress } from './dongle.connection.js';

/**
 * A LiPo cell's voltage against its charge, read while resting. The curve is
 * flat in the middle, so the percentage is approximate there.
 */
const CURVE: [millivolts: number, percent: number][] = [
  [3300, 0],
  [3500, 5],
  [3600, 12],
  [3650, 20],
  [3700, 30],
  [3750, 40],
  [3800, 50],
  [3900, 65],
  [4000, 80],
  [4100, 90],
  [4200, 100],
];

/** Low enough to ask for a charge while some days of use remain. */
export const LOW_BATTERY_PERCENT = 15;

export function batteryPercent(millivolts: number): number {
  const [first] = CURVE;
  const last = CURVE[CURVE.length - 1]!;
  if (millivolts <= first![0]) return 0;
  if (millivolts >= last[0]) return 100;
  for (let i = 1; i < CURVE.length; i++) {
    const [highMv, highPct] = CURVE[i]!;
    const [lowMv, lowPct] = CURVE[i - 1]!;
    if (millivolts <= highMv) {
      return Math.round(
        lowPct + ((millivolts - lowMv) / (highMv - lowMv)) * (highPct - lowPct),
      );
    }
  }
  return 100;
}

/** The remote's state as the presses report it. */
export class RemoteStatusTracker {
  private status: RemoteStatus = { batteryLow: false };

  constructor(private readonly now: () => Date = () => new Date()) {}

  get current(): RemoteStatus {
    return this.status;
  }

  /** A press, which also carries the battery level. Returns the status if it changed. */
  update(press: RemotePress): RemoteStatus | undefined {
    return this.heard(press.batteryMillivolts);
  }

  /** The report the remote sends before it sleeps. Returns the status if it changed. */
  report(batteryMillivolts: number | undefined): RemoteStatus | undefined {
    return this.heard(batteryMillivolts);
  }

  private heard(
    batteryMillivolts: number | undefined,
  ): RemoteStatus | undefined {
    const percent =
      batteryMillivolts === undefined
        ? undefined
        : batteryPercent(batteryMillivolts);
    const next: RemoteStatus = {
      ...(percent === undefined ? {} : { batteryPercent: percent }),
      batteryLow: percent !== undefined && percent <= LOW_BATTERY_PERCENT,
      lastHeardAt: this.now().toISOString(),
    };
    const changed =
      next.batteryPercent !== this.status.batteryPercent ||
      next.batteryLow !== this.status.batteryLow;
    this.status = next;
    return changed ? next : undefined;
  }
}
