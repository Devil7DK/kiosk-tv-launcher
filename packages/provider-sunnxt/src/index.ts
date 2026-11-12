import { defineProvider } from '@kiosk-tv/provider-kit';
import { z } from 'zod';

export const sunNxtConfigSchema = z.object({
  /** Show or channel URLs to always offer the viewer. */
  favourites: z.array(z.url()).default([]),
});

export default defineProvider({
  manifest: {
    id: 'sunnxt',
    name: 'Sun NXT',
    color: '#f26522',
    origins: ['https://www.sunnxt.com'],
  },
  configSchema: sunNxtConfigSchema,
  create() {
    throw new Error('The Sun NXT provider is not implemented yet');
  },
});
