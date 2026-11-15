import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { systemBacklight } from '../../src/display/backlight.js';

async function backlights(
  entries: Record<string, Record<string, string>>,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'backlight-'));
  for (const [name, fields] of Object.entries(entries)) {
    await mkdir(join(root, name));
    for (const [field, value] of Object.entries(fields)) {
      await writeFile(join(root, name, field), `${value}\n`);
    }
  }
  return root;
}

function recorder() {
  const calls: [string, number][] = [];
  const set = (device: string, value: number) => {
    calls.push([device, value]);
    return Promise.resolve();
  };
  return { calls, set };
}

describe('systemBacklight', () => {
  it('reports no brightness on a screen without a backlight', async () => {
    const backlight = systemBacklight(recorder().set, await backlights({}));
    expect(await backlight.percent()).toBeUndefined();
    await expect(backlight.setPercent(50)).rejects.toThrow();
  });

  it('reads the brightness as a share of the most the screen gives', async () => {
    const root = await backlights({
      amdgpu_bl0: { type: 'raw', brightness: '64', max_brightness: '255' },
    });
    expect(await systemBacklight(recorder().set, root).percent()).toBe(25);
  });

  it('sets the firmware control rather than the raw one when both exist', async () => {
    const root = await backlights({
      amdgpu_bl0: { type: 'raw', brightness: '10', max_brightness: '255' },
      acpi_video0: { type: 'firmware', brightness: '5', max_brightness: '10' },
    });
    const { calls, set } = recorder();
    await systemBacklight(set, root).setPercent(70);
    expect(calls).toEqual([['acpi_video0', 7]]);
  });

  it('never turns the backlight fully off for a low share of a coarse control', async () => {
    const root = await backlights({
      acpi_video0: { type: 'firmware', brightness: '5', max_brightness: '7' },
    });
    const { calls, set } = recorder();
    await systemBacklight(set, root).setPercent(5);
    expect(calls).toEqual([['acpi_video0', 1]]);
  });
});
