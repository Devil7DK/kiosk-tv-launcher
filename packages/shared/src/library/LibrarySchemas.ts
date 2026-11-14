import { z } from 'zod';

import { CatalogItemSchema, TitleSchema } from '../catalog/ItemSchemas.js';
import { LanguageSchema } from '../catalog/RefSchemas.js';

/**
 * A show added to "My shows" by hand. Shows on an account's own list (a
 * watchlist) join them on every refresh and are not stored.
 */
export const FollowSchema = z.object({
  /** As it was when added, so Home can draw it before the provider answers. */
  title: TitleSchema,
  addedAt: z.iso.datetime({ offset: true }),
});
export type Follow = z.infer<typeof FollowSchema>;

export const PlaylistSourceSchema = z.discriminatedUnion('type', [
  /** Our own list; may mix providers. */
  z.object({ type: z.literal('manual'), items: z.array(CatalogItemSchema) }),
  /** A provider's playlist, such as a YouTube channel's, re-read on refresh. */
  z.object({ type: z.literal('provider'), title: TitleSchema }),
]);
export type PlaylistSource = z.infer<typeof PlaylistSourceSchema>;

export const PlaylistSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  source: PlaylistSourceSchema,
});
export type Playlist = z.infer<typeof PlaylistSchema>;

/** `launcher`: only what was started from the launcher; `all`: also what the services report. */
export const ContinueWatchingModeSchema = z.enum(['launcher', 'all']);

/** Provider tabs show only titles in these languages. */
export const LanguagesSchema = z.array(LanguageSchema).min(1);

/** How large the TV draws everything, as a factor of the normal size. */
export const ScaleSchema = z.number().min(0.6).max(1.6);

export const SettingsSchema = z.object({
  continueWatching: ContinueWatchingModeSchema.default('launcher'),
  languages: LanguagesSchema.default(['ta']),
  scale: ScaleSchema.default(1),
  /** When a video ends, let the service play its own next one (YouTube's autoplay). */
  autoplay: z.boolean().default(false),
  /** Off keeps the Bluetooth adapter off, also after a restart. */
  bluetooth: z.boolean().default(true),
});
export type Settings = z.infer<typeof SettingsSchema>;

/** What the admin page edits; the controller stores it. */
export const LibrarySchema = z.object({
  follows: z.array(FollowSchema).default([]),
  /** In the order they appear on Home. */
  playlists: z.array(PlaylistSchema).default([]),
  settings: SettingsSchema.prefault({}),
});
export type Library = z.infer<typeof LibrarySchema>;
