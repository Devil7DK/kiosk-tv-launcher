import { defineProvider } from '@kiosk-tv/provider-kit';
import { z } from 'zod';

export const zee5ConfigSchema = z.object({
  /** The viewer profile to watch as, by the name the site shows for it. */
  profile: z.string().min(1),
});

export default defineProvider({
  manifest: {
    id: 'zee5',
    name: 'ZEE5',
    color: '#8230c6',
    origins: ['https://www.zee5.com'],
  },
  configSchema: zee5ConfigSchema,
  create() {
    throw new Error('The ZEE5 provider is not implemented yet');
  },
});
