import {
  type Artwork,
  type Playable,
  progressAt,
  type Title,
} from '@kiosk-tv/shared';
import { z } from 'zod';

import { SITE } from '../api/youtube.api.js';

export const PROVIDER = 'youtube';
/** Shorts look like any other video in lists; only their length gives them away. */
export const SHORTEST_VIDEO_SECONDS = 180;

type Json = unknown;

/** Every value under `key`, anywhere in the answer, in document order. */
export function collect(
  json: Json,
  key: string,
  out: unknown[] = [],
): unknown[] {
  if (Array.isArray(json)) {
    for (const value of json) collect(value, key, out);
  } else if (json && typeof json === 'object') {
    for (const [k, value] of Object.entries(json)) {
      if (k === key) out.push(value);
      else collect(value, key, out);
    }
  }
  return out;
}

export function continuationOf(json: Json): string | undefined {
  for (const command of collect(json, 'continuationCommand')) {
    const token = (command as { token?: unknown }).token;
    if (typeof token === 'string') return token;
  }
  return undefined;
}

const LockupSchema = z.object({
  contentId: z.string().min(1),
  contentType: z.string(),
  metadata: z.object({
    lockupMetadataViewModel: z.object({
      title: z.object({ content: z.string().min(1) }),
    }),
  }),
});

function texts(json: Json): string[] {
  return collect(json, 'content').filter(
    (t): t is string => typeof t === 'string',
  );
}

/** "1:04:41" or "24:55" in seconds. */
export function parseClock(text: string): number | undefined {
  if (!/^\d+(:\d\d){1,2}$/.test(text)) return undefined;
  return text.split(':').reduce((total, part) => total * 60 + Number(part), 0);
}

function thumbnails(id: string): Artwork {
  // hqdefault exists for every video; the tile crops its letterbox away.
  return {
    landscape: {
      url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      width: 480,
      height: 360,
    },
    backdrop: {
      url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      width: 480,
      height: 360,
    },
  };
}

function firstImage(json: Json): string | undefined {
  for (const url of collect(json, 'url')) {
    if (
      typeof url === 'string' &&
      /^https:\/\/(i\.ytimg\.com|yt3\.ggpht\.com)\//.test(url)
    )
      return url;
  }
  return undefined;
}

export function lockupToPlayable(
  lockup: unknown,
  parent?: { id: string; name: string },
): Playable | undefined {
  const parsed = LockupSchema.safeParse(lockup);
  if (
    !parsed.success ||
    parsed.data.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO'
  )
    return undefined;
  const id = parsed.data.contentId;
  const badges = collect(lockup, 'thumbnailBadgeViewModel').map(
    (b) => (b as { text?: unknown }).text,
  );
  const duration = badges
    .map((t) => (typeof t === 'string' ? parseClock(t) : undefined))
    .find((s) => s);
  // No length badge: a Short in the feed, or a live or upcoming stream.
  if (duration === undefined || duration < SHORTEST_VIDEO_SECONDS) {
    return undefined;
  }
  const percent = collect(lockup, 'startPercent').find(
    (p): p is number => typeof p === 'number',
  );
  const byline = texts((lockup as { metadata?: unknown }).metadata).slice(1);
  const channel = byline[0];
  return {
    ref: { provider: PROVIDER, id },
    kind: 'video',
    title: parsed.data.metadata.lockupMetadataViewModel.title.content,
    ...(parent
      ? {
          parent: {
            ref: { provider: PROVIDER, id: parent.id },
            name: parent.name,
          },
        }
      : {}),
    ...(!parent && channel ? { description: channel } : {}),
    durationSeconds: duration,
    artwork: thumbnails(id),
    ...(percent !== undefined && percent > 0
      ? {
          progress: progressAt(
            (percent / 100) * duration,
            duration,
            'provider',
          ),
        }
      : {}),
    url: `${SITE}/watch?v=${encodeURIComponent(id)}`,
  };
}

export function lockupToPlaylist(lockup: unknown): Title | undefined {
  const parsed = LockupSchema.safeParse(lockup);
  if (
    !parsed.success ||
    parsed.data.contentType !== 'LOCKUP_CONTENT_TYPE_PLAYLIST'
  )
    return undefined;
  const id = parsed.data.contentId;
  const image = firstImage(lockup);
  return {
    ref: { provider: PROVIDER, id },
    kind: 'playlist',
    name: parsed.data.metadata.lockupMetadataViewModel.title.content,
    artwork: image ? { landscape: { url: image } } : {},
    url: `${SITE}/playlist?list=${encodeURIComponent(id)}`,
  };
}

const ChannelSchema = z.object({
  channelId: z.string().min(1),
  title: z.object({ simpleText: z.string().min(1) }),
  thumbnail: z
    .object({
      thumbnails: z.array(
        z.object({ url: z.string(), width: z.number().optional() }),
      ),
    })
    .optional(),
});

export function channelToTitle(renderer: unknown): Title | undefined {
  const parsed = ChannelSchema.safeParse(renderer);
  if (!parsed.success) return undefined;
  const thumbs = parsed.data.thumbnail?.thumbnails ?? [];
  const best = thumbs.at(-1)?.url;
  const url = best?.startsWith('//') ? `https:${best}` : best;
  return {
    ref: { provider: PROVIDER, id: parsed.data.channelId },
    kind: 'channel',
    name: parsed.data.title.simpleText,
    artwork: url ? { landscape: { url: url.replace(/=s\d+-/, '=s480-') } } : {},
    url: `${SITE}/channel/${parsed.data.channelId}`,
  };
}

export function isChannelId(id: string): boolean {
  return id.startsWith('UC');
}
