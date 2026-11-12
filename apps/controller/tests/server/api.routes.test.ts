import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { progressAt } from '@kiosk-tv/shared';
import { describe, expect, it } from 'vitest';

import { CatalogService } from '../../src/catalog/catalog.service.js';
import { EventHub } from '../../src/events/event.hub.js';
import { HomeService } from '../../src/home/home.service.js';
import { LibraryStore } from '../../src/library/library.store.js';
import { PlaybackService } from '../../src/playback/playback.service.js';
import { ProviderRegistry } from '../../src/providers/provider.registry.js';
import { createApi } from '../../src/server/api.routes.js';
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

async function api() {
  return (await setup()).app;
}

async function setup() {
  const fake = fakeProvider([
    { title: serial, episodes: [episode(serial, 1)] },
  ]);
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
  const catalog = new CatalogService(registry, silentLog);
  const events = new EventHub();
  const homeService = new HomeService({
    registry,
    catalog,
    library,
    watch,
    log: silentLog,
  });
  const playback = new PlaybackService({
    registry,
    catalog,
    watch,
    events,
    log: silentLog,
    screen: { showPlayer: async () => {}, showLauncher: async () => {} },
  });
  const app = createApi({
    registry,
    catalog,
    library,
    playback,
    watch,
    events,
    homeService,
    home: () => homeService.build(),
    remote: () => ({ batteryLow: false }),
    log: silentLog,
  });
  return { app, watch };
}

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

describe('API', () => {
  it('lists the episodes of a show by its ref key', async () => {
    const res = await (await api()).request('/titles/alpha:s1/episodes');
    expect(res.status).toBe(200);
    expect(
      ((await res.json()) as { page: { items: unknown[] } }).page.items,
    ).toHaveLength(1);
  });

  it('adds the progress recorded here to the episodes it lists', async () => {
    const { app, watch } = await setup();
    await watch.record(
      episode(serial, 1),
      progressAt(300, 1200, 'launcher', '2026-11-12T10:00:00Z'),
    );
    const res = await app.request('/titles/alpha:s1/episodes');
    const listing = (await res.json()) as {
      page: { items: { progress?: { positionSeconds: number } }[] };
    };
    expect(listing.page.items[0]?.progress?.positionSeconds).toBe(300);
  });

  it('answers 400 with the reason when a body does not match', async () => {
    const res = await (
      await api()
    ).request('/library/playlists', json({ name: '' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty('error');
  });

  it('answers 502 for a provider that is not running', async () => {
    const res = await (await api()).request('/providers/beta/shelves');
    expect(res.status).toBe(502);
  });

  it('refuses to play from a site the provider does not own', async () => {
    const res = await (
      await api()
    ).request(
      '/play',
      json({
        playable: { ...episode(serial, 1), url: 'https://evil.example/' },
      }),
    );
    expect(res.status).toBe(409);
  });

  it('accepts a play request and lets it start in the background', async () => {
    const res = await (
      await api()
    ).request('/play', json({ playable: episode(serial, 1) }));
    expect(res.status).toBe(202);
  });

  it('answers 404 when unfollowing a show that is not followed', async () => {
    const res = await (
      await api()
    ).request('/library/follows/alpha:s9', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('follows what a pasted link points at', async () => {
    const res = await (
      await api()
    ).request(
      '/library/follows/from-link',
      json({ url: 'https://alpha.example/show/s1' }),
    );
    expect(res.status).toBe(200);
    const answer = (await res.json()) as {
      title: { name: string };
      library: { follows: unknown[] };
    };
    expect(answer.title.name).toBe('Moondru Mudichu');
    expect(answer.library.follows).toHaveLength(1);
  });

  it('says plainly when a link is not one the TV knows', async () => {
    const res = await (
      await api()
    ).request(
      '/library/follows/from-link',
      json({ url: 'https://example.org/somewhere' }),
    );
    expect(res.status).toBe(400);
  });
});
