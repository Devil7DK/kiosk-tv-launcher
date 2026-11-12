import { z } from 'zod';

import {
  CatalogItemSchema,
  PlayableSchema,
  TitleSchema,
} from '../catalog/ItemSchemas.js';
import { ProgressSchema } from '../catalog/ProgressSchemas.js';
import {
  ContinueWatchingModeSchema,
  LanguagesSchema,
  PlaylistSourceSchema,
  ScaleSchema,
  SettingsSchema,
} from '../library/LibrarySchemas.js';
import {
  ProviderCapabilitySchema,
  ProviderManifestSchema,
  ProviderStatusSchema,
} from '../providers/ProviderSchemas.js';

/** The keys of the remote; a Bluetooth remote sends them as keyboard keys. */
export const RemoteKeySchema = z.enum([
  'up',
  'down',
  'left',
  'right',
  'ok',
  'back',
]);
export type RemoteKey = z.infer<typeof RemoteKeySchema>;

export const ProviderInfoSchema = z.object({
  manifest: ProviderManifestSchema,
  status: ProviderStatusSchema,
  capabilities: z.array(ProviderCapabilitySchema),
});
export type ProviderInfo = z.infer<typeof ProviderInfoSchema>;

export const PlayRequestSchema = z.object({
  playable: PlayableSchema,
  /** Ignores any recorded position. */
  fromStart: z.boolean().optional(),
});
export type PlayRequest = z.infer<typeof PlayRequestSchema>;

export const PlaybackCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('pause') }),
  z.object({ action: z.literal('resume') }),
  z.object({ action: z.literal('stop') }),
  /** Relative, in seconds; negative goes back. */
  z.object({ action: z.literal('skip'), seconds: z.number() }),
]);
export type PlaybackCommand = z.infer<typeof PlaybackCommandSchema>;

export const PlaybackStateSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('idle') }),
  z.object({ state: z.literal('starting'), playable: PlayableSchema }),
  z.object({
    state: z.literal('playing'),
    playable: PlayableSchema,
    paused: z.boolean(),
    progress: ProgressSchema.optional(),
  }),
  /** The launcher is back in front; `next` is what "Up next" offers. */
  z.object({
    state: z.literal('finished'),
    playable: PlayableSchema,
    reason: z.enum(['ended', 'left', 'stopped', 'failed']),
    next: PlayableSchema.optional(),
  }),
]);
export type PlaybackState = z.infer<typeof PlaybackStateSchema>;

/** Pushed to the launcher over server-sent events. */
export const ServerEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('playback'), playback: PlaybackStateSchema }),
  z.object({
    type: z.literal('providers'),
    providers: z.array(ProviderInfoSchema),
  }),
  /** Home changed; fetch it again. */
  z.object({ type: z.literal('home') }),
  z.object({ type: z.literal('settings'), settings: SettingsSchema }),
]);
export type ServerEvent = z.infer<typeof ServerEventSchema>;

export const FollowRequestSchema = z.object({ title: TitleSchema });
export type FollowRequest = z.infer<typeof FollowRequestSchema>;

export const PlaylistCreateSchema = z.object({
  name: z.string().trim().min(1),
  source: PlaylistSourceSchema,
});
export type PlaylistCreate = z.infer<typeof PlaylistCreateSchema>;

export const PlaylistUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  items: z.array(CatalogItemSchema).optional(),
  /** New place among the playlists, from 0. */
  position: z.number().int().nonnegative().optional(),
});
export type PlaylistUpdate = z.infer<typeof PlaylistUpdateSchema>;

export const SettingsUpdateSchema = z.object({
  continueWatching: ContinueWatchingModeSchema.optional(),
  languages: LanguagesSchema.optional(),
  scale: ScaleSchema.optional(),
});
export type SettingsUpdate = z.infer<typeof SettingsUpdateSchema>;
