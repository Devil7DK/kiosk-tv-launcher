import {
  openAndPlay,
  type PlayerProfile,
  type Provider,
  type ProviderContext,
} from '@kiosk-tv/provider-kit';
import type { Page, Playable, Ref, Shelf, Title } from '@kiosk-tv/shared';

import { type Browse, YouTubeApi } from './api/youtube.api.js';
import {
  channelToTitle,
  collect,
  continuationOf,
  isChannelId,
  isNewestFirst,
  lockupAgeSeconds,
  lockupToPlayable,
  lockupToPlaylist,
} from './catalog/youtube.mapping.js';

/** The Videos tab of a channel, newest first. */
const CHANNEL_VIDEOS = 'EgZ2aWRlb3PyBgQKAjoA';
const SUBSCRIPTIONS = 'subscriptions';
const SHELVES_PER_CALL = 4;
const PLAYLIST_PAGE = 50;
/** A whole playlist is read at once (100 videos per request), up to this many. */
const PLAYLIST_REQUESTS = 30;
const PLAYLIST_KEPT_MS = 5 * 60_000;

interface PlaylistVideos {
  name: string;
  /** Newest first, whichever way the playlist itself runs. */
  items: Playable[];
}

export function createYouTubeProvider(
  context: ProviderContext<Record<string, never>>,
): Provider {
  const { pages, log } = context;
  const api = new YouTubeApi(() => pages.background());
  let channels: Promise<Title[]> | undefined;
  const playlists = new Map<
    string,
    { at: number; videos: Promise<PlaylistVideos> }
  >();

  function subscribedChannels(): Promise<Title[]> {
    channels ??= api.browse({ browseId: 'FEchannels' }).then((json) =>
      collect(json, 'channelRenderer')
        .map(channelToTitle)
        .filter((t): t is Title => t !== undefined),
    );
    channels.catch(() => {
      channels = undefined;
    });
    return channels;
  }

  async function videos(
    request: Browse,
    parent?: { id: string; name: string },
  ): Promise<Page<Playable>> {
    const json = await api.browse(request);
    const items = collect(json, 'lockupViewModel')
      .map((lockup) => lockupToPlayable(lockup, parent))
      .filter((p): p is Playable => p !== undefined);
    const next = continuationOf(json);
    return { items, ...(next ? { next } : {}) };
  }

  function listOf(ref: Ref, cursor?: string): Browse {
    if (cursor) return { continuation: cursor };
    return isChannelId(ref.id)
      ? { browseId: ref.id, params: CHANNEL_VIDEOS }
      : { browseId: `VL${ref.id}` };
  }

  /** Every video of a playlist, so its newest and its order are known. */
  function playlistVideos(id: string): Promise<PlaylistVideos> {
    const kept = playlists.get(id);
    if (kept && Date.now() - kept.at < PLAYLIST_KEPT_MS) return kept.videos;
    const videos = (async () => {
      const first = await api.browse({ browseId: `VL${id}` });
      const meta = collect(first, 'playlistMetadataRenderer')[0] as
        { title?: string } | undefined;
      const name = meta?.title ?? 'Playlist';
      const parent = { id, name };
      const entries: { video: Playable; age: number | undefined }[] = [];
      let json: unknown = first;
      for (let request = 0; request < PLAYLIST_REQUESTS; request++) {
        for (const lockup of collect(json, 'lockupViewModel')) {
          const video = lockupToPlayable(lockup, parent);
          if (video) entries.push({ video, age: lockupAgeSeconds(lockup) });
        }
        const next = continuationOf(json);
        if (!next) break;
        json = await api.browse({ continuation: next });
      }
      const ends = [entries[0], entries.at(-1)].map(
        (e) => e && { number: e.video.number, age: e.age },
      );
      const items = entries.map((e) => e.video);
      return {
        name,
        items: isNewestFirst(ends[0], ends[1]) ? items : items.reverse(),
      };
    })();
    playlists.set(id, { at: Date.now(), videos });
    videos.catch(() => playlists.delete(id));
    return videos;
  }

  async function title(ref: Ref): Promise<Title> {
    if (isChannelId(ref.id)) {
      const known = (await subscribedChannels()).find(
        (c) => c.ref.id === ref.id,
      );
      if (known) return known;
      const json = await api.browse({ browseId: ref.id });
      const meta = collect(json, 'channelMetadataRenderer')[0] as
        { title?: string; description?: string } | undefined;
      if (!meta?.title) throw new Error(`YouTube has no channel ${ref.id}`);
      return {
        ref,
        kind: 'channel',
        name: meta.title,
        ...(meta.description ? { description: meta.description } : {}),
        artwork: {},
        url: `https://www.youtube.com/channel/${ref.id}`,
      };
    }
    const { name, items } = await playlistVideos(ref.id);
    return {
      ref,
      kind: 'playlist',
      name,
      artwork: items[0]?.artwork ?? {},
      url: `https://www.youtube.com/playlist?list=${encodeURIComponent(ref.id)}`,
    };
  }

  const profile: PlayerProfile = {
    video: 'longest',
    // The f key does nothing until the player has focus; its own button always works.
    fullscreen: { click: '.ytp-fullscreen-button' },
    resumes: true,
    isSameVideo: (opened, current) =>
      current.pathname === '/watch' &&
      opened.searchParams.get('v') === current.searchParams.get('v'),
  };

  return {
    async status() {
      try {
        return (await api.signedIn())
          ? { state: 'ready' }
          : { state: 'loggedOut' };
      } catch (error) {
        log.warn('could not read the YouTube account', {
          error: String(error),
        });
        return { state: 'loggedOut' };
      }
    },

    async library() {
      const playlists = collect(
        await api.browse({ browseId: 'FEplaylist_aggregation' }),
        'lockupViewModel',
      )
        .map(lockupToPlaylist)
        .filter((t): t is Title => t !== undefined);
      // Subscriptions are too many for My shows; the YouTube tab has a row for each.
      return { follows: [], playlists };
    },

    async progress() {
      const history = await videos({ browseId: 'FEhistory' });
      return history.items.filter((p) => p.progress);
    },

    async shelves(options) {
      const all = [
        SUBSCRIPTIONS,
        ...(await subscribedChannels()).map((c) => c.ref.id),
      ];
      const named = new Map(
        (await subscribedChannels()).map((c) => [c.ref.id, c.name]),
      );
      const start = Number(options.cursor ?? 0);
      const shelves: Shelf[] = [];
      let index = start;
      for (; index < all.length && shelves.length < SHELVES_PER_CALL; index++) {
        const id = all[index]!;
        const items =
          id === SUBSCRIPTIONS
            ? await videos({ browseId: 'FEsubscriptions' })
            : await videos(listOf({ provider: 'youtube', id }), {
                id,
                name: named.get(id) ?? '',
              });
        if (items.items.length === 0) continue;
        shelves.push({
          id,
          title:
            id === SUBSCRIPTIONS
              ? 'New from your channels'
              : (named.get(id) ?? 'Channel'),
          items,
        });
      }
      return {
        items: shelves,
        ...(index < all.length ? { next: String(index) } : {}),
      };
    },

    async shelf(id, options) {
      if (!options.cursor) return { items: [] };
      const name = (await subscribedChannels()).find(
        (c) => c.ref.id === id,
      )?.name;
      return videos(
        { continuation: options.cursor },
        name ? { id, name } : undefined,
      );
    },

    title,

    async episodes(ref, options = {}) {
      if (!isChannelId(ref.id)) {
        const { items } = await playlistVideos(ref.id);
        const offset = Number(options.cursor ?? 0) || 0;
        const end = offset + PLAYLIST_PAGE;
        return {
          page: {
            items: items.slice(offset, end),
            ...(end < items.length ? { next: String(end) } : {}),
          },
        };
      }
      const parent = await title(ref);
      return {
        page: await videos(listOf(ref, options.cursor), {
          id: ref.id,
          name: parent.name,
        }),
      };
    },

    async next(playable) {
      const parent = playable.parent;
      // A channel has no order to follow; a playlist does.
      if (!parent || isChannelId(parent.ref.id)) return null;
      // Newest first, so the next episode is the one before it.
      const { items } = await playlistVideos(parent.ref.id);
      const index = items.findIndex((p) => p.ref.id === playable.ref.id);
      return index > 0 ? (items[index - 1] ?? null) : null;
    },

    async resolve(url) {
      const host = url.hostname.replace(/^(www|m|music)\./, '');
      if (host !== 'youtube.com' && host !== 'youtu.be') return undefined;
      const ref = (id: string): Ref => ({ provider: 'youtube', id });
      const list = url.searchParams.get('list');
      if (list) return title(ref(list));
      if (host === 'youtu.be') return undefined;
      const channel = /^\/channel\/(UC[\w-]+)/.exec(url.pathname)?.[1];
      if (channel) return title(ref(channel));
      if (/^\/(@[^/]+|c\/[^/]+|user\/[^/]+)/.test(url.pathname)) {
        const id = await api.resolveChannel(
          `https://www.youtube.com${url.pathname}`,
        );
        return id ? title(ref(id)) : undefined;
      }
      return undefined;
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
