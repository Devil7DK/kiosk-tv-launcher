import { defineProvider } from '@kiosk-tv/provider-kit';
import { z } from 'zod';

export const hotstarConfigSchema = z.object({
  /** Show or channel URLs to always offer the viewer. */
  favourites: z.array(z.url()).default([]),
});

export default defineProvider({
  manifest: {
    id: 'hotstar',
    name: 'JioHotstar',
    color: '#0f1014',
    origins: ['https://www.hotstar.com'],
  },
  configSchema: hotstarConfigSchema,
  create() {
    throw new Error('The JioHotstar provider is not implemented yet');
  },
});
