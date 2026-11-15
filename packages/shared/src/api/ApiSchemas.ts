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

/** Every button of the TV's own remote: the keys, and volume. */
export const RemoteButtonSchema = z.enum([
  ...RemoteKeySchema.options,
  'volumeUp',
  'volumeDown',
]);
export type RemoteButton = z.infer<typeof RemoteButtonSchema>;

/** A button pressed on the admin page's remote, handled as the real remote's. */
export const RemotePressRequestSchema = z.object({
  button: RemoteButtonSchema,
});
export type RemotePressRequest = z.infer<typeof RemotePressRequestSchema>;

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

/** The remote, as last heard from. */
export const RemoteStatusSchema = z.object({
  /** Absent until a press reports it, or when the remote cannot measure it. */
  batteryPercent: z.number().int().min(0).max(100).optional(),
  batteryLow: z.boolean(),
  /** A press or the battery report it sends before sleeping. */
  lastHeardAt: z.iso.datetime({ offset: true }).optional(),
});
export type RemoteStatus = z.infer<typeof RemoteStatusSchema>;

/** The TV computer's own battery, where it has one. */
export const TvBatterySchema = z.object({
  percent: z.number().int().min(0).max(100),
  /** On the charger, whether charging or already full. */
  charging: z.boolean(),
});
export type TvBattery = z.infer<typeof TvBatterySchema>;

export const BluetoothDeviceSchema = z.object({
  /** As BlueZ writes it: six pairs of upper-case hex digits. */
  address: z.string().regex(/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/),
  name: z.string(),
  paired: z.boolean(),
  connected: z.boolean(),
});
export type BluetoothDevice = z.infer<typeof BluetoothDeviceSchema>;

export const BluetoothStatusSchema = z.object({
  /** False on a computer without a Bluetooth adapter. */
  available: z.boolean(),
  /** The adapter is switched on. */
  powered: z.boolean(),
  scanning: z.boolean(),
  devices: z.array(BluetoothDeviceSchema),
});
export type BluetoothStatus = z.infer<typeof BluetoothStatusSchema>;

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
  z.object({ type: z.literal('remote'), remote: RemoteStatusSchema }),
  /** Absent `battery`: the computer has none, as a desktop PC. */
  z.object({
    type: z.literal('battery'),
    battery: TvBatterySchema.optional(),
  }),
]);
export type ServerEvent = z.infer<typeof ServerEventSchema>;

export const FollowRequestSchema = z.object({ title: TitleSchema });
export type FollowRequest = z.infer<typeof FollowRequestSchema>;

/** A link copied from a service's website or app, to a show, channel or playlist. */
export const FollowLinkRequestSchema = z.object({ url: z.url() });
export type FollowLinkRequest = z.infer<typeof FollowLinkRequestSchema>;

/** What one service found; `failed` when it did not answer in time or at all. */
export const SearchResultSchema = z.object({
  provider: z.string(),
  items: z.array(CatalogItemSchema),
  failed: z.boolean(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const PowerActionSchema = z.enum(['shutdown', 'restart']);
export type PowerAction = z.infer<typeof PowerActionSchema>;

export const PowerRequestSchema = z.object({ action: PowerActionSchema });
export type PowerRequest = z.infer<typeof PowerRequestSchema>;

/** Whether this TV lets the launcher shut it down and restart it. */
export const PowerStatusSchema = z.object({ available: z.boolean() });
export type PowerStatus = z.infer<typeof PowerStatusSchema>;

/** Never fully dark: a black screen gives the viewer no way back. */
export const DIMMEST_PERCENT = 10;

export const BrightnessRequestSchema = z.object({
  percent: z.number().int().min(DIMMEST_PERCENT).max(100),
});
export type BrightnessRequest = z.infer<typeof BrightnessRequestSchema>;

/** The screen's backlight; `percent` is absent on a screen without one. */
export const BrightnessStatusSchema = z.object({
  percent: z.number().int().min(0).max(100).optional(),
});
export type BrightnessStatus = z.infer<typeof BrightnessStatusSchema>;

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
  autoplay: z.boolean().optional(),
  bluetooth: z.boolean().optional(),
});
export type SettingsUpdate = z.infer<typeof SettingsUpdateSchema>;
