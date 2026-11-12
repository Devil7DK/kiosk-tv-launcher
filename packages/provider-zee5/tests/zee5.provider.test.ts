import { describe, expect, it } from 'vitest';

import { createZee5Provider } from '../src/zee5.provider.js';
import { contextFor, fakeSite, fixture } from './fake-site.js';

const profiles = { match: /profiles\.zee5\.com/, body: fixture('profiles') };
const now = () => Date.parse('2026-11-12T10:00:00Z') / 1000;

describe('ZEE5 provider', () => {
  it('switches the profile in the browser when the cookie names another one', async () => {
    const { page, site } = fakeSite([profiles], {
      signedIn: true,
      profileId: 'p-owner',
    });
    await expect(
      createZee5Provider(contextFor(page), now).status(),
    ).resolves.toEqual({ state: 'ready' });
    expect(site.profileSet).toBe('p-test');
  });

  it('warns a day ahead that the four-day login runs out', async () => {
    const expiresAt = now() + 3 * 60 * 60;
    const { page } = fakeSite([profiles], {
      signedIn: true,
      profileId: 'p-test',
      expiresAt,
    });
    await expect(
      createZee5Provider(contextFor(page), now).status(),
    ).resolves.toEqual({
      state: 'expiring',
      at: new Date(expiresAt * 1000).toISOString(),
    });
  });

  it('reports a browser with no login as logged out', async () => {
    const { page } = fakeSite([], { signedIn: false });
    await expect(
      createZee5Provider(contextFor(page), now).status(),
    ).resolves.toEqual({
      state: 'loggedOut',
    });
  });

  it('reads episodes newest first and pages on within the season', async () => {
    const { page, site } = fakeSite([
      { match: /TVSDQ/, body: fixture('show') },
      { match: /FEQ/, body: fixture('episodes') },
    ]);
    const listing = await createZee5Provider(contextFor(page), now).episodes({
      provider: 'zee5',
      id: '0-6-4z5846408',
    });
    expect(listing.page.items.map((e) => e.number)).toEqual([273, 272]);
    expect(listing.page.items[0]).toMatchObject({
      airDate: '2026-11-11',
      parent: { name: 'Thirumangalyam' },
    });
    expect(listing.page.items[0]?.url).toMatch(
      /^https:\/\/www\.zee5\.com\/tv-shows\/details\//,
    );
    expect(listing.page.next).toBe('0-2-5z5846623|2');
    expect(site.requests.find((r) => r.includes('FEQ'))).toContain(
      '"seasonId":"0-2-5z5846623"',
    );
  });

  it('turns watch history into progress the controller can merge', async () => {
    const { page } = fakeSite([{ match: /WHQ/, body: fixture('history') }]);
    const [first] = await createZee5Provider(contextFor(page), now).progress!();
    expect(first).toMatchObject({
      number: 272,
      progress: { positionSeconds: 295, source: 'provider' },
    });
  });

  it('follows the shows on the watchlist', async () => {
    const { page } = fakeSite([{ match: /WL/, body: fixture('watchlist') }]);
    const library = await createZee5Provider(contextFor(page), now).library();
    expect(library.follows.map((t) => t.name)).toEqual(['Thirumangalyam']);
  });

  it('builds TV rows from the language page and offers the movies after', async () => {
    const { page, site } = fakeSite([
      { match: /\/tv-shows\/lang\/tamil$/, body: fixture('tv-language-page') },
    ]);
    const shelves = await createZee5Provider(contextFor(page), now).shelves({
      languages: ['ta'],
    });
    expect(shelves.items).toHaveLength(2);
    expect(shelves.items[0]?.items.items[0]).toMatchObject({ kind: 'series' });
    expect(shelves.next).toBe('movies');
    expect(site.requests).toContain('https://www.zee5.com/tv-shows/lang/tamil');
  });

  it('reads films from the movie page as playable', async () => {
    const { page } = fakeSite([
      { match: /\/movies\/lang\/tamil$/, body: fixture('movie-language-page') },
    ]);
    const shelves = await createZee5Provider(contextFor(page), now).shelves({
      languages: ['ta'],
      cursor: 'movies',
    });
    expect(shelves.items[0]?.items.items[0]).toMatchObject({ kind: 'movie' });
    expect(shelves.next).toBeUndefined();
  });

  it('finds the show from a show or an episode link', async () => {
    const { page } = fakeSite([{ match: /TVSDQ/, body: fixture('show') }]);
    const provider = createZee5Provider(contextFor(page), now);
    const fromEpisode = await provider.resolve!(
      new URL(
        'https://www.zee5.com/tv-shows/details/thirumangalyam/0-6-4z5846408/thirumangalyam-november-10-2026/0-1-6z51107774',
      ),
    );
    expect(fromEpisode).toMatchObject({
      kind: 'series',
      name: 'Thirumangalyam',
    });
    expect(
      await provider.resolve!(new URL('https://www.youtube.com/@x')),
    ).toBeUndefined();
  });
});
