import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { readTvBattery } from '../../src/power/tv-battery.js';

async function supplies(
  entries: Record<string, Record<string, string>>,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'power-supply-'));
  for (const [name, fields] of Object.entries(entries)) {
    await mkdir(join(root, name));
    for (const [field, value] of Object.entries(fields)) {
      await writeFile(join(root, name, field), `${value}\n`);
    }
  }
  return root;
}

describe('readTvBattery', () => {
  it('reports nothing on a computer without a battery', async () => {
    expect(await readTvBattery(await supplies({}))).toBeUndefined();
  });

  it('reports nothing for a laptop whose battery is gone, though its charger is in', async () => {
    const root = await supplies({ ACAD: { type: 'Mains', online: '1' } });
    expect(await readTvBattery(root)).toBeUndefined();
  });

  it('reads the level of a battery running down', async () => {
    const root = await supplies({
      ACAD: { type: 'Mains', online: '0' },
      BAT0: { type: 'Battery', status: 'Discharging', capacity: '54' },
    });
    expect(await readTvBattery(root)).toEqual({ percent: 54, charging: false });
  });

  it('counts a full battery on the charger as charging', async () => {
    const root = await supplies({
      ACAD: { type: 'Mains', online: '1' },
      BAT0: { type: 'Battery', status: 'Full', capacity: '100' },
    });
    expect(await readTvBattery(root)).toEqual({ percent: 100, charging: true });
  });

  it('leaves out the battery of a wireless mouse', async () => {
    const root = await supplies({
      hidpp_battery_0: {
        type: 'Battery',
        scope: 'Device',
        status: 'Discharging',
        capacity: '20',
      },
    });
    expect(await readTvBattery(root)).toBeUndefined();
  });
});
