import type {
  CatalogItem,
  EpisodeListing,
  Language,
  Page,
  Playable,
  ProviderCapability,
  ProviderManifest,
  ProviderStatus,
  Ref,
  Shelf,
  Title,
} from '@kiosk-tv/shared';
import type { Page as BrowserPage } from 'playwright-core';
import type { z } from 'zod';

import type { PlaybackSession, PlayOptions } from '../playback/playback.js';

export interface ProviderLogger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

/** The controller owns the browser; a provider only drives the pages it is handed. */
export interface ProviderPages {
  /** A tab for reading the catalog without disturbing what the viewer is watching. */
  background(): Promise<BrowserPage>;
  /** The one tab the viewer sees. Only `play` navigates it. */
  player(): Promise<BrowserPage>;
}

export interface ProviderContext<Config> {
  config: Config;
  pages: ProviderPages;
  log: ProviderLogger;
}

export interface CatalogOptions {
  /** Only titles in these languages. */
  languages: Language[];
  cursor?: string;
}

/** The viewer's own lists in the account: watchlist, favourites, subscriptions. */
export interface ProviderLibrary {
  follows: Title[];
  playlists: Title[];
}

export interface Provider {
  status(): Promise<ProviderStatus>;
  library(): Promise<ProviderLibrary>;
  /** What the service itself reports as watched, newest first. */
  progress?(): Promise<Playable[]>;
  /** The rows of the provider's tab, each with its first page of items. */
  shelves(options: CatalogOptions): Promise<Page<Shelf>>;
  shelf(id: string, options: CatalogOptions): Promise<Page<CatalogItem>>;
  title(ref: Ref): Promise<Title>;
  episodes(
    ref: Ref,
    options?: { group?: string; cursor?: string },
  ): Promise<EpisodeListing>;
  /** For when the service knows the next episode better than the episode list does. */
  next?(playable: Playable): Promise<Playable | null>;
  /** Resolves once the video is playing full screen in the player tab. */
  play(playable: Playable, options?: PlayOptions): Promise<PlaybackSession>;
  search?(query: string, options: CatalogOptions): Promise<CatalogItem[]>;
  dispose?(): Promise<void>;
}

export interface ProviderModule<Config = unknown> {
  manifest: ProviderManifest;
  /** Parsed before `create`, so a provider never sees configuration it cannot use. */
  configSchema: z.ZodType<Config>;
  create(context: ProviderContext<Config>): Provider | Promise<Provider>;
}

/** Typed identity, so a provider package's default export is checked where it is written. */
export function defineProvider<Config>(
  module: ProviderModule<Config>,
): ProviderModule<Config> {
  return module;
}

export function capabilitiesOf(provider: Provider): ProviderCapability[] {
  const capabilities: ProviderCapability[] = [];
  if (provider.progress) capabilities.push('progress');
  if (provider.next) capabilities.push('next');
  if (provider.search) capabilities.push('search');
  return capabilities;
}
