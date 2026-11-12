import { z } from 'zod';

export const ImageSchema = z.object({
  url: z.url(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type Image = z.infer<typeof ImageSchema>;

/**
 * Providers resolve images to concrete URLs at sizes that suit the TV; the
 * launcher never builds an image URL itself.
 */
export const ArtworkSchema = z.object({
  /** 16:9 tile, about 640 px wide. */
  landscape: ImageSchema.optional(),
  /** 2:3 poster. */
  portrait: ImageSchema.optional(),
  /** 16:9, about 1920 px wide, behind a show page. */
  backdrop: ImageSchema.optional(),
  /** The title as a transparent cut-out. */
  logo: ImageSchema.optional(),
});
export type Artwork = z.infer<typeof ArtworkSchema>;
