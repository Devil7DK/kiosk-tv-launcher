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
  lockupToPlayable,
  lockupToPlaylist,
} from './catalog/youtube.mapping.js';

/** The Videos tab of a channel, newest first. */
const CHANNEL_VIDEOS = 'EgZ2aWRlb3PyBgQKAjoA';
const SUBSCRIPTIONS = 'subscriptions';
const SHELVES_PER_CALL = 4;

export function createYouTubeProvider(
  context: ProviderContext<Record<string, never>>,
): Provider {
  const { pages, log } = context;
  const api = new YouTubeApi(() => pages.background());
  let channels: Promise<Title[]> | undefined;

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
    const json = await api.browse({ browseId: `VL${ref.id}` });
    const meta = collect(json, 'playlistMetadataRenderer')[0] as
      { title?: string } | undefined;
    return {
      ref,
      kind: 'playlist',
      name: meta?.title ?? 'Playlist',
      artwork: {},
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
      return { follows: await subscribedChannels(), playlists };
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
      const list = await videos(listOf(parent.ref), {
        id: parent.ref.id,
        name: parent.name,
      });
      const index = list.items.findIndex((p) => p.ref.id === playable.ref.id);
      return index >= 0 ? (list.items[index + 1] ?? null) : null;
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
