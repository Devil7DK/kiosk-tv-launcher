import { describe, expect, it } from 'vitest';

import { createYouTubeProvider } from '../src/youtube.provider.js';
import { browseId, contextFor, fakeSite, fixture } from './fake-site.js';

const channels = { match: browseId('FEchannels'), body: fixture('channels') };
const kitchen = { provider: 'youtube', id: 'UCexamplekitchen0000001' };

describe('YouTube provider', () => {
  it('is logged out when the browser holds no Google session', async () => {
    const { page } = fakeSite([], false);
    await expect(
      createYouTubeProvider(contextFor(page)).status(),
    ).resolves.toEqual({
      state: 'loggedOut',
    });
  });

  it('offers the account’s playlists but leaves subscriptions out of My shows', async () => {
    const { page } = fakeSite([
      channels,
      { match: browseId('FEplaylist_aggregation'), body: fixture('playlists') },
    ]);
    const library = await createYouTubeProvider(contextFor(page)).library();
    expect(library.follows).toEqual([]);
    expect(library.playlists.map((p) => p.ref.id)).toEqual([
      'PLexample0001',
      'WL',
    ]);
  });

  it('names a subscribed channel with its picture enlarged for a tile', async () => {
    const { page } = fakeSite([channels]);
    const channel = await createYouTubeProvider(contextFor(page)).title(
      kitchen,
    );
    expect([channel.name, channel.kind]).toEqual([
      'Example Kitchen',
      'channel',
    ]);
    expect(channel.artwork.landscape?.url).toBe(
      'https://yt3.ggpht.com/example=s480-c-k',
    );
  });

  it('lists a channel’s videos without Shorts or streams, and pages on', async () => {
    const { page, requests } = fakeSite([
      channels,
      { match: browseId(kitchen.id), body: fixture('channel-videos') },
    ]);
    const listing = await createYouTubeProvider(contextFor(page)).episodes(
      kitchen,
    );
    expect(listing.page.items.map((v) => v.title)).toEqual([
      'Sambar rice, wedding style',
      'Rasam three ways',
    ]);
    expect(listing.page.items[1]).toMatchObject({
      durationSeconds: 3881,
      progress: { fraction: 0.5, source: 'provider' },
      parent: { name: 'Example Kitchen' },
      url: 'https://www.youtube.com/watch?v=vid00000004',
    });
    expect(listing.page.next).toBe('NEXT-PAGE-TOKEN');
    expect(requests.find((r) => r.browseId === kitchen.id)?.params).toBe(
      'EgZ2aWRlb3PyBgQKAjoA',
    );
  });

  it('lists a playlist newest first and goes on from oldest to newest', async () => {
    const { page } = fakeSite([
      { match: browseId('VLPLexample0001'), body: fixture('playlist') },
      channels,
    ]);
    const provider = createYouTubeProvider(contextFor(page));
    const listing = await provider.episodes({
      provider: 'youtube',
      id: 'PLexample0001',
    });
    // No episode numbers or ages: the playlist is taken to grow at the end.
    expect(listing.page.items.map((v) => v.title)).toEqual([
      'Garlic pickle',
      'Lemon pickle',
      'Mango pickle',
    ]);
    const oldest = listing.page.items[2]!;
    expect((await provider.next!(oldest))?.title).toBe('Lemon pickle');
    expect(await provider.next!(listing.page.items[0]!)).toBeNull();
    const fromChannel = {
      ...oldest,
      parent: { ref: kitchen, name: 'Example Kitchen' },
    };
    await expect(provider.next!(fromChannel)).resolves.toBeNull();
  });

  it('keeps a playlist that already runs newest first', async () => {
    const { page } = fakeSite([
      {
        match: browseId('VLPLnumbered00001'),
        body: fixture('playlist-newest-first'),
      },
    ]);
    const listing = await createYouTubeProvider(contextFor(page)).episodes({
      provider: 'youtube',
      id: 'PLnumbered00001',
    });
    expect(listing.page.items.map((v) => v.number)).toEqual([369, 368, 1]);
  });

  it('turns playlist, channel and handle links into what they point at', async () => {
    const { page, requests } = fakeSite([
      { match: browseId('VLPLexample0001'), body: fixture('playlist') },
      channels,
      {
        match: (r) => r.url === 'https://www.youtube.com/@examplekitchen',
        body: {
          endpoint: { browseEndpoint: { browseId: 'UCexamplekitchen0000001' } },
        },
      },
    ]);
    const provider = createYouTubeProvider(contextFor(page));
    const playlist = await provider.resolve!(
      new URL('https://www.youtube.com/playlist?list=PLexample0001'),
    );
    expect(playlist).toMatchObject({
      kind: 'playlist',
      name: 'Pickle recipes',
    });
    const handle = await provider.resolve!(
      new URL('https://m.youtube.com/@examplekitchen'),
    );
    expect(handle).toMatchObject({ kind: 'channel', name: 'Example Kitchen' });
    expect(
      await provider.resolve!(new URL('https://www.hotstar.com/in/shows/x/1')),
    ).toBeUndefined();
    expect(
      requests.some((r) => r.url === 'https://www.youtube.com/@examplekitchen'),
    ).toBe(true);
  });

  it('starts the tab with YouTube’s suggestions and new videos, then one row per channel', async () => {
    const { page } = fakeSite([
      channels,
      { match: browseId('FEwhat_to_watch'), body: fixture('channel-videos') },
      { match: browseId('FEsubscriptions'), body: fixture('channel-videos') },
      {
        match: (r) =>
          typeof r.browseId === 'string' && r.browseId.startsWith('UC'),
        body: fixture('channel-videos'),
      },
    ]);
    const shelves = await createYouTubeProvider(contextFor(page)).shelves({
      languages: ['ta'],
    });
    expect(shelves.items.map((s) => s.title)).toEqual([
      'Suggested for you',
      'New from your channels',
      'Example Kitchen',
      'Example Songs',
    ]);
    expect(shelves.next).toBeUndefined();
  });
});
