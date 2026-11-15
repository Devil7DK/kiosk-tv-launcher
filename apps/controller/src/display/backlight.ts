import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const BACKLIGHTS = '/sys/class/backlight';
/** The kernel's own advice: firmware controls work best, raw ones least. */
const PREFERENCE = ['firmware', 'platform', 'raw'];

export interface Backlight {
  /** Undefined on a screen without a backlight the computer controls. */
  percent(): Promise<number | undefined>;
  setPercent(percent: number): Promise<void>;
}

/**
 * logind lets the user of the session at the screen set its backlight; writing
 * to sysfs would need root. "auto" is the caller's session or, for a user
 * service outside any session, the user's session at the screen.
 */
export async function setThroughLogind(
  device: string,
  value: number,
): Promise<void> {
  await run('busctl', [
    'call',
    'org.freedesktop.login1',
    '/org/freedesktop/login1/session/auto',
    'org.freedesktop.login1.Session',
    'SetBrightness',
    'ssu',
    'backlight',
    device,
    String(value),
  ]);
}

async function number(path: string): Promise<number | undefined> {
  const text = await readFile(path, 'utf8').catch(() => undefined);
  const value = Number(text?.trim());
  return text === undefined || !Number.isFinite(value) ? undefined : value;
}

interface Device {
  name: string;
  max: number;
}

async function findDevice(root: string): Promise<Device | undefined> {
  const found: (Device & { rank: number })[] = [];
  for (const name of await readdir(root).catch(() => [] as string[])) {
    const max = await number(join(root, name, 'max_brightness'));
    if (!max || max <= 0) continue;
    const type = await readFile(join(root, name, 'type'), 'utf8').catch(
      () => '',
    );
    const rank = PREFERENCE.indexOf(type.trim());
    found.push({ name, max, rank: rank < 0 ? PREFERENCE.length : rank });
  }
  found.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  return found[0];
}

export function systemBacklight(
  set: (device: string, value: number) => Promise<void> = setThroughLogind,
  root = BACKLIGHTS,
): Backlight {
  return {
    async percent() {
      const device = await findDevice(root);
      if (!device) return undefined;
      const value = await number(join(root, device.name, 'brightness'));
      return value === undefined
        ? undefined
        : Math.round((value / device.max) * 100);
    },
    async setPercent(percent) {
      const device = await findDevice(root);
      if (!device) throw new Error('This screen has no backlight to set');
      const value = Math.max(1, Math.round((percent / 100) * device.max));
      await set(device.name, value);
    },
  };
}
