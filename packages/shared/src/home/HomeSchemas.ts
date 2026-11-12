import { z } from 'zod';

import {
  CatalogItemSchema,
  PlayableSchema,
  TitleSchema,
} from '../catalog/ItemSchemas.js';

export const FollowedTitleSchema = z.object({
  title: TitleSchema,
  latest: PlayableSchema.optional(),
  /** The episode to carry on with, when one is part-watched. */
  resume: PlayableSchema.optional(),
  /** An episode aired since the viewer last watched this show. */
  hasNew: z.boolean(),
});
export type FollowedTitle = z.infer<typeof FollowedTitleSchema>;

export const PlaylistViewSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  items: z.array(CatalogItemSchema),
});
export type PlaylistView = z.infer<typeof PlaylistViewSchema>;

/** The launcher's first screen, assembled by the controller across providers. */
export const HomeSchema = z.object({
  /** Newest first. */
  continueWatching: z.array(PlayableSchema),
  myShows: z.array(FollowedTitleSchema),
  playlists: z.array(PlaylistViewSchema),
});
export type Home = z.infer<typeof HomeSchema>;
