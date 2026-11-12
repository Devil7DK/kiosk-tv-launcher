import type { ProviderLogger } from '@kiosk-tv/provider-kit';
import type {
  Artwork,
  CatalogItem,
  Image,
  Playable,
  Title,
} from '@kiosk-tv/shared';

import { languageCode, SITE } from '../api/sunnxt.api.js';
import { type Content, ContentSchema } from '../api/sunnxt.schemas.js';

export const PROVIDER = 'sunnxt';

/** Parses list entries one by one, skipping and counting the ones that do not fit. */
export function parseContents(
  results: readonly unknown[] | null | undefined,
  log: ProviderLogger,
  where: string,
): Content[] {
  const contents: Content[] = [];
  let skipped = 0;
  for (const item of results ?? []) {
    const parsed = ContentSchema.safeParse(item);
    if (parsed.success) contents.push(parsed.data);
    else skipped++;
  }
  if (skipped > 0)
    log.warn('skipped entries of an unexpected shape', { where, skipped });
  return contents;
}

function pickImage(
  content: Content,
  type: string,
  targetWidth: number,
): Image | undefined {
  let best: Image | undefined;
  for (const image of content.images?.values ?? []) {
    if (image.type !== type || !image.link.startsWith('https://')) continue;
    const [w, h] = image.resolution.split('x').map(Number);
    const candidate: Image = {
      url: image.link,
      ...(Number.isFinite(w) && Number.isFinite(h)
        ? { width: w!, height: h! }
        : {}),
    };
    const distance = (img: Image) =>
      Math.abs((img.width ?? targetWidth) - targetWidth);
    if (!best || distance(candidate) < distance(best)) best = candidate;
  }
  return best;
}

export function artworkOf(content: Content): Artwork {
  const artwork: Artwork = {};
  const landscape =
    pickImage(content, 'coverposter', 640) ??
    pickImage(content, 'preview', 640);
  const backdrop = pickImage(content, 'coverposter', 1920);
  const portrait = pickImage(content, 'thumbnail', 500);
  const logo = pickImage(content, 'contenttitleimage', 640);
  if (landscape) artwork.landscape = landscape;
  if (backdrop) artwork.backdrop = backdrop;
  if (portrait) artwork.portrait = portrait;
  if (logo) artwork.logo = logo;
  return artwork;
}

function languagesOf(content: Content): string[] | undefined {
  const codes = (content.content?.language ?? [])
    .map(languageCode)
    .filter((code): code is string => code !== undefined);
  return codes.length > 0 ? codes : undefined;
}

/** `releaseDate` carries the Indian air date with a `Z` stuck on, so the date part is used as is. */
function airDateOf(content: Content): string | undefined {
  const match = content.content?.releaseDate?.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0];
}

function secondsOf(duration: string | null | undefined): number | undefined {
  const parts = duration?.split(':').map(Number);
  if (!parts || parts.some((n) => !Number.isFinite(n))) return undefined;
  const seconds = parts.reduce((total, n) => total * 60 + n, 0);
  return seconds > 0 ? seconds : undefined;
}

function nameOf(content: Content): string | undefined {
  return content.generalInfo.title ?? content.title ?? undefined;
}

export function showIdOf(content: Content): string | undefined {
  return content.globalServiceId?.replace(/^GID_/, '') || undefined;
}

export function toTitle(content: Content): Title | undefined {
  const name = nameOf(content);
  if (content.generalInfo.type !== 'vodchannel' || !name) return undefined;
  const languages = languagesOf(content);
  const description = content.generalInfo.briefDescription;
  return {
    ref: { provider: PROVIDER, id: content._id },
    kind: 'series',
    name,
    ...(description ? { description } : {}),
    artwork: artworkOf(content),
    ...(languages ? { languages } : {}),
    // Any slug works; the id picks the show and the site opens its latest episode.
    url: `${SITE}/show/detail/${content._id}/0`,
  };
}

export function toPlayable(content: Content): Playable | undefined {
  const type = content.generalInfo.type;
  if (type !== 'vod' && type !== 'movie') return undefined;
  const title =
    (type === 'vod' ? content.generalInfo.displayTitle : undefined) ??
    nameOf(content);
  if (!title) return undefined;

  const showId = showIdOf(content);
  const number = Number.parseInt(content.content?.serialNo ?? '', 10);
  const airDate = airDateOf(content);
  const durationSeconds = secondsOf(content.content?.duration);
  const languages = languagesOf(content);
  const description = content.generalInfo.briefDescription;

  return {
    ref: { provider: PROVIDER, id: content._id },
    kind: type === 'movie' ? 'movie' : 'episode',
    title,
    ...(showId && content.globalServiceName
      ? {
          parent: {
            ref: { provider: PROVIDER, id: showId },
            name: content.globalServiceName,
          },
        }
      : {}),
    ...(Number.isFinite(number) ? { number } : {}),
    ...(airDate ? { airDate } : {}),
    ...(durationSeconds ? { durationSeconds } : {}),
    ...(description ? { description } : {}),
    ...(languages ? { languages } : {}),
    artwork: artworkOf(content),
    url: `${SITE}/player/${content._id}`,
  };
}

export function toCatalogItem(content: Content): CatalogItem | undefined {
  return toTitle(content) ?? toPlayable(content);
}

/** Keeps items in one of `languages`; an item that names no language is kept. */
export function inLanguages(
  item: CatalogItem,
  languages: readonly string[],
): boolean {
  return (
    !item.languages || item.languages.some((code) => languages.includes(code))
  );
}
