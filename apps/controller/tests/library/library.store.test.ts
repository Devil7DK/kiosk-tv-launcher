import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  LibraryStore,
  NotFoundError,
} from '../../src/library/library.store.js';
import { episode, show, silentLog } from '../support/fakes.js';

async function store() {
  const dir = await mkdtemp(join(tmpdir(), 'kiosk-tv-'));
  return new LibraryStore(join(dir, 'library.json'), silentLog);
}

const serial = show('sunnxt', '198692', 'Moondru Mudichu');

describe('LibraryStore', () => {
  it('follows a show once even when added twice', async () => {
    const library = await store();
    await library.follow(serial);
    const after = await library.follow(serial);
    expect(after.follows).toHaveLength(1);
  });

  it('tells a missing follow apart from a failure', async () => {
    const library = await store();
    await expect(library.unfollow('sunnxt:1')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('moves a playlist to the requested place', async () => {
    const library = await store();
    for (const name of ['Bhakti', 'Cooking', 'Songs']) {
      await library.createPlaylist({
        name,
        source: { type: 'manual', items: [] },
      });
    }
    const songs = (await library.read()).playlists[2]!;
    const after = await library.updatePlaylist(songs.id, { position: 0 });
    expect(after.playlists.map((p) => p.name)).toEqual([
      'Songs',
      'Bhakti',
      'Cooking',
    ]);
  });

  it('adds an item to a playlist only once', async () => {
    const library = await store();
    const { playlists } = await library.createPlaylist({
      name: 'Bhakti',
      source: { type: 'manual', items: [] },
    });
    const item = episode(serial, 688);
    await library.addToPlaylist(playlists[0]!.id, item);
    const after = await library.addToPlaylist(playlists[0]!.id, item);
    expect(after.playlists[0]?.source).toMatchObject({ items: [item] });
  });

  it('will not edit the items of a playlist kept in sync with a provider', async () => {
    const library = await store();
    const { playlists } = await library.createPlaylist({
      name: 'Kitchen',
      source: { type: 'provider', title: { ...serial, kind: 'playlist' } },
    });
    await expect(
      library.addToPlaylist(playlists[0]!.id, episode(serial, 1)),
    ).rejects.toThrow(/made here/);
  });

  it('tells listeners when something changed', async () => {
    const library = await store();
    let changes = 0;
    library.onChange(() => changes++);
    await library.updateSettings({ continueWatching: 'all' });
    expect(changes).toBe(1);
    expect((await library.read()).settings).toEqual({
      continueWatching: 'all',
      languages: ['ta'],
      scale: 1,
    });
  });
});
