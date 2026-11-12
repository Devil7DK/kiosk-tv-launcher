import { z } from 'zod';

import { ArtworkSchema } from './ArtworkSchemas.js';
import { ProgressSchema } from './ProgressSchemas.js';
import { LanguageSchema, RefSchema } from './RefSchemas.js';

/** Something the viewer opens to choose from: a series, a YouTube channel or playlist. */
export const TitleSchema = z.object({
  ref: RefSchema,
  kind: z.enum(['series', 'channel', 'playlist']),
  name: z.string().min(1),
  description: z.string().optional(),
  artwork: ArtworkSchema,
  languages: z.array(LanguageSchema).optional(),
  /** Air date of the newest episode or video, for the "new" badge and sorting. */
  latestAirDate: z.iso.date().optional(),
  /** The provider's own page for it. */
  url: z.url(),
});
export type Title = z.infer<typeof TitleSchema>;

export const BadgeSchema = z.enum(['new', 'next', 'premium', 'free']);
export type Badge = z.infer<typeof BadgeSchema>;

/** Something that plays: an episode, a film, or a single video. */
export const PlayableSchema = z.object({
  ref: RefSchema,
  kind: z.enum(['episode', 'movie', 'video']),
  title: z.string().min(1),
  /** The show or channel it belongs to. */
  parent: z.object({ ref: RefSchema, name: z.string().min(1) }).optional(),
  season: z.number().int().nonnegative().optional(),
  number: z.number().int().nonnegative().optional(),
  airDate: z.iso.date().optional(),
  /** For display only: Sun NXT's is wrong, so playback trusts the video's own. */
  durationSeconds: z.number().positive().optional(),
  description: z.string().optional(),
  languages: z.array(LanguageSchema).optional(),
  artwork: ArtworkSchema,
  progress: ProgressSchema.optional(),
  badges: z.array(BadgeSchema).optional(),
  /** The watch page `play` opens, so a stored item plays without asking the provider again. */
  url: z.url(),
});
export type Playable = z.infer<typeof PlayableSchema>;

export const CatalogItemSchema = z.union([TitleSchema, PlayableSchema]);
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

export function isPlayable(item: CatalogItem): item is Playable {
  return 'title' in item;
}
