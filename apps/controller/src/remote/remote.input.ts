import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { keyboardKeyFor } from '@kiosk-tv/shared';

import type { Logger } from '../logging/logger.js';
import type { PlaybackService } from '../playback/playback.service.js';
import type { RemotePress } from './dongle.connection.js';

const run = promisify(execFile);

export interface SystemVolume {
  percent: number;
  muted: boolean;
}

/** `wpctl get-volume` prints "Volume: 0.45", with " [MUTED]" when muted. */
export function parseVolume(text: string): SystemVolume | undefined {
  const match = /Volume:\s*([\d.]+)/.exec(text);
  if (!match) return undefined;
  return {
    percent: Math.round(Number(match[1]) * 100),
    muted: text.includes('[MUTED]'),
  };
}

/**
 * Changes the laptop's own output volume by 5 %, never above 100 %, and says
 * where it ended. Volume up also unmutes: pressing it and hearing nothing
 * would look broken.
 */
export async function changeSystemVolume(
  direction: 1 | -1,
): Promise<SystemVolume | undefined> {
  if (direction > 0)
    await run('wpctl', ['set-mute', '@DEFAULT_AUDIO_SINK@', '0']);
  await run('wpctl', [
    'set-volume',
    '-l',
    '1.0',
    '@DEFAULT_AUDIO_SINK@',
    direction > 0 ? '5%+' : '5%-',
  ]);
  const { stdout } = await run('wpctl', ['get-volume', '@DEFAULT_AUDIO_SINK@']);
  return parseVolume(stdout);
}

/** Sends a press to whatever is on screen: the playing video, or the launcher. */
export function createRemoteInput(deps: {
  playback: Pick<PlaybackService, 'state' | 'key'>;
  pressInLauncher: (keyboardKey: string) => Promise<void>;
  changeVolume?: (direction: 1 | -1) => Promise<SystemVolume | undefined>;
  /** Puts the new volume on whatever is on screen. */
  showVolume?: (volume: SystemVolume) => Promise<void>;
  log: Logger;
}): (press: RemotePress) => Promise<void> {
  const changeVolume = deps.changeVolume ?? changeSystemVolume;
  return async (press) => {
    try {
      if (press.button === 'volumeUp' || press.button === 'volumeDown') {
        const volume = await changeVolume(press.button === 'volumeUp' ? 1 : -1);
        if (volume) await deps.showVolume?.(volume);
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
