import { describe, expect, it } from 'vitest';

import { createHotstarProvider } from '../src/hotstar.provider.js';
import { contextFor, fakeSite, fixture } from './fake-site.js';

const myPage = {
  match: /deeplink_url":"\/in\/mypage/,
  body: fixture('my-page'),
};
const showPage = {
  match: /deeplink_url":"\/in\/shows\/x\/1260129356/,
  body: fixture('show-page'),
};

describe('JioHotstar provider', () => {
  it('is ready when the cookie already names the configured profile', async () => {
    const { page } = fakeSite([myPage]);
    await expect(
      createHotstarProvider(contextFor(page)).status(),
    ).resolves.toEqual({
      state: 'ready',
    });
  });

  it('switches to the configured profile with the URL the site offers for it', async () => {
    const { page, site } = fakeSite(
      [
        myPage,
        {
          match: /switchProfile&position=0/,
          body: {},
          profileId: 'home0000000000000000000000000001',
        },
      ],
      'test00000000000000000000000000003',
    );
    const status = await createHotstarProvider(
      contextFor(page, 'Home'),
    ).status();
    expect(status).toEqual({ state: 'ready' });
    expect(site.requests.at(-1)?.body).toContain(
      'home0000000000000000000000000001',
    );
  });

  it('picks the profile again when the site asks who is watching, even if the cookie names it', async () => {
    const onboarding = {
      match: /deeplink_url":"\/in\/browse\/watchlist/,
      body: fixture('my-page'),
    };
    const { page, site } = fakeSite([
      onboarding,
      myPage,
      {
        match: /switchProfile&position=4/,
        body: {},
        profileId: 'test00000000000000000000000000003',
      },
    ]);
    await createHotstarProvider(contextFor(page)).library();
    expect(site.requests.some((r) => r.url.includes('switchProfile'))).toBe(
      true,
    );
  });

  it('refuses a profile name the account does not have', async () => {
    const { page } = fakeSite([myPage]);
    await expect(
      createHotstarProvider(contextFor(page, 'Amma')).status(),
    ).resolves.toMatchObject({
      state: 'failed',
    });
  });

  it('reports a rejected token as logged out', async () => {
    const { page } = fakeSite([{ match: /start/, status: 401, body: {} }]);
    await expect(
      createHotstarProvider(contextFor(page)).status(),
    ).resolves.toEqual({
      state: 'loggedOut',
    });
  });

  it('reads the show and its newest episodes with their numbers, dates and progress', async () => {
    const { page } = fakeSite([showPage]);
    const listing = await createHotstarProvider(contextFor(page)).episodes({
      provider: 'hotstar',
      id: '1260129356',
    });
    expect(listing.groups?.map((g) => g.label)).toEqual([
      'Nov 2026',
      'Oct 2026',
    ]);
    expect(listing.page.items[0]).toMatchObject({
      kind: 'episode',
      number: 1173,
      airDate: '2026-11-12',
      parent: { name: 'Siragadikka Aasai' },
      progress: { source: 'provider' },
    });
    expect(listing.page.items[0]?.url).toMatch(
      /^https:\/\/www\.hotstar\.com\/in\/shows\/.+\/watch/,
    );
    expect(listing.page.next).toContain('pageNo');
  });

  it('moves on to the next month after the last page of one', async () => {
    const { page } = fakeSite([
      showPage,
      {
        match: /items\?.*token/,
        body: {
          success: { widget_wrapper: { widget: { data: { items: [] } } } },
        },
      },
    ]);
    const provider = createHotstarProvider(contextFor(page));
    const first = await provider.episodes({
      provider: 'hotstar',
      id: '1260129356',
    });
    const second = await provider.episodes(
      { provider: 'hotstar', id: '1260129356' },
      { cursor: first.page.next! },
    );
    expect(second.page.next).toBe(first.groups?.[1]?.id);
  });

  it('keeps shows and films on a tray, unwraps Top 10 tiles and drops live channels', async () => {
    const { page } = fakeSite([
      { match: /deeplink_url":"\/in\/shows"/, body: fixture('shows-page') },
    ]);
    const shelves = await createHotstarProvider(contextFor(page)).shelves({
      languages: ['ta'],
    });
    expect(shelves.items.map((s) => s.title)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Star Vijay/),
        expect.stringMatching(/^Top 10/),
      ]),
    );
    expect(shelves.items.some((s) => s.title.startsWith('Entertainment'))).toBe(
      false,
    );
    expect(JSON.parse(shelves.next!)).toMatchObject({ page: 0 });
  });

  it('reads Continue Watching with the show name and how far it got', async () => {
    const { page } = fakeSite([
      { match: /continue-watching/, body: fixture('continue-watching') },
    ]);
    const [first] = await createHotstarProvider(contextFor(page)).progress!();
    expect(first?.parent?.name).toBe('Siragadikka Aasai');
    expect(first?.progress?.fraction).toBeGreaterThan(0);
  });

  it('never requests a path that did not come from the site', async () => {
    const { page } = fakeSite([]);
    await expect(
      createHotstarProvider(contextFor(page)).shelf('x', {
        languages: ['ta'],
        cursor: 'https://evil.example/',
      }),
    ).rejects.toThrow();
  });
});
