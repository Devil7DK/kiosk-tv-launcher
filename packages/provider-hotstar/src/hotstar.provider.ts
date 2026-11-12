import {
  type CatalogOptions,
  openAndPlay,
  type PlayerProfile,
  type Provider,
  type ProviderContext,
} from '@kiosk-tv/provider-kit';
import type {
  CatalogItem,
  EpisodeGroup,
  EpisodeListing,
  Page,
  Playable,
  ProviderStatus,
  Ref,
  Shelf,
  Title,
} from '@kiosk-tv/shared';
import type { z } from 'zod';

import { HotstarApi, isBffPath, SITE } from './api/hotstar.api.js';
import {
  CategoryTraySchema,
  ContinueCardSchema,
  HeroSchema,
  PlayableContentSchema,
  ProfilesSchema,
  type StartPage,
  TrayDataSchema,
  type WidgetWrapper,
} from './api/hotstar.schemas.js';
import {
  continueCardOf,
  episodeOf,
  image,
  parsePosters,
  parseTiles,
  PROVIDER,
} from './catalog/hotstar.mapping.js';

export interface HotstarConfig {
  profile: string;
}

/** The TV and Movies pages of the site, in that order. */
const SHELF_PAGES = ['/in/shows', '/in/movies'];
const CONTINUE_WATCHING =
  '/in/browse/continue-watching/continue-watching/p13n-cw';
const WATCHLIST = '/in/browse/watchlist/watchlist/p13n-wl';

function widgets(
  wrappers: readonly WidgetWrapper[] | null | undefined,
  template: string,
): unknown[] {
  return (wrappers ?? [])
    .filter((w) => w.template === template)
    .map((w) => w.widget?.data);
}

function pageWidgets(page: StartPage, template: string): unknown[] {
  return Object.values(page.spaces).flatMap((space) =>
    widgets(space.widget_wrappers, template),
  );
}

function firstOf<Schema extends z.ZodType>(
  items: unknown[],
  schema: Schema,
): z.infer<Schema> | undefined {
  for (const item of items) {
    const parsed = schema.safeParse(item);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

interface ShelfCursor {
  page: number;
  space?: string;
}

/** Pages of one month share its start date, whatever their token says. */
function monthOf(path: string): string | undefined {
  return /fromBroadcastDate=(\d+)/.exec(path)?.[1];
}

/** Month tabs carry their range in the URL; the year comes from its start. */
function groupOf(tab: {
  title: string;
  tray_widget_url: string;
}): EpisodeGroup {
  const from = Number(/fromBroadcastDate=(\d+)/.exec(tab.tray_widget_url)?.[1]);
  const year = from > 0 ? new Date(from * 1000).getFullYear() : undefined;
  return {
    id: tab.tray_widget_url,
    label: year ? `${tab.title} ${year}` : tab.title,
  };
}

export function createHotstarProvider(
  context: ProviderContext<HotstarConfig>,
): Provider {
  const { config, pages, log } = context;
  const api = new HotstarApi(() => pages.background());
  /** Name and month tabs of shows already opened, for paging without the show page. */
  const shows = new Map<string, { name: string; groups: EpisodeGroup[] }>();

  /**
   * `force` picks the profile even when the cookie already names it: the site
   * asks "Who's watching?" again after a while, and only a pick answers that.
   */
  async function ensureProfile(force = false): Promise<ProviderStatus> {
    const page = await api.start('/in/mypage');
    const container = firstOf(
      pageWidgets(page, 'ProfilesContainerWidget'),
      ProfilesSchema,
    );
    const profiles = container?.profile_selection.data.profiles ?? [];
    if (profiles.length === 0) return { state: 'loggedOut' };
    const wanted = profiles.find((p) => p.profile_name === config.profile);
    if (!wanted) {
      return {
        state: 'failed',
        reason: `JioHotstar has no viewer profile named "${config.profile}"`,
      };
    }
    if (!force && (await api.currentProfileId()) === wanted.id) {
      return { state: 'ready' };
    }

    const actions = wanted.actions?.select_profile ?? wanted.select_profile;
    const url = actions?.on_click?.find((a) => a.fetch_widget)?.fetch_widget
      ?.url;
    if (!url || !isBffPath(url)) {
      return { state: 'failed', reason: 'The profile switch is not offered' };
    }
    log.info('switching viewer profile', { to: wanted.profile_name });
    await api.switchProfile(url, wanted.id);
    if ((await api.currentProfileId()) === wanted.id) return { state: 'ready' };
    const current = await api.currentProfileId();
    const actual =
      profiles.find((p) => p.id === current)?.profile_name ?? 'another profile';
    return { state: 'wrongProfile', expected: wanted.profile_name, actual };
  }

  /** A page; when the site asks "Who's watching?" first, picks the profile and asks again. */
  async function page(deeplink: string): Promise<StartPage> {
    const first = await api.start(deeplink);
    if (first.template !== 'OnboardingPage') return first;
    await ensureProfile(true);
    return api.start(deeplink);
  }

  function traysOf(
    wrappers: readonly WidgetWrapper[] | null | undefined,
    options: CatalogOptions,
  ): Shelf[] {
    const shelves: Shelf[] = [];
    for (const wrapper of wrappers ?? []) {
      if (wrapper.template !== 'ScrollableTrayWidget') continue;
      const tray = TrayDataSchema.safeParse(wrapper.widget?.data);
      if (!tray.success) continue;
      const title =
        tray.data.header?.regular_tray_header?.title ??
        tray.data.header?.title ??
        undefined;
      const items = parsePosters(tray.data.items, log, `tray ${title}`).filter(
        (item) =>
          !item.languages ||
          item.languages.some((l) => options.languages.includes(l)),
      );
      if (!title || items.length === 0) continue;
      const next = tray.data.next_tray_url ?? undefined;
      shelves.push({
        id: title,
        title,
        items: { items, ...(next ? { next } : {}) },
      });
    }
    return shelves;
  }

  async function itemsPage(
    path: string,
    languages: readonly string[],
  ): Promise<Page<CatalogItem>> {
    if (!isBffPath(path)) throw new Error('Unknown page of items');
    const data = await api.items(path);
    const items = parsePosters(data.items, log, 'items').filter(
      (item) =>
        !item.languages || item.languages.some((l) => languages.includes(l)),
    );
    const next = data.next_tray_url ?? data.more_grid_items_url ?? undefined;
    return { items, ...(next ? { next } : {}) };
  }

  async function grid(deeplink: string): Promise<unknown[]> {
    const found = await page(deeplink);
    return pageWidgets(found, 'GridWidget').flatMap((data) => {
      const parsed = TrayDataSchema.safeParse(data);
      return parsed.success ? (parsed.data.items ?? []) : [];
    });
  }

  async function showPage(id: string) {
    const found = await page(`/in/shows/x/${id}`);
    const hero = firstOf(pageWidgets(found, 'HeroGECWidget'), HeroSchema);
    if (!hero) throw new Error(`JioHotstar show ${id} has no details`);
    const tray = firstOf(
      pageWidgets(found, 'CategoryTrayWidget'),
      CategoryTraySchema,
    );
    return { hero, tray };
  }

  async function title(ref: Ref): Promise<Title> {
    const { hero } = await showPage(ref.id);
    const info = hero.content_info;
    const backdrop = image(hero.hero_img?.src, 1920);
    const landscape = image(hero.hero_img?.src, 640);
    const logo = image(info.title_cutout?.src, 640);
    return {
      ref,
      kind: 'series',
      name: info.title,
      ...(info.description ? { description: info.description } : {}),
      artwork: {
        ...(landscape ? { landscape } : {}),
        ...(backdrop ? { backdrop } : {}),
        ...(logo ? { logo } : {}),
      },
      url: `${SITE}/in/shows/x/${ref.id}`,
    };
  }

  const profile: PlayerProfile = {
    async ensureProfile() {
      const status = await ensureProfile().catch(() => undefined);
      if (status?.state !== 'ready')
        log.warn('playing without the configured profile');
    },
    video: 'longest',
    fullscreen: { key: 'f' },
    dismiss: [`[data-testid=profile-wrapper-id]:has-text("${config.profile}")`],
    resumes: true,
  };

  return {
    async status() {
      try {
        return await ensureProfile();
      } catch (error) {
        log.warn('could not read the JioHotstar account', {
          error: String(error),
        });
        return { state: 'loggedOut' };
      }
    },

    async library() {
      const follows = parsePosters(
        await grid(WATCHLIST),
        log,
        'watchlist',
      ).filter((item): item is Title => 'name' in item);
      return { follows, playlists: [] };
    },

    async progress() {
      return parseTiles(
        await grid(CONTINUE_WATCHING),
        ContinueCardSchema,
        log,
        'continue watching',
      )
        .map(continueCardOf)
        .filter((p): p is Playable => p !== undefined);
    },

    async shelves(options) {
      const cursor: ShelfCursor = options.cursor
        ? (JSON.parse(options.cursor) as ShelfCursor)
        : { page: 0 };
      let wrappers: readonly WidgetWrapper[] | null | undefined;
      let nextSpace: string | null | undefined;
      if (cursor.space && isBffPath(cursor.space)) {
        const space = await api.space(cursor.space);
        wrappers = space.widget_wrappers;
        nextSpace = space.data?.next_space_url;
      } else {
        const found = await page(SHELF_PAGES[cursor.page] ?? SHELF_PAGES[0]!);
        wrappers = found.spaces.tray?.widget_wrappers;
        nextSpace = found.spaces.tray?.data?.next_space_url;
      }
      const next: ShelfCursor | undefined = nextSpace
        ? { page: cursor.page, space: nextSpace }
        : cursor.page + 1 < SHELF_PAGES.length
          ? { page: cursor.page + 1 }
          : undefined;
      return {
        items: traysOf(wrappers, options),
        ...(next ? { next: JSON.stringify(next) } : {}),
      };
    },

    async shelf(_id, options) {
      if (!options.cursor) return { items: [] };
      return itemsPage(options.cursor, options.languages);
    },

    title,

    async resolve(url) {
      if (!/(^|\.)hotstar\.com$/.test(url.hostname)) return undefined;
      const id = /\/shows\/[^/]+\/(\d+)/.exec(url.pathname)?.[1];
      return id ? title({ provider: PROVIDER, id }) : undefined;
    },

    async episodes(ref, options = {}): Promise<EpisodeListing> {
      const path = options.cursor ?? options.group;
      let show = shows.get(ref.id);
      let items: unknown[] = [];
      let next: string | undefined;

      if (!path || !show) {
        const { hero, tray } = await showPage(ref.id);
        show = {
          name: hero.content_info.title,
          groups: (tray?.category_picker.data.tabs ?? []).map((t) =>
            groupOf(t.tab.data),
          ),
        };
        shows.set(ref.id, show);
        if (!path) {
          items = tray?.tray_items.data.items ?? [];
          next = tray?.tray_items.data.next_tray_url ?? show.groups[1]?.id;
        }
      }
      if (path) {
        if (!isBffPath(path)) throw new Error('Unknown page of episodes');
        const data = await api.items(path);
        items = data.items ?? [];
        const month = monthOf(path);
        const tab = show.groups.findIndex((g) => monthOf(g.id) === month);
        next =
          data.next_tray_url ??
          (tab >= 0 ? show.groups[tab + 1]?.id : undefined);
      }
      const parent = { id: ref.id, name: show.name };
      const episodes = parseTiles(
        items,
        PlayableContentSchema,
        log,
        `episodes ${ref.id}`,
      )
        .map((content) => episodeOf(content, parent))
        .filter((e): e is Playable => e !== undefined);
      return {
        groups: show.groups,
        page: { items: episodes, ...(next ? { next } : {}) },
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

export { PROVIDER };
