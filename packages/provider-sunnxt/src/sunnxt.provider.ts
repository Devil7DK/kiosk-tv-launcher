import {
  type CatalogOptions,
  openAndPlay,
  type PlayerProfile,
  type Provider,
  type ProviderContext,
} from '@kiosk-tv/provider-kit';
import type {
  CatalogItem,
  EpisodeListing,
  Page,
  Playable,
  ProviderStatus,
  Ref,
  Shelf,
  Title,
} from '@kiosk-tv/shared';

import { languageName, SunNxtApi } from './api/sunnxt.api.js';
import type { CarouselRow, Content } from './api/sunnxt.schemas.js';
import {
  isBefore,
  type Month,
  monthGroups,
  monthId,
  parseMonth,
  previousMonth,
} from './catalog/episode-months.js';
import {
  inLanguages,
  parseContents,
  showIdOf,
  toCatalogItem,
  toPlayable,
  toTitle,
} from './catalog/sunnxt.mapping.js';

export interface SunNxtConfig {
  profile: string;
}

/** The TV and Movies pages of the site, in that order. */
const SHELF_GROUPS = ['portalTvShows', 'portalMovies'];
const SHELF_PAGE = 20;
const SHELVES_PER_CALL = 4;
/** Months with no episode (a break, a show not yet started) skipped before giving up a page. */
const EMPTY_MONTHS_TO_SKIP = 6;

function currentMonth(now: Date): Month {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function createSunNxtProvider(
  context: ProviderContext<SunNxtConfig>,
  now: () => Date = () => new Date(),
): Provider {
  const { config, pages, log } = context;
  let language = 'tamil';
  const api = new SunNxtApi(
    () => pages.background(),
    () => language,
  );
  let rows: CarouselRow[] | undefined;

  function useLanguages(options: CatalogOptions): void {
    language = languageName(options.languages[0] ?? 'ta');
  }

  async function ensureProfile(): Promise<ProviderStatus> {
    const current = await api.currentProfile();
    const profiles = (await api.profiles()).message.results;
    const wanted = profiles.find((p) => p.name === config.profile);
    if (!wanted) {
      return {
        state: 'failed',
        reason: `Sun NXT has no viewer profile named "${config.profile}"`,
      };
    }
    if (current.result.profile._id === wanted.id) return { state: 'ready' };

    log.info('switching viewer profile', { to: wanted.name });
    await api.switchProfile(wanted.id, wanted.name);
    const after = (await api.currentProfile()).result.profile._id;
    if (after === wanted.id) return { state: 'ready' };
    const actual = profiles.find((p) => p.id === after)?.name ?? String(after);
    return { state: 'wrongProfile', expected: wanted.name, actual };
  }

  async function shelfItems(
    name: string,
    page: number,
    languages: readonly string[],
  ): Promise<Page<CatalogItem>> {
    const response = await api.carousel(name, page, SHELF_PAGE);
    const results = response.results ?? [];
    const items = parseContents(results, log, `carousel ${name}`)
      .map(toCatalogItem)
      .filter((item): item is CatalogItem => item !== undefined)
      .filter((item) => inLanguages(item, languages));
    return {
      items,
      ...(results.length >= SHELF_PAGE ? { next: String(page + 1) } : {}),
    };
  }

  async function allRows(): Promise<CarouselRow[]> {
    if (!rows) {
      const groups = await Promise.all(
        SHELF_GROUPS.map((g) => api.carouselRows(g)),
      );
      rows = groups.flatMap((g) => g.results);
    }
    return rows;
  }

  async function detail(id: string): Promise<Content> {
    const [content] = parseContents(
      (await api.contentDetail(id)).results,
      log,
      `detail ${id}`,
    );
    if (!content) throw new Error(`Sun NXT has no content ${id}`);
    return content;
  }

  const profile: PlayerProfile = {
    async ensureProfile() {
      const status = await ensureProfile();
      if (status.state !== 'ready') {
        log.warn('playing on another viewer profile', { status: status.state });
      }
    },
    // The page keeps a second, idle <video> for ads next to the programme.
    video: 'longest',
    fullscreen: { key: 'f' },
    resumes: false,
  };

  return {
    async status() {
      try {
        return await ensureProfile();
      } catch (error) {
        log.warn('could not read the Sun NXT account', {
          error: String(error),
        });
        return { state: 'loggedOut' };
      }
    },

    async library() {
      const favourites = parseContents(
        (await api.favourites()).results,
        log,
        'favourites',
      );
      const showIds = new Set<string>();
      for (const item of favourites) {
        const id =
          item.generalInfo.type === 'vodchannel' ? item._id : showIdOf(item);
        if (id) showIds.add(id);
      }
      const follows: Title[] = [];
      for (const id of showIds) {
        const title = toTitle(await detail(id));
        if (title) follows.push(title);
      }
      return { follows, playlists: [] };
    },

    async shelves(options) {
      useLanguages(options);
      const all = await allRows();
      const start = Number(options.cursor ?? 0);
      const shelves: Shelf[] = [];
      let index = start;
      for (; index < all.length && shelves.length < SHELVES_PER_CALL; index++) {
        const row = all[index]!;
        const items = await shelfItems(row.name, 1, options.languages);
        if (items.items.length > 0) {
          shelves.push({ id: row.name, title: row.title || row.name, items });
        }
      }
      return {
        items: shelves,
        ...(index < all.length ? { next: String(index) } : {}),
      };
    },

    async shelf(id, options) {
      useLanguages(options);
      return shelfItems(id, Number(options.cursor ?? 1), options.languages);
    },

    async title(ref: Ref) {
      const title = toTitle(await detail(ref.id));
      if (!title) throw new Error(`Sun NXT content ${ref.id} is not a show`);
      return title;
    },

    async episodes(ref, options = {}): Promise<EpisodeListing> {
      const show = await detail(ref.id);
      const tabs = show.generalInfo.showDisplayTabs;
      const first =
        parseMonth(tabs?.showDisplayStart) ??
        parseMonth(show.content?.releaseDate) ??
        currentMonth(now());
      const last = parseMonth(tabs?.showDisplayEnd) ?? currentMonth(now());

      let month = parseMonth(options.cursor ?? options.group) ?? last;
      const items: Playable[] = [];
      for (
        let empty = 0;
        !isBefore(month, first);
        month = previousMonth(month)
      ) {
        const found = parseContents(
          (await api.episodes(ref.id, month.year, month.month)).results,
          log,
          `episodes ${monthId(month)}`,
        )
          .map(toPlayable)
          .filter((p): p is Playable => p !== undefined);
        items.push(...found);
        if (found.length > 0 || ++empty >= EMPTY_MONTHS_TO_SKIP) {
          month = previousMonth(month);
          break;
        }
      }
      return {
        groups: monthGroups(first, last),
        page: {
          items,
          ...(!isBefore(month, first) ? { next: monthId(month) } : {}),
        },
      };
    },

    async play(playable, options = {}) {
      return openAndPlay(await pages.player(), {
        playable,
        profile,
        log,
        ...(options.resumeAt === undefined
          ? {}
          : { resumeAt: options.resumeAt }),
      });
    },
  };
}
