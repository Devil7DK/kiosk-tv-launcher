import { defineProvider } from '@kiosk-tv/provider-kit';
import { z } from 'zod';

/** The signed-in Google account is the only choice; there is nothing to configure. */
export const youtubeConfigSchema = z.object({});

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
