import {
  type CatalogOptions,
  openAndPlay,
  type PlayerProfile,
  type Provider,
  type ProviderContext,
} from '@kiosk-tv/provider-kit';
import type {
  CatalogItem,
  Playable,
  ProviderStatus,
  Shelf,
  Title,
} from '@kiosk-tv/shared';

import { Zee5Api } from './api/zee5.api.js';
import {
  EPISODES_QUERY,
  HISTORY_QUERY,
  SHOW_QUERY,
  WATCHLIST_QUERY,
} from './api/zee5.queries.js';
import {
  EpisodesAnswerSchema,
  EpisodeSchema,
  HistoryAnswerSchema,
  MovieLanguagePageSchema,
  ProfilesAnswerSchema,
  RailItemSchema,
  ShowAnswerSchema,
  ShowSchema,
  TvLanguagePageSchema,
  WatchlistAnswerSchema,
} from './api/zee5.schemas.js';
import {
  episodeToPlayable,
  parseEach,
  railItemToCatalogItem,
  showToTitle,
} from './catalog/zee5.mapping.js';

export interface Zee5Config {
  profile: string;
}

const PAGE_SIZE = 25;
const DAY = 24 * 60 * 60;

/** ZEE5's pages name a language in its URL. */
const LANGUAGE_PAGES: Record<string, string> = {
  ta: 'tamil',
  te: 'telugu',
  ml: 'malayalam',
  kn: 'kannada',
  hi: 'hindi',
  en: 'english',
  bn: 'bengali',
  mr: 'marathi',
};

export function createZee5Provider(
  context: ProviderContext<Zee5Config>,
  now: () => number = () => Date.now() / 1000,
): Provider {
  const { config, pages, log } = context;
  const api = new Zee5Api(() => pages.background());

  async function ensureProfile(): Promise<ProviderStatus> {
    const login = await api.login();
    if (!login.signedIn) return { state: 'loggedOut' };
    const { data: profiles } = await api.profiles(ProfilesAnswerSchema);
    const wanted = profiles.find((p) => p.name === config.profile);
    if (!wanted) {
      return {
        state: 'failed',
        reason: `ZEE5 has no viewer profile named "${config.profile}"`,
      };
    }
    if (login.profileId !== wanted.id) {
      log.info('switching viewer profile', { to: wanted.name });
      await api.useProfile(wanted);
    }
    if (login.expiresAt !== undefined && login.expiresAt - now() < DAY) {
      return {
        state: 'expiring',
        at: new Date(login.expiresAt * 1000).toISOString(),
      };
    }
    return { state: 'ready' };
  }

  async function show(id: string) {
    const answer = await api.query(
      'TVSDQ',
      SHOW_QUERY,
      { id },
      ShowAnswerSchema,
    );
    const found = answer.data?.tvShowRelatedContent;
    if (!found) throw new Error(`ZEE5 has no show ${id}`);
    return found;
  }

  const inLanguages = (item: CatalogItem, options: CatalogOptions) =>
    !item.languages ||
    item.languages.some((l) => options.languages.includes(l));

  const profile: PlayerProfile = {
    async ensureProfile() {
      const status = await ensureProfile().catch(() => undefined);
      if (status?.state !== 'ready' && status?.state !== 'expiring') {
        log.warn('playing without the configured profile');
      }
    },
    video: 'longest',
    // The player ignores the f key; a double click is what it answers to.
    fullscreen: { dblclick: 'video' },
    resumes: true,
  };

  return {
    async status() {
      try {
        return await ensureProfile();
      } catch (error) {
        log.warn('could not read the ZEE5 account', { error: String(error) });
        return { state: 'loggedOut' };
      }
    },

    async library() {
      const answer = await api.query(
        'WL',
        WATCHLIST_QUERY,
        {},
        WatchlistAnswerSchema,
      );
      const shows = (answer.data?.watchList ?? []).flatMap((group) =>
        parseEach(group.contents, ShowSchema, log, `watchlist ${group.id}`),
      );
      return { follows: shows.map(showToTitle), playlists: [] };
    },

    async progress() {
      const answer = await api.query(
        'WHQ',
        HISTORY_QUERY,
        {},
        HistoryAnswerSchema,
      );
      return parseEach(
        answer.data?.watchHistory?.contents,
        EpisodeSchema,
        log,
        'history',
      )
        .map(episodeToPlayable)
        .filter((p): p is Playable => p !== undefined);
    },

    async shelves(options) {
      const language = LANGUAGE_PAGES[options.languages[0] ?? 'ta'] ?? 'tamil';
      const movies = options.cursor === 'movies';
      const rails = movies
        ? (
            await api.pageData(
              `/movies/lang/${language}`,
              MovieLanguagePageSchema,
            )
          ).props.pageProps.initialRails.map((r) => ({
            title: r.title,
            items: r.contents,
          }))
        : (
            await api.pageData(
              `/tv-shows/lang/${language}`,
              TvLanguagePageSchema,
            )
          ).props.pageProps.railsData;
      const shelves: Shelf[] = [];
      for (const rail of rails) {
        const items = parseEach(
          rail.items,
          RailItemSchema,
          log,
          `rail ${rail.title}`,
        )
          .map(railItemToCatalogItem)
          .filter(
            (item): item is CatalogItem =>
              item !== undefined && inLanguages(item, options),
          );
        if (items.length > 0)
          shelves.push({
            id: `${movies ? 'm' : 't'}:${rail.title}`,
            title: rail.title,
            items: { items },
          });
      }
      return { items: shelves, ...(movies ? {} : { next: 'movies' }) };
    },

    async shelf() {
      // Every row arrives whole with its page.
      return { items: [] };
    },

    async title(ref): Promise<Title> {
      return showToTitle(await show(ref.id));
    },

    async resolve(url) {
      if (!/(^|\.)zee5\.com$/.test(url.hostname)) return undefined;
      // Show and episode links both carry the show's id.
      const id = /\b0-6-[\w-]+/.exec(url.pathname)?.[0];
      return id ? showToTitle(await show(id)) : undefined;
    },

    async episodes(ref, options = {}) {
      const found = await show(ref.id);
      const seasons = found.seasons ?? [];
      const [cursorSeason, cursorPage] = (options.cursor ?? '').split('|');
      const seasonId = cursorSeason || options.group || seasons[0]?.id;
      if (!seasonId) return { page: { items: [] } };
      const page = Number(cursorPage) || 1;
      const answer = await api.query(
        'FEQ',
        EPISODES_QUERY,
        {
          filter: {
            seasonId,
            itemType: 'episode',
            onAir: true,
            page,
            limit: PAGE_SIZE,
            translation: 'en',
            country: 'IN',
          },
        },
        EpisodesAnswerSchema,
      );
      const episodes = answer.data?.episodes;
      const items = parseEach(
        episodes?.contents,
        EpisodeSchema,
        log,
        `episodes ${ref.id}`,
      )
        .map(episodeToPlayable)
        .filter((p): p is Playable => p !== undefined);
      const more = episodes
        ? episodes.page * episodes.size < episodes.totalResults
        : false;
      return {
        ...(seasons.length > 1
          ? { groups: seasons.map((s) => ({ id: s.id, label: s.title })) }
          : {}),
        page: { items, ...(more ? { next: `${seasonId}|${page + 1}` } : {}) },
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
