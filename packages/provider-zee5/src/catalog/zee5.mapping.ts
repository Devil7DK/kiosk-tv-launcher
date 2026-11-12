import type { ProviderLogger } from '@kiosk-tv/provider-kit';
import {
  type CatalogItem,
  type Image,
  type Playable,
  progressAt,
  type Title,
} from '@kiosk-tv/shared';
import type { z } from 'zod';

import { SITE } from '../api/zee5.api.js';
import type { Episode, RailItem, Show } from '../api/zee5.schemas.js';

export const PROVIDER = 'zee5';

/** ZEE5 resizes on its image server; the id is the value the API gives for that kind. */
export function image(
  contentId: string,
  kind: 'list' | 'cover' | 'portrait',
  imageId: string | null | undefined,
  width: number,
  height: number,
): Image | undefined {
  if (!imageId) return undefined;
  return {
    url: `https://akamaividz2.zee5.com/image/upload/w_${width},h_${height},c_scale,f_auto,q_auto:eco/resources/${contentId}/${kind}/${imageId.replace(/\.jpg$/, '')}.jpg`,
    width,
    height,
  };
}

export function parseEach<Schema extends z.ZodType>(
  items: readonly unknown[] | null | undefined,
  schema: Schema,
  log: ProviderLogger,
  where: string,
): z.infer<Schema>[] {
  const out: z.infer<Schema>[] = [];
  let skipped = 0;
  for (const item of items ?? []) {
    const parsed = schema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
    else skipped++;
  }
  if (skipped > 0)
    log.warn('skipped entries of an unexpected shape', { where, skipped });
  return out;
}

function siteUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  return `${SITE}/${path.replace(/^\/+/, '')}`;
}

export function showToTitle(show: Show): Title {
  const landscape = image(show.id, 'list', show.image?.list, 640, 360);
  const backdrop = image(show.id, 'list', show.image?.list, 1920, 1080);
  return {
    ref: { provider: PROVIDER, id: show.id },
    kind: 'series',
    name: show.title,
    ...(show.description?.trim()
      ? { description: show.description.trim() }
      : {}),
    artwork: {
      ...(landscape ? { landscape } : {}),
      ...(backdrop ? { backdrop } : {}),
    },
    ...(show.languages?.length ? { languages: show.languages } : {}),
    url: siteUrl(show.webUrl) ?? `${SITE}/tv-shows/details/x/${show.id}`,
  };
}

export function episodeToPlayable(episode: Episode): Playable | undefined {
  const url = siteUrl(episode.webUrl);
  if (!url) return undefined;
  const landscape = image(episode.id, 'list', episode.image?.list, 640, 360);
  const duration = episode.duration ?? 0;
  const played = episode.playedDuration ?? 0;
  const isEpisode = Boolean(episode.tvShow);
  return {
    ref: { provider: PROVIDER, id: episode.id },
    kind: isEpisode ? 'episode' : 'movie',
    title: episode.title,
    ...(episode.tvShow
      ? {
          parent: {
            ref: { provider: PROVIDER, id: episode.tvShow.id },
            name: episode.tvShow.title,
          },
        }
      : {}),
    ...(episode.episodeNumber ? { number: episode.episodeNumber } : {}),
    ...(episode.releaseDate
      ? { airDate: episode.releaseDate.slice(0, 10) }
      : {}),
    ...(duration > 0 ? { durationSeconds: duration } : {}),
    artwork: landscape ? { landscape } : {},
    ...(played > 0 && duration > 0
      ? { progress: progressAt(played, duration, 'provider') }
      : {}),
    url,
  };
}

export function railItemToCatalogItem(item: RailItem): CatalogItem | undefined {
  const kind = item.assetSubType ?? item.asset_subtype;
  const url = siteUrl(item.webUrl ?? item.web_url ?? item.slug);
  if (!url) return undefined;
  const list = item.image?.list;
  const landscape = image(item.id, 'list', list, 640, 360);
  const backdrop = image(item.id, 'list', list, 1920, 1080);
  const artwork = {
    ...(landscape ? { landscape } : {}),
    ...(backdrop ? { backdrop } : {}),
  };
  const common = {
    ...(item.description?.trim()
      ? { description: item.description.trim() }
      : {}),
    ...(item.languages?.length ? { languages: item.languages } : {}),
    artwork,
  };
  if (kind === 'tvshow' || kind === 'original') {
    return {
      ref: { provider: PROVIDER, id: item.id },
      kind: 'series',
      name: item.title,
      ...common,
      url,
    };
  }
  if (kind === 'movie') {
    const released = (item.releaseDate ?? item.release_date)?.slice(0, 10);
    return {
      ref: { provider: PROVIDER, id: item.id },
      kind: 'movie',
      title: item.title,
      ...common,
      ...(item.duration ? { durationSeconds: item.duration } : {}),
      ...(released ? { airDate: released } : {}),
      url,
    };
  }
  return undefined;
}
