import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { keyboardKeyFor } from '@kiosk-tv/shared';

import type { Logger } from '../logging/logger.js';
import type { PlaybackService } from '../playback/playback.service.js';
import type { RemotePress } from './dongle.connection.js';

const run = promisify(execFile);

/** Changes the laptop's own output volume by 5 %, never above 100 %. */
export async function changeSystemVolume(direction: 1 | -1): Promise<void> {
  await run('wpctl', [
    'set-volume',
    '-l',
    '1.0',
    '@DEFAULT_AUDIO_SINK@',
    direction > 0 ? '5%+' : '5%-',
  ]);
}

/** Sends a press to whatever is on screen: the playing video, or the launcher. */
export function createRemoteInput(deps: {
  playback: Pick<PlaybackService, 'state' | 'key'>;
  pressInLauncher: (keyboardKey: string) => Promise<void>;
  changeVolume?: (direction: 1 | -1) => Promise<void>;
  log: Logger;
}): (press: RemotePress) => Promise<void> {
  const changeVolume = deps.changeVolume ?? changeSystemVolume;
  return async (press) => {
    try {
      if (press.button === 'volumeUp' || press.button === 'volumeDown') {
        await changeVolume(press.button === 'volumeUp' ? 1 : -1);
        return;
      }
      const state = deps.playback.state.state;
      if (state === 'playing' || state === 'starting') {
        await deps.playback.key(press.button);
        return;
      }
      await deps.pressInLauncher(keyboardKeyFor(press.button));
    } catch (error) {
      deps.log.warn('remote press not handled', {
        button: press.button,
        error: String(error),
      });
    }
  };
}
