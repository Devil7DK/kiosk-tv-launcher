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

  it('follows the subscribed channels and offers the account’s playlists', async () => {
    const { page } = fakeSite([
      channels,
      { match: browseId('FEplaylist_aggregation'), body: fixture('playlists') },
    ]);
    const library = await createYouTubeProvider(contextFor(page)).library();
    expect(library.follows.map((c) => [c.name, c.kind])).toEqual([
      ['Example Kitchen', 'channel'],
      ['Example Songs', 'channel'],
    ]);
    expect(library.playlists.map((p) => p.ref.id)).toEqual([
      'PLexample0001',
      'WL',
    ]);
    expect(library.follows[0]?.artwork.landscape?.url).toBe(
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

  it('plays a playlist in its own order, and a channel in none', async () => {
    const { page } = fakeSite([
      { match: browseId('VLPLexample0001'), body: fixture('playlist') },
      channels,
    ]);
    const provider = createYouTubeProvider(contextFor(page));
    const listing = await provider.episodes({
      provider: 'youtube',
      id: 'PLexample0001',
    });
    const next = await provider.next!(listing.page.items[0]!);
    expect(next?.title).toBe('Lemon pickle');
    const fromChannel = {
      ...listing.page.items[0]!,
      parent: { ref: kitchen, name: 'Example Kitchen' },
    };
    await expect(provider.next!(fromChannel)).resolves.toBeNull();
  });

  it('starts the tab with the feed of new videos, then one row per channel', async () => {
    const { page } = fakeSite([
      channels,
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
      'New from your channels',
      'Example Kitchen',
      'Example Songs',
    ]);
    expect(shelves.next).toBeUndefined();
  });
});
