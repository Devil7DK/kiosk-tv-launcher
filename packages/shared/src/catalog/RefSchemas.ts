import { z } from 'zod';

import { ProviderIdSchema } from '../providers/ProviderSchemas.js';

/** Points at anything a provider owns, by the provider's own id. */
export const RefSchema = z.object({
  provider: ProviderIdSchema,
  id: z.string().min(1),
});
export type Ref = z.infer<typeof RefSchema>;

/** `hotstar:1271328975`: a ref as one string, for map keys and URLs. */
export type RefKey = `${string}:${string}`;

export function refKey(ref: Ref): RefKey {
  return `${ref.provider}:${ref.id}`;
}

/** Provider ids contain no colon, so everything after the first one is the item id. */
export function parseRefKey(key: string): Ref | undefined {
  const colon = key.indexOf(':');
  if (colon < 0) return undefined;
  const parsed = RefSchema.safeParse({
    provider: key.slice(0, colon),
    id: key.slice(colon + 1),
  });
  return parsed.success ? parsed.data : undefined;
}

export function sameRef(a: Ref, b: Ref): boolean {
  return a.provider === b.provider && a.id === b.id;
}

/** ISO 639-1, the form ZEE5 and YouTube already use: `ta`, `en`. */
export const LanguageSchema = z.string().regex(/^[a-z]{2}$/, 'ISO 639-1 code');
export type Language = z.infer<typeof LanguageSchema>;
