import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

import type { BluetoothDevice, BluetoothStatus } from '@kiosk-tv/shared';

import type { Logger } from '../logging/logger.js';

const run = promisify(execFile);

/** Long enough to pick a device while the search still runs. */
const SEARCH_SECONDS = 60;
const COMMAND_TIMEOUT_MS = 45_000;

export interface Bluetooth {
  status(): Promise<BluetoothStatus>;
  /** Starts looking for nearby devices, if not looking already. */
  scan(): Promise<void>;
  /** Pairs and trusts the device first when it is new, so it reconnects by itself later. */
  connect(address: string): Promise<void>;
  disconnect(address: string): Promise<void>;
  forget(address: string): Promise<void>;
}

const LINE = /^Device ((?:[0-9A-F]{2}:){5}[0-9A-F]{2}) (.+)$/;
const UNNAMED = /^([0-9A-F]{2}-){5}[0-9A-F]{2}$/;

/** `bluetoothctl devices` lines; a device that has no name shows its address instead. */
export function parseDevices(
  text: string,
): { address: string; name: string }[] {
  return text
    .split('\n')
    .map((line) => LINE.exec(line.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ address: match[1]!, name: match[2]! }))
    .filter((device) => !UNNAMED.test(device.name));
}

/** The first line bluetoothctl prints about a failure, if any. */
export function failureOf(output: string): string | undefined {
  return output
    .split('\n')
    .map((line) => line.trim())
    .find((line) =>
      /^Failed|not available|^Error|org\.bluez\.Error/.test(line),
    );
}

async function bluetoothctl(...args: string[]): Promise<string> {
  const { stdout, stderr } = await run('bluetoothctl', args, {
    timeout: COMMAND_TIMEOUT_MS,
  });
  const output = `${stdout}\n${stderr}`;
  const failure = failureOf(output);
  if (failure) throw new Error(failure);
  return output;
}

/** The computer's own Bluetooth adapter, driven through BlueZ's bluetoothctl. */
export function createSystemBluetooth(log: Logger): Bluetooth {
  let searching = false;

  async function available(): Promise<boolean> {
    const shown = await bluetoothctl('show').catch(() => '');
    return /^Controller /m.test(shown);
  }

  async function devices(filter?: 'Paired' | 'Connected') {
    return parseDevices(
      await bluetoothctl('devices', ...(filter ? [filter] : [])),
    );
  }

  return {
    async status() {
      if (!(await available())) {
        return { available: false, scanning: false, devices: [] };
      }
      const [all, paired, connected] = await Promise.all([
        devices(),
        devices('Paired'),
        devices('Connected'),
      ]);
      const isPaired = new Set(paired.map((d) => d.address));
      const isConnected = new Set(connected.map((d) => d.address));
      const list: BluetoothDevice[] = all.map((d) => ({
        ...d,
        paired: isPaired.has(d.address),
        connected: isConnected.has(d.address),
      }));
      return { available: true, scanning: searching, devices: list };
    },

    async scan() {
      if (searching) return;
      await bluetoothctl('power', 'on');
      searching = true;
      const search = spawn(
        'bluetoothctl',
        ['--timeout', String(SEARCH_SECONDS), 'scan', 'on'],
        { stdio: 'ignore' },
      );
      search.on('exit', () => (searching = false));
      search.on('error', (error) => {
        searching = false;
        log.warn('could not search for Bluetooth devices', {
          error: String(error),
        });
      });
    },

    async connect(address) {
      const known = await devices('Paired');
      if (!known.some((d) => d.address === address)) {
        // Speakers have no screen or keys, so the pairing asks for nothing.
        await bluetoothctl('--agent', 'NoInputNoOutput', 'pair', address);
        await bluetoothctl('trust', address);
      }
      await bluetoothctl('connect', address);
      log.info('bluetooth device connected', { address });
    },

    async disconnect(address) {
      await bluetoothctl('disconnect', address);
    },

    async forget(address) {
      await bluetoothctl('remove', address);
    },
  };
}
