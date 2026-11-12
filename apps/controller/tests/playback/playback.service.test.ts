import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  type PlaybackState,
  progressAt,
  type ServerEvent,
} from '@kiosk-tv/shared';
import { describe, expect, it } from 'vitest';

import { CatalogService } from '../../src/catalog/catalog.service.js';
import { EventHub } from '../../src/events/event.hub.js';
import { PlaybackService } from '../../src/playback/playback.service.js';
import { ProviderRegistry } from '../../src/providers/provider.registry.js';
import { WatchStore } from '../../src/watch/watch.store.js';
import {
  episode,
  fakeModule,
  fakeProvider,
  noPages,
  show,
  silentLog,
} from '../support/fakes.js';

const serial = show('alpha', 's1', 'Moondru Mudichu');
const episodes = [episode(serial, 3), episode(serial, 2), episode(serial, 1)];

async function setup() {
  const fake = fakeProvider([{ title: serial, episodes }]);
  const registry = await ProviderRegistry.start(
    { alpha: { profile: 'Test' } },
    {
      load: async () => fakeModule('alpha', fake.provider) as never,
      pagesFor: () => noPages,
      log: silentLog,
    },
  );
  const dir = await mkdtemp(join(tmpdir(), 'kiosk-tv-'));
  const watch = new WatchStore(join(dir, 'watch.json'), silentLog);
  const events = new EventHub();
  const published: ServerEvent[] = [];
  events.subscribe((e) => published.push(e));
  const screen = {
    front: 'launcher',
    showPlayer: async () => void (screen.front = 'player'),
    showLauncher: async () => void (screen.front = 'launcher'),
  };
  const playback = new PlaybackService({
    registry,
    catalog: new CatalogService(registry, silentLog),
    watch,
    screen,
    events,
    log: silentLog,
  });
  const states = () =>
    published.flatMap((e) => (e.type === 'playback' ? [e.playback.state] : []));
  return { fake, playback, watch, screen, published, states };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

describe('PlaybackService', () => {
  it('resumes from the position recorded last time', async () => {
    const { fake, playback, watch } = await setup();
    await watch.record(
      episodes[1]!,
      progressAt(600, 1300, 'launcher', '2026-11-12T10:00:00Z'),
    );
    await playback.play({ playable: episodes[1]! });
    expect(fake.plays[0]?.resumeAt).toBe(600);
  });

  it('starts over when asked, or when the episode was finished', async () => {
    const { fake, playback, watch } = await setup();
    await watch.record(
      episodes[1]!,
      progressAt(600, 1300, 'launcher', '2026-11-12T10:00:00Z'),
    );
    await playback.play({ playable: episodes[1]!, fromStart: true });
    await watch.record(
      episodes[2]!,
      progressAt(1290, 1300, 'launcher', '2026-11-12T10:00:00Z'),
    );
    await playback.play({ playable: episodes[2]! });
    expect(fake.plays.map((p) => p.resumeAt)).toEqual([undefined, undefined]);
  });

  it('refuses a watch URL outside the provider’s site', async () => {
    const { playback } = await setup();
    await expect(
      playback.play({
        playable: { ...episodes[0]!, url: 'https://evil.example/' },
      }),
    ).rejects.toThrow(/not on the provider/);
  });

  it('brings the launcher back with the next episode when one ends', async () => {
    const { fake, playback, screen } = await setup();
    await playback.play({ playable: episodes[1]! });
    expect(screen.front).toBe('player');
    fake.sessions[0]!.emit('ended');
    await settle();
    expect(screen.front).toBe('launcher');
    expect(fake.sessions[0]!.stopped).toBe(true);
    expect(playback.state).toMatchObject({
      state: 'finished',
      reason: 'ended',
      next: { number: 3 },
    });
  });

  it('offers nothing next after the newest episode', async () => {
    const { fake, playback } = await setup();
    await playback.play({ playable: episodes[0]! });
    fake.sessions[0]!.emit('ended');
    await settle();
    expect(
      (playback.state as Extract<PlaybackState, { state: 'finished' }>).next,
    ).toBeUndefined();
  });

  it('stops on Back and keeps where the viewer stopped', async () => {
    const { fake, playback, watch } = await setup();
    await playback.play({ playable: episodes[1]! });
    fake.sessions[0]!.emit(
      'progress',
      progressAt(321, 1300, 'launcher', '2026-11-12T10:00:00Z'),
    );
    await playback.key('back');
    await settle();
    expect(playback.state).toMatchObject({
      state: 'finished',
      reason: 'stopped',
    });
    expect((await watch.get(episodes[1]!.ref))?.progress.positionSeconds).toBe(
      321,
    );
  });

  it('pauses and resumes with OK and skips with left and right', async () => {
    const { fake, playback } = await setup();
    await playback.play({ playable: episodes[1]! });
    const session = fake.sessions[0]!;
    session.emit(
      'progress',
      progressAt(100, 1300, 'launcher', '2026-11-12T10:00:00Z'),
    );
    await playback.key('ok');
    expect(session.paused).toBe(true);
    await playback.key('ok');
    expect(session.paused).toBe(false);
    await playback.key('left');
    expect(session.seeks).toEqual([90]);
  });

  it('ignores events from a video that was replaced', async () => {
    const { fake, playback } = await setup();
    await playback.play({ playable: episodes[1]! });
    await playback.play({ playable: episodes[2]! });
    fake.sessions[0]!.emit('ended');
    await settle();
    expect(playback.state).toMatchObject({
      state: 'playing',
      playable: { number: 1 },
    });
  });

  it('reports a video that would not start and shows the launcher again', async () => {
    const { fake, playback, screen } = await setup();
    fake.provider.play = async () => {
      throw new Error('No video started');
    };
    await playback.play({ playable: episodes[0]! });
    expect(playback.state).toMatchObject({
      state: 'finished',
      reason: 'failed',
    });
    expect(screen.front).toBe('launcher');
  });
});
