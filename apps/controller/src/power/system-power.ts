import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { PowerAction } from '@kiosk-tv/shared';

const run = promisify(execFile);

/** Asks logind; the TV's user needs a polkit rule to be let through. */
export async function powerTv(action: PowerAction): Promise<void> {
  await run('systemctl', [action === 'shutdown' ? 'poweroff' : 'reboot']);
}
