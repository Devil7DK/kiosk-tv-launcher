import { defineProvider } from '@kiosk-tv/provider-kit';
import { z } from 'zod';

import { createHotstarProvider } from './hotstar.provider.js';

export const hotstarConfigSchema = z.object({
  /** The viewer profile to watch as, by the name the site shows for it. */
  profile: z.string().min(1),
});

export default defineProvider({
  manifest: {
    id: 'hotstar',
    name: 'JioHotstar',
    color: '#0f1014',
    origins: ['https://www.hotstar.com'],
  },
  configSchema: hotstarConfigSchema,
  create: (context) => createHotstarProvider(context),
});
