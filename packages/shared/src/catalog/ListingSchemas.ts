import { z } from 'zod';

import { CatalogItemSchema, PlayableSchema } from './ItemSchemas.js';

/** One page of a longer list; `next` is an opaque cursor for the page after it. */
export function pageSchema<Item extends z.ZodType>(item: Item) {
  return z.object({
    items: z.array(item),
    next: z.string().min(1).optional(),
  });
}
export interface Page<Item> {
  items: Item[];
  next?: string;
}

/** A point to jump to in a long episode list: "Nov 2026", "Season 2", "Episodes 264–273". */
export const EpisodeGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});
export type EpisodeGroup = z.infer<typeof EpisodeGroupSchema>;

/** A show's episodes, newest first, however the provider pages them. */
export const EpisodeListingSchema = z.object({
  groups: z.array(EpisodeGroupSchema).optional(),
  page: pageSchema(PlayableSchema),
});
export type EpisodeListing = z.infer<typeof EpisodeListingSchema>;

/** A row on a provider's tab, kept as the provider arranges it. */
export const ShelfSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  items: pageSchema(CatalogItemSchema),
});
export type Shelf = z.infer<typeof ShelfSchema>;
