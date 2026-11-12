import { z } from 'zod';

export const ProviderIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, 'lower-case letters, digits and dashes');
export type ProviderId = z.infer<typeof ProviderIdSchema>;

/** What the launcher needs to draw a provider before anything is loaded. */
export const ProviderManifestSchema = z.object({
  id: ProviderIdSchema,
  name: z.string().min(1),
  /** Brand colour for the provider's row and tiles, as a CSS colour. */
  color: z.string().min(1),
  logoUrl: z.url().optional(),
  /** Origins the provider plays from, so the controller knows which tab belongs to it. */
  origins: z.array(z.url()).min(1),
});
export type ProviderManifest = z.infer<typeof ProviderManifestSchema>;

/** Optional features; the launcher hides what a provider does not offer. */
export const ProviderCapabilitySchema = z.enum(['progress', 'next', 'search']);
export type ProviderCapability = z.infer<typeof ProviderCapabilitySchema>;

export const ProviderStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('ready') }),
  z.object({ state: z.literal('loggedOut') }),
  /** Switching back to the configured viewer profile failed. */
  z.object({
    state: z.literal('wrongProfile'),
    expected: z.string(),
    actual: z.string(),
  }),
  /** Still logged in, but the login runs out at `at` unless renewed. */
  z.object({
    state: z.literal('expiring'),
    at: z.iso.datetime({ offset: true }),
  }),
  z.object({ state: z.literal('failed'), reason: z.string() }),
]);
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;
