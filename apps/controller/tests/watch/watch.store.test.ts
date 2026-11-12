import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { progressAt } from '@kiosk-tv/shared';
import { describe, expect, it } from 'vitest';

import { WatchStore } from '../../src/watch/watch.store.js';
import { episode, show, silentLog } from '../support/fakes.js';

async function store() {
  const dir = await mkdtemp(join(tmpdir(), 'kiosk-tv-'));
  return new WatchStore(join(dir, 'watch.json'), silentLog);
}

const serial = show('sunnxt', '198692', 'Moondru Mudichu');

describe('WatchStore', () => {
  it('keeps the newer of two records for the same episode', async () => {
    const watch = await store();
    const e = episode(serial, 688);
    await watch.record(
      e,
      progressAt(600, 1300, 'launcher', '2026-11-12T10:00:00Z'),
    );
    await watch.record(
      e,
      progressAt(100, 1300, 'provider', '2026-11-11T10:00:00Z'),
    );
    expect((await watch.get(e.ref))?.progress.positionSeconds).toBe(600);
  });

  it('lists the most recently watched first', async () => {
    const watch = await store();
    await watch.record(
      episode(serial, 1),
      progressAt(10, 100, 'launcher', '2026-11-10T10:00:00Z'),
    );
    await watch.record(
      episode(serial, 2),
      progressAt(10, 100, 'launcher', '2026-11-12T10:00:00Z'),
    );
    expect((await watch.recent()).map((w) => w.playable.number)).toEqual([
      2, 1,
    ]);
    expect((await watch.lastOfShow(serial.ref))?.playable.number).toBe(2);
  });

  it('does not store the progress a playable arrived with twice', async () => {
    const watch = await store();
    const e = {
      ...episode(serial, 3),
      progress: progressAt(1, 100, 'provider'),
    };
    await watch.record(
      e,
      progressAt(50, 100, 'launcher', '2026-11-12T10:00:00Z'),
    );
    expect((await watch.get(e.ref))?.playable).not.toHaveProperty('progress');
  });
});
