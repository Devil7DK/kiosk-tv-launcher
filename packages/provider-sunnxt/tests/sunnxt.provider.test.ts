import { describe, expect, it } from 'vitest';

import { createSunNxtProvider } from '../src/sunnxt.provider.js';
import { contextFor, fakeSite, fixture, type Route } from './fake-site.js';

const account: Route[] = [
  { match: /next\/api\/userProfile/, body: fixture('user-profile') },
  { match: /subProfiles/, body: fixture('sub-profiles') },
];

const options = { languages: ['ta'] };
const november = () => new Date('2026-11-12T10:00:00+05:30');

describe('Sun NXT provider', () => {
  it('is ready when the session is already on the configured profile', async () => {
    const { page } = fakeSite(account);
    const provider = createSunNxtProvider(contextFor(page, 'Owner'));
    await expect(provider.status()).resolves.toEqual({ state: 'ready' });
  });

  it('switches to the configured profile and reports it when the switch does not hold', async () => {
    const { page, requests } = fakeSite([
      ...account,
      { match: /switchProfile/, body: 'Profile switched successfully!' },
    ]);
    const provider = createSunNxtProvider(contextFor(page, 'Test'));
    await expect(provider.status()).resolves.toEqual({
      state: 'wrongProfile',
      expected: 'Test',
      actual: 'Owner',
    });
    expect(requests.find((r) => r.method === 'POST')?.body).toBe(
      'userId=1002&username=Test',
    );
  });

  it('refuses a profile name the account does not have', async () => {
    const { page } = fakeSite(account);
    const provider = createSunNxtProvider(contextFor(page, 'Amma'));
    await expect(provider.status()).resolves.toMatchObject({ state: 'failed' });
  });

  it('reports a session the API rejects as logged out', async () => {
    const { page } = fakeSite([
      { match: /userProfile/, status: 500, body: '{}' },
    ]);
    const provider = createSunNxtProvider(contextFor(page));
    await expect(provider.status()).resolves.toEqual({ state: 'loggedOut' });
  });

  it('follows the show of a favourited episode', async () => {
    const { page } = fakeSite([
      { match: /favorites/, body: fixture('favorites') },
      {
        match: /contentDetail\/198692\//,
        body: fixture('content-detail-show'),
      },
    ]);
    const library = await createSunNxtProvider(contextFor(page)).library();
    expect(library.follows.map((t) => t.name)).toEqual(['Moondru Mudichu']);
  });

  it('lists this month first and points the next page at the month before', async () => {
    const { page, requests } = fakeSite([
      {
        match: /contentDetail\/198692\//,
        body: fixture('content-detail-show'),
      },
      { match: /betweenDates=20260111/, body: fixture('vods-month') },
    ]);
    const listing = await createSunNxtProvider(
      contextFor(page),
      november,
    ).episodes({
      provider: 'sunnxt',
      id: '198692',
    });
    expect(listing.page.items.map((e) => e.number)).toEqual([688, 687, 686]);
    expect(listing.page.next).toBe('2026-10');
    expect(listing.groups?.[0]).toEqual({ id: '2026-11', label: 'Nov 2026' });
    expect(listing.groups?.at(-1)).toEqual({
      id: '2024-08',
      label: 'Aug 2024',
    });
    expect(requests.filter((r) => r.url.includes('/vods/'))).toHaveLength(1);
  });

  it('drops rows with nothing left after filtering and keeps the rest', async () => {
    const info = fixture('carousel-info-tv') as { results: unknown[] };
    const { page } = fakeSite([
      { match: /group=portalTvShows/, body: info },
      { match: /group=portalMovies/, body: { results: [] } },
      { match: /carousel\/liveChannelsPortal3ptO/, body: { results: [] } },
      { match: /carousel\//, body: fixture('carousel-mixed') },
    ]);
    const shelves = await createSunNxtProvider(contextFor(page)).shelves(
      options,
    );
    expect(shelves.items.map((s) => s.id)).not.toContain(
      'liveChannelsPortal3ptO',
    );
    expect(shelves.items[0]?.items.items).toHaveLength(3);
  });

  it('finds the show from a detail link, whatever its slug', async () => {
    const { page } = fakeSite([
      {
        match: /contentDetail\/198692\//,
        body: fixture('content-detail-show'),
      },
    ]);
    const provider = createSunNxtProvider(contextFor(page));
    const title = await provider.resolve!(
      new URL(
        'https://www.sunnxt.com/suntv-tamil-serial-moondru-mudichu/detail/198692/282534',
      ),
    );
    expect(title).toMatchObject({ kind: 'series', name: 'Moondru Mudichu' });
    expect(
      await provider.resolve!(new URL('https://www.hotstar.com/in/shows/x/1')),
    ).toBeUndefined();
  });

  it('finds a serial through its episodes, named on each, and leaves out other languages', async () => {
    const { page } = fakeSite([
      { match: /search\/.*type=tvSeries/, body: fixture('search-shows') },
      { match: /search\/.*type=movie/, body: fixture('search-movies') },
      {
        match: /contentDetail\/198692\//,
        body: fixture('content-detail-show'),
      },
    ]);
    const found = await createSunNxtProvider(contextFor(page)).search!(
      'moondru mudichu',
      { languages: ['ta'] },
    );
    expect(
      found.map((item) => ('name' in item ? item.name : item.title)),
    ).toEqual([
      'Moondru Mudichu',
      'Moondru Mudichu - Highlights',
      'Moondru Mudichu - Weekly Recap',
      'E555 - Jun 08, 2026',
      'E553 - Jun 05, 2026',
      'Moondram Kan',
    ]);
    expect(found[3]).toMatchObject({
      kind: 'episode',
      parent: { ref: { id: '198692' }, name: 'Moondru Mudichu' },
    });
  });
});
