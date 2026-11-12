import type {
  Episode,
  ProviderCapability,
  ProviderManifest,
  ProviderStatus,
  Show,
} from '@kiosk-tv/shared';
import type { Page } from 'playwright-core';
import type { z } from 'zod';

export interface ProviderLogger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

/** The controller owns the browser; a provider only drives the pages it is handed. */
export interface ProviderPages {
  /** A tab for reading the catalog without disturbing what the viewer is watching. */
  background(): Promise<Page>;
  /** The one tab the viewer sees. Only `play` navigates it. */
  player(): Promise<Page>;
}

export interface ProviderContext<Config> {
  config: Config;
  pages: ProviderPages;
  log: ProviderLogger;
}

export interface Provider {
  status(): Promise<ProviderStatus>;
  /** The shows to offer the viewer: the configured favourites, at the least. */
  listShows(): Promise<Show[]>;
  /** Newest first. */
  listEpisodes(show: Show): Promise<Episode[]>;
  /** Resolves once the video is playing full screen in the player tab. */
  play(episode: Episode): Promise<void>;
  continueWatching?(): Promise<Episode[]>;
  search?(query: string): Promise<Show[]>;
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
  if (provider.continueWatching) capabilities.push('continueWatching');
  if (provider.search) capabilities.push('search');
  return capabilities;
}
