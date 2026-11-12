import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { ProviderIdSchema } from '@kiosk-tv/shared';
import { z } from 'zod';

const path = z
  .string()
  .min(1)
  .transform((p) =>
    p === '~' || p.startsWith('~/') ? homedir() + p.slice(1) : p,
  );

export const TvConfigSchema = z.object({
  server: z
    .object({
      /** The admin page is opened from other devices, so it listens beyond localhost. */
      host: z.string().default('0.0.0.0'),
      port: z.number().int().positive().default(8765),
    })
    .prefault({}),
  browser: z
    .object({
      binary: path.prefault('/usr/bin/brave-browser'),
      port: z.number().int().positive().default(9222),
      profileDir: path.prefault('~/.local/share/kiosk-tv/brave-profile'),
      kiosk: z.boolean().default(true),
    })
    .prefault({}),
  /** The remote's USB dongle. */
  remote: z
    .object({
      enabled: z.boolean().default(true),
      /** A fixed serial port; without it, each USB serial port is tried. */
      port: z.string().min(1).optional(),
    })
    .prefault({}),
  /** Library, watch history and caches. */
  dataDir: path.prefault('~/.local/share/kiosk-tv/data'),
  /** What the launcher tab opens. Defaults to the controller's own address. */
  launcherUrl: z.url().optional(),
  /**
   * Enabled providers and their settings, by id. Each one is loaded from
   * `@kiosk-tv/provider-<id>` and checks its own settings.
   */
  providers: z.record(ProviderIdSchema, z.unknown()).default({}),
});
export type TvConfig = z.infer<typeof TvConfigSchema>;

export async function loadTvConfig(file: string): Promise<TvConfig> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    throw new Error(
      `No configuration at ${resolve(file)}; copy config/tv.example.json there`,
    );
  }
  const parsed = TvConfigSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new Error(`${file} is not valid: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
