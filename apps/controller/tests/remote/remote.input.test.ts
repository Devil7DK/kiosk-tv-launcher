import type { PlaybackState, RemoteKey } from '@kiosk-tv/shared';
import { describe, expect, it } from 'vitest';

import {
  createRemoteInput,
  parseVolume,
  type SystemVolume,
} from '../../src/remote/remote.input.js';
import { episode, show, silentLog } from '../support/fakes.js';

function setup(state: PlaybackState) {
  const toPlayer: RemoteKey[] = [];
  const toLauncher: string[] = [];
  const volume: number[] = [];
  const shown: SystemVolume[] = [];
  const input = createRemoteInput({
    playback: {
      state,
      key: async (key) => void toPlayer.push(key as RemoteKey),
    },
    pressInLauncher: async (key) => void toLauncher.push(key),
    changeVolume: async (direction) => {
      volume.push(direction);
      return { percent: 50 + direction * 5, muted: false };
    },
    showVolume: async (level) => void shown.push(level),
    log: silentLog,
  });
  return { input, toPlayer, toLauncher, volume, shown };
}

const playing: PlaybackState = {
  state: 'playing',
  playable: episode(show('alpha', 's1', 'Show'), 1),
  paused: false,
};

describe('remote input', () => {
  it('moves through the launcher with keys it already understands', async () => {
    const { input, toLauncher } = setup({ state: 'idle' });
    await input({ button: 'up', repeat: false });
    await input({ button: 'ok', repeat: false });
    await input({ button: 'back', repeat: false });
    expect(toLauncher).toEqual(['ArrowUp', 'Enter', 'Escape']);
  });

  it('controls the video while one plays, not the launcher behind it', async () => {
    const { input, toPlayer, toLauncher } = setup(playing);
    await input({ button: 'right', repeat: true });
    expect(toPlayer).toEqual(['right']);
    expect(toLauncher).toEqual([]);
  });

  it('turns the volume buttons into system volume steps on any screen', async () => {
    const { input, volume } = setup(playing);
    await input({ button: 'volumeUp', repeat: false });
    await input({ button: 'volumeDown', repeat: true });
    expect(volume).toEqual([1, -1]);
  });

  it('shows where the volume ended up after each step', async () => {
    const { input, shown } = setup(playing);
    await input({ button: 'volumeUp', repeat: false });
    expect(shown).toEqual([{ percent: 55, muted: false }]);
  });

  it('reads the volume and mute state wpctl reports', () => {
    expect(parseVolume('Volume: 0.45\n')).toEqual({
      percent: 45,
      muted: false,
    });
    expect(parseVolume('Volume: 0.30 [MUTED]\n')).toEqual({
      percent: 30,
      muted: true,
    });
    expect(parseVolume('no sink')).toBeUndefined();
  });
});
