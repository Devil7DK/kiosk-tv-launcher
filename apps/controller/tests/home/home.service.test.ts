import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { progressAt } from '@kiosk-tv/shared';
import { describe, expect, it } from 'vitest';

import { CatalogService } from '../../src/catalog/catalog.service.js';
import { HomeService } from '../../src/home/home.service.js';
import { LibraryStore } from '../../src/library/library.store.js';
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
const other = show('alpha', 's2', 'Kayal');
const pinned = show('alpha', 's3', 'Annam');
const serialEpisodes = [
  episode(serial, 3, '2026-11-12'),
  episode(serial, 2, '2026-11-11'),
];
const otherEpisodes = [episode(other, 9, '2026-11-01')];

async function setup(reported = serialEpisodes.slice(0, 0)) {
  const fake = fakeProvider(
    [
      { title: serial, episodes: serialEpisodes },
      { title: other, episodes: otherEpisodes },
      { title: pinned, episodes: [] },
    ],
    {
      library: async () => ({ follows: [serial, other], playlists: [] }),
      progress: async () => reported,
    },
  );
  const registry = await ProviderRegistry.start(
    { alpha: { profile: 'Test' } },
    {
      load: async () => fakeModule('alpha', fake.provider) as never,
      pagesFor: () => noPages,
      log: silentLog,
    },
  );
  const dir = await mkdtemp(join(tmpdir(), 'kiosk-tv-'));
  const library = new LibraryStore(join(dir, 'library.json'), silentLog);
  const watch = new WatchStore(join(dir, 'watch.json'), silentLog);
  const home = new HomeService({
    registry,
    catalog: new CatalogService(registry, silentLog),
    library,
    watch,
    log: silentLog,
  });
  return { home, library, watch };
}

describe('HomeService', () => {
  it('joins shows followed by hand with the account’s own list', async () => {
    const { home, library } = await setup();
    await library.follow(pinned);
    await library.follow(serial);
    const names = (await home.build()).myShows.map((s) => s.title.name);
    expect(names.sort()).toEqual(['Annam', 'Kayal', 'Moondru Mudichu']);
  });

  it('marks a show with an episode newer than the one last watched, and lists it first', async () => {
    const { home, watch } = await setup();
    await watch.record(
      serialEpisodes[1]!,
      progressAt(1300, 1300, 'launcher', '2026-11-11T21:00:00Z'),
    );
    const shows = (await home.build()).myShows;
    expect(shows[0]).toMatchObject({
      title: { name: 'Moondru Mudichu' },
      hasNew: true,
      latest: { number: 3 },
    });
    expect(shows[0]?.resume).toBeUndefined();
  });

  it('offers to carry on with a part-watched episode', async () => {
    const { home, watch } = await setup();
    await watch.record(
      serialEpisodes[0]!,
      progressAt(400, 1300, 'launcher', '2026-11-12T21:00:00Z'),
    );
    const built = await home.build();
    expect(built.myShows[0]).toMatchObject({
      resume: { number: 3 },
      hasNew: false,
    });
    expect(built.continueWatching.map((p) => p.number)).toEqual([3]);
  });

  it('shows what the services report only when the setting asks for it', async () => {
    const reported = [
      {
        ...otherEpisodes[0]!,
        progress: progressAt(100, 1200, 'provider', '2026-11-12T08:00:00Z'),
      },
    ];
    const { home, library } = await setup(reported);
    expect((await home.build()).continueWatching).toEqual([]);
    await library.updateSettings({ continueWatching: 'all' });
    home.refreshAccounts();
    expect((await home.build()).continueWatching.map((p) => p.number)).toEqual([
      9,
    ]);
  });

  it('leaves out an empty playlist', async () => {
    const { home, library } = await setup();
    await library.createPlaylist({
      name: 'Empty',
      source: { type: 'manual', items: [] },
    });
    await library.createPlaylist({
      name: 'Bhakti',
      source: { type: 'manual', items: [serial] },
    });
    expect((await home.build()).playlists.map((p) => p.name)).toEqual([
      'Bhakti',
    ]);
  });
});
