import type { ProviderLogger } from '@kiosk-tv/provider-kit';
import {
  type Artwork,
  type CatalogItem,
  type Playable,
  progressAt,
} from '@kiosk-tv/shared';
import type { z } from 'zod';

import { SITE } from '../api/hotstar.api.js';
import {
  type Actions,
  ContinueCardSchema,
  PlayableContentSchema,
  type Poster,
  PosterSchema,
  type SearchCard,
  WatchInfoSchema,
} from '../api/hotstar.schemas.js';

export const PROVIDER = 'hotstar';

export function image(src: string | null | undefined, width: number) {
  if (!src) return undefined;
  return {
    url: `https://img10.hotstar.com/image/upload/f_auto,q_90,w_${width}/${src}`,
  };
}

/** The first browser path among the actions, optionally only of one page type. */
export function slugOf(
  actions: Actions,
  pageType?: string,
): string | undefined {
  for (const action of actions?.on_click ?? []) {
    for (const target of [action.page_navigation, action.open_page_overlay]) {
      if (target?.page_slug && (!pageType || target.page_type === pageType)) {
        return target.page_slug;
      }
    }
  }
  return undefined;
}

function isTile(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    ('content_id' in value || 'cw_info' in value),
  );
}

/**
 * Tray items wrap the tile in a key naming its look, and "Top 10" tiles wrap a
 * plain poster once more; the tile is what matters.
 */
function tileOf(item: unknown): unknown {
  if (!item || typeof item !== 'object') return undefined;
  for (const wrapper of Object.values(item)) {
    const data: unknown =
      wrapper && typeof wrapper === 'object' && 'data' in wrapper
        ? wrapper.data
        : undefined;
    if (isTile(data)) return data;
    if (data && typeof data === 'object') {
      for (const inner of Object.values(data)) {
        const candidate: unknown =
          inner && typeof inner === 'object' && 'data' in inner
            ? inner.data
            : inner;
        if (isTile(candidate)) return candidate;
      }
    }
  }
  return undefined;
}

export function parseTiles<Schema extends z.ZodType>(
  items: readonly unknown[] | null | undefined,
  schema: Schema,
  log: ProviderLogger,
  where: string,
): z.infer<Schema>[] {
  const out: z.infer<Schema>[] = [];
  let skipped = 0;
  for (const item of items ?? []) {
    const parsed = schema.safeParse(tileOf(item));
    if (parsed.success) out.push(parsed.data);
    else skipped++;
  }
  if (skipped > 0)
    log.warn('skipped entries of an unexpected shape', { where, skipped });
  return out;
}

function languagesOf(
  selector:
    | {
        languages?: { language?: { iso2code?: string | null } | null }[] | null;
      }
    | null
    | undefined,
): string[] | undefined {
  const codes = (selector?.languages ?? [])
    .map((l) => l.language?.iso2code)
    .filter((c): c is string => Boolean(c));
  return codes.length > 0 ? codes : undefined;
}

/** `alt.label` reads "Bigg Boss,Show" or "Leo,Movie". */
function kindOf(poster: Poster): string | undefined {
  return poster.alt?.label?.split(',').at(-1)?.trim().toLowerCase();
}

export function posterToItem(poster: Poster): CatalogItem | undefined {
  const info = poster.expanded_content_poster?.content_info;
  const name = info?.title ?? poster.alt?.label?.split(',')[0];
  if (!name) return undefined;
  const slug = slugOf(poster.actions);
  const landscape = image(poster.expanded_content_poster?.image?.src, 640);
  const portrait = image(poster.image?.src, 400);
  const artwork: Artwork = {
    ...(landscape
      ? {
          landscape,
          backdrop: image(poster.expanded_content_poster?.image?.src, 1920)!,
        }
      : {}),
    ...(portrait ? { portrait } : {}),
    ...(info?.title_cutout?.src
      ? { logo: image(info.title_cutout.src, 640)! }
      : {}),
  };
  const languages = languagesOf(
    poster.expanded_content_poster?.content_language_selector,
  );
  const description = info?.description ?? undefined;
  const common = {
    ...(description ? { description } : {}),
    ...(languages ? { languages } : {}),
    artwork,
  };
  const kind = kindOf(poster);
  if (kind === 'show' && slug?.startsWith('/in/shows/')) {
    return {
      ref: { provider: PROVIDER, id: poster.content_id },
      kind: 'series',
      name,
      ...common,
      url: SITE + slug,
    };
  }
  if (kind === 'movie') {
    const watch =
      slugOf(info?.primary_cta?.actions, 'WatchPage') ??
      (slug && `${slug}/watch`);
    if (!watch?.startsWith('/in/movies/')) return undefined;
    return {
      ref: { provider: PROVIDER, id: poster.content_id },
      kind: 'movie',
      title: name,
      ...common,
      url: SITE + watch,
    };
  }
  return undefined;
}

export function parsePosters(
  items: readonly unknown[] | null | undefined,
  log: ProviderLogger,
  where: string,
): CatalogItem[] {
  return parseTiles(items, PosterSchema, log, where)
    .map(posterToItem)
    .filter((item): item is CatalogItem => item !== undefined);
}

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

/** "12 Nov 2026" as 2026-11-12. */
export function parseDate(text: string): string | undefined {
  const match = /^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})$/.exec(text.trim());
  if (!match) return undefined;
  const month = MONTHS.indexOf(match[2]!.toLowerCase()) + 1;
  if (month === 0) return undefined;
  return `${match[3]}-${String(month).padStart(2, '0')}-${match[1]!.padStart(2, '0')}`;
}

/** "19m", "1h 5m", "2h" in seconds. */
export function parseDuration(text: string): number | undefined {
  const match = /^(?:(\d+)h)? ?(?:(\d+)m)?$/.exec(text.trim());
  if (!match || (!match[1] && !match[2])) return undefined;
  return (Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0)) * 60;
}

function progressOf(info: z.infer<typeof WatchInfoSchema>) {
  const position = Number(info?.resume_at ?? 0) / 1000;
  const duration = Number(info?.duration ?? 0) / 1000;
  if (!(position > 0) || !(duration > 0)) return undefined;
  const at = Number(info?.timestamp);
  return progressAt(
    position,
    duration,
    'provider',
    at > 0 ? new Date(at).toISOString() : undefined,
  );
}

export function episodeOf(
  content: z.infer<typeof PlayableContentSchema>,
  show: { id: string; name: string },
): Playable | undefined {
  const slug = slugOf(content.actions, 'WatchPage') ?? slugOf(content.actions);
  if (!slug) return undefined;
  let season: number | undefined;
  let number: number | undefined;
  let airDate: string | undefined;
  let durationSeconds: number | undefined;
  for (const tag of content.tags ?? []) {
    const value = tag.value ?? '';
    const se = /^S(\d+) E(\d+)$/.exec(value);
    if (se) {
      season = Number(se[1]);
      number = Number(se[2]);
    }
    airDate ??= parseDate(value);
    durationSeconds ??= parseDuration(value);
  }
  const landscape = image(content.poster?.src, 640);
  const progress = progressOf(content.cw_info);
  return {
    ref: { provider: PROVIDER, id: content.content_id },
    kind: 'episode',
    title:
      number === undefined ? content.title : `E${number} · ${content.title}`,
    parent: { ref: { provider: PROVIDER, id: show.id }, name: show.name },
    ...(season === undefined ? {} : { season }),
    ...(number === undefined ? {} : { number }),
    ...(airDate ? { airDate } : {}),
    ...(durationSeconds ? { durationSeconds } : {}),
    ...(content.description ? { description: content.description } : {}),
    artwork: landscape ? { landscape } : {},
    ...(progress ? { progress } : {}),
    url: SITE + slug,
  };
}

export function continueCardOf(
  card: z.infer<typeof ContinueCardSchema>,
): Playable | undefined {
  const slug = slugOf(card.actions);
  const id = card.cw_info?.content_id;
  if (!slug || !id) return undefined;
  const label = card.alt?.label ?? '';
  const name = label.split(',')[0]?.trim() || card.footer?.title || 'Untitled';
  const isEpisode = card.meta_info?.content_type === 'EPISODE';
  const parentId = card.cw_info?.parent_content_id;
  const progress = progressOf(card.cw_info);
  const landscape = image(card.image?.src, 640);
  const number = card.meta_info?.episode_number ?? undefined;
  return {
    ref: { provider: PROVIDER, id },
    kind: isEpisode ? 'episode' : 'movie',
    title: isEpisode ? (card.footer?.title ?? name) : name,
    ...(isEpisode && parentId
      ? { parent: { ref: { provider: PROVIDER, id: parentId }, name } }
      : {}),
    ...(number ? { number } : {}),
    artwork: landscape ? { landscape } : {},
    ...(progress ? { progress } : {}),
    url: SITE + slug,
  };
}

const LANGUAGE_CODES: Record<string, string> = {
  tamil: 'ta',
  telugu: 'te',
  hindi: 'hi',
  kannada: 'kn',
  malayalam: 'ml',
  marathi: 'mr',
  bengali: 'bn',
  english: 'en',
};

/** A search card's languages, from the words of its details; none for "5 Languages". */
function searchCardLanguages(card: SearchCard): string[] | undefined {
  const words = [
    ...(card.content_info ?? []),
    ...(card.sub_title ?? '').split('•'),
  ].map((w) => w.trim().toLowerCase());
  const codes = words
    .map((w) => LANGUAGE_CODES[w])
    .filter((c): c is string => c !== undefined);
  return codes.length > 0 ? codes : undefined;
}

/** A show or movie found by search; clips and promos are left out. */
export function searchCardToItem(card: SearchCard): CatalogItem | undefined {
  const slug = (
    slugOf(card.actions) ?? slugOf(card.primary_cta?.actions)
  )?.replace(/\?.*/, '');
  const id = slug ? /\/(\d+)(?:\/watch)?$/.exec(slug)?.[1] : undefined;
  if (!slug || !id) return undefined;
  const landscape = image(card.image?.src, 640);
  const artwork: Artwork = landscape
    ? { landscape, backdrop: image(card.image?.src, 1920)! }
    : {};
  const languages = searchCardLanguages(card);
  const common = { ...(languages ? { languages } : {}), artwork };
  if (slug.startsWith('/in/shows/')) {
    return {
      ref: { provider: PROVIDER, id },
      kind: 'series',
      name: card.title,
      ...common,
      url: SITE + slug,
    };
  }
  if (slug.startsWith('/in/movies/')) {
    return {
      ref: { provider: PROVIDER, id },
      kind: 'movie',
      title: card.title,
      ...common,
      url: SITE + (slug.endsWith('/watch') ? slug : `${slug}/watch`),
    };
  }
  return undefined;
}
