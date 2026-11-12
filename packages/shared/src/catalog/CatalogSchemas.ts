import { z } from 'zod';

/** A provider's own id for something; unique only within that provider. */
export const ProviderItemId = z.string().min(1);

/**
 * Something the viewer can open: a series on a streaming service, or a channel
 * or playlist on YouTube.
 */
export const ShowSchema = z.object({
  providerId: z.string().min(1),
  id: ProviderItemId,
  title: z.string().min(1),
  description: z.string().optional(),
  posterUrl: z.url().optional(),
  url: z.url(),
});
export type Show = z.infer<typeof ShowSchema>;

/** Something the viewer can play: an episode, a film, or a single video. */
export const EpisodeSchema = z.object({
  providerId: z.string().min(1),
  id: ProviderItemId,
  showId: ProviderItemId.optional(),
  title: z.string().min(1),
  season: z.number().int().nonnegative().optional(),
  number: z.number().int().nonnegative().optional(),
  airDate: z.iso.date().optional(),
  durationSeconds: z.number().nonnegative().optional(),
  /** How far the viewer got, as the provider reports it, from 0 to 1. */
  progress: z.number().min(0).max(1).optional(),
  thumbnailUrl: z.url().optional(),
  url: z.url(),
});
export type Episode = z.infer<typeof EpisodeSchema>;
