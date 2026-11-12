import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { TvBattery } from '@kiosk-tv/shared';

const POWER_SUPPLIES = '/sys/class/power_supply';

async function field(dir: string, name: string): Promise<string | undefined> {
  return readFile(join(dir, name), 'utf8').then(
    (text) => text.trim(),
    () => undefined,
  );
}

/** The computer's battery level, averaged over its batteries; undefined without one. */
export async function readTvBattery(
  root = POWER_SUPPLIES,
): Promise<TvBattery | undefined> {
  const names = await readdir(root).catch(() => [] as string[]);
  const levels: number[] = [];
  let charging = false;
  for (const name of names) {
    const dir = join(root, name);
    const type = await field(dir, 'type');
    if (type === 'Mains' || type === 'USB') {
      if ((await field(dir, 'online')) === '1') charging = true;
      continue;
    }
    // A wireless mouse or keyboard reports its battery here too, as a device's.
    if (type !== 'Battery' || (await field(dir, 'scope')) === 'Device')
      continue;
    if ((await field(dir, 'present')) === '0') continue;
    const capacity = Number(await field(dir, 'capacity'));
    if (!Number.isFinite(capacity)) continue;
    levels.push(Math.min(100, Math.max(0, capacity)));
    if ((await field(dir, 'status')) === 'Charging') charging = true;
  }
  if (levels.length === 0) return undefined;
  const percent = Math.round(levels.reduce((a, b) => a + b, 0) / levels.length);
  return { percent, charging };
}
