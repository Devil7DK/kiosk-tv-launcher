import { defineProvider } from '@kiosk-tv/provider-kit';
import { z } from 'zod';

export const youtubeConfigSchema = z.object({
  /** Show or channel URLs to always offer the viewer. */
  favourites: z.array(z.url()).default([]),
});

export default defineProvider({
  manifest: {
    id: 'youtube',
    name: 'YouTube',
    color: '#ff0000',
    origins: ['https://www.youtube.com'],
  },
  configSchema: youtubeConfigSchema,
  create() {
    throw new Error('The YouTube provider is not implemented yet');
  },
});
