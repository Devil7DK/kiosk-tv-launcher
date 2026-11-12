import { z } from 'zod';

import { LanguageSchema, RefSchema } from '../catalog/RefSchemas.js';

/** A show the viewer follows, shown under "My shows". */
export const FollowSchema = z.object({
  ref: RefSchema,
  /** `provider` follows mirror an account list (a watchlist) and leave with it. */
  source: z.enum(['manual', 'provider']),
  addedAt: z.iso.datetime({ offset: true }),
});
export type Follow = z.infer<typeof FollowSchema>;

export const PlaylistSourceSchema = z.discriminatedUnion('type', [
  /** Our own list; may mix providers. */
  z.object({ type: z.literal('manual'), items: z.array(RefSchema) }),
  /** A provider's playlist, such as a YouTube channel's, re-read on refresh. */
  z.object({ type: z.literal('provider'), ref: RefSchema }),
]);
export type PlaylistSource = z.infer<typeof PlaylistSourceSchema>;

export const PlaylistSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  source: PlaylistSourceSchema,
});
export type Playlist = z.infer<typeof PlaylistSchema>;

export const SettingsSchema = z.object({
  /** `launcher`: only what was started from the launcher; `all`: also what the services report. */
  continueWatching: z.enum(['launcher', 'all']).default('launcher'),
  /** Provider tabs show only titles in these languages. */
  languages: z.array(LanguageSchema).min(1).default(['ta']),
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
