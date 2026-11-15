import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type PowerAction, progressAt } from '@kiosk-tv/shared';
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
  fakeBacklight,
  fakeBluetooth,
  fakeModule,
  fakeProvider,
  noPages,
  show,
  silentLog,
} from '../support/fakes.js';

const serial = show('alpha', 's1', 'Moondru Mudichu');
const SPEAKER = '00:11:22:33:44:55';

async function api() {
  return (await setup()).app;
}

const pressed: string[] = [];

async function setup(
  power?: (action: PowerAction) => Promise<void>,
  /** null for a screen without a backlight. */
  brightness: number | null = 40,
) {
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
    pressRemote: async (button) => void pressed.push(button),
    remote: () => ({ batteryLow: false }),
    battery: () => undefined,
    bluetooth: fakeBluetooth([{ address: SPEAKER, name: 'Speaker' }]),
    backlight: fakeBacklight(brightness ?? undefined),
    ...(power ? { power } : {}),
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

  it('refuses to shut down a computer not set up for it, and says so', async () => {
    const app = await api();
    expect(await (await app.request('/power')).json()).toEqual({
      available: false,
    });
    const res = await app.request('/power', json({ action: 'shutdown' }));
    expect(res.status).toBe(404);
  });

  it('answers before restarting, so the launcher hears back', async () => {
    const asked: PowerAction[] = [];
    const { app } = await setup(async (action) => {
      asked.push(action);
    });
    expect(await (await app.request('/power')).json()).toEqual({
      available: true,
    });
    const res = await app.request('/power', json({ action: 'restart' }));
    expect(res.status).toBe(202);
    expect(asked).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(asked).toEqual(['restart']);
  });

  it('passes a button from the admin page on as a press of the remote', async () => {
    const app = await api();
    pressed.length = 0;
    expect(
      (await app.request('/remote/press', json({ button: 'volumeUp' }))).status,
    ).toBe(204);
    expect(
      (await app.request('/remote/press', json({ button: 'power' }))).status,
    ).toBe(400);
    expect(pressed).toEqual(['volumeUp']);
  });

  it('changes the brightness and answers with the new one', async () => {
    const app = await api();
    expect(await (await app.request('/brightness')).json()).toEqual({
      percent: 40,
    });
    const res = await app.request('/brightness', {
      ...json({ percent: 70 }),
      method: 'PUT',
    });
    expect(await res.json()).toEqual({ percent: 70 });
  });

  it('refuses to darken the screen completely', async () => {
    const app = await api();
    const res = await app.request('/brightness', {
      ...json({ percent: 0 }),
      method: 'PUT',
    });
    expect(res.status).toBe(400);
  });

  it('reports no brightness for a screen without a backlight', async () => {
    const { app } = await setup(undefined, null);
    expect(await (await app.request('/brightness')).json()).toEqual({});
    const res = await app.request('/brightness', {
      ...json({ percent: 50 }),
      method: 'PUT',
    });
    expect(res.status).toBe(503);
  });

  it('finds a speaker, pairs with it and forgets it again', async () => {
    const app = await api();
    expect((await app.request('/bluetooth/scan', json({}))).status).toBe(202);
    const found = (await (await app.request('/bluetooth')).json()) as {
      devices: { address: string; paired: boolean }[];
    };
    expect(found.devices).toEqual([
      { address: SPEAKER, name: 'Speaker', paired: false, connected: false },
    ]);
    const connect = await app.request(
      `/bluetooth/devices/${SPEAKER}/connect`,
      json({}),
    );
    expect(connect.status).toBe(204);
    const forget = await app.request(`/bluetooth/devices/${SPEAKER}`, {
      method: 'DELETE',
    });
    expect(forget.status).toBe(204);
  });

  it('says plainly when a device cannot be reached', async () => {
    const res = await (
      await api()
    ).request('/bluetooth/devices/66:77:88:99:AA:BB/connect', json({}));
    expect(res.status).toBe(502);
    expect(await res.text()).toMatch(/pairing mode/);
  });

  it('refuses an address that is not one', async () => {
    const res = await (
      await api()
    ).request('/bluetooth/devices/not-an-address/connect', json({}));
    expect(res.status).toBe(400);
  });

  it('searches every service at once, and wants something to search for', async () => {
    const app = await api();
    expect((await app.request('/search?q=%20')).status).toBe(400);
    const res = await app.request('/search?q=moondru');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
