import { defineProvider } from '@kiosk-tv/provider-kit';
import { z } from 'zod';

import { createSunNxtProvider } from './sunnxt.provider.js';

export const sunNxtConfigSchema = z.object({
  /** The viewer profile to watch as, by the name the site shows for it. */
  profile: z.string().min(1),
});

export default defineProvider({
  manifest: {
    id: 'sunnxt',
    name: 'Sun NXT',
    color: '#f26522',
    origins: ['https://www.sunnxt.com'],
  },
  configSchema: sunNxtConfigSchema,
  create: (context) => createSunNxtProvider(context),
});
