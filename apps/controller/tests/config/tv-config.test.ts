import { homedir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { TvConfigSchema } from '../../src/config/tv-config.js';

describe('TvConfigSchema', () => {
  it('fills in a working setup from an empty file', () => {
    const config = TvConfigSchema.parse({});
    expect(config.server.port).toBe(8765);
    expect(config.browser.kiosk).toBe(true);
    expect(config.providers).toEqual({});
  });

  it('expands ~ to the home directory', () => {
    const config = TvConfigSchema.parse({ dataDir: '~/tv-data' });
    expect(config.dataDir).toBe(`${homedir()}/tv-data`);
  });

  it('rejects a provider id that could not name a package', () => {
    expect(
      TvConfigSchema.safeParse({ providers: { 'Sun NXT': {} } }).success,
    ).toBe(false);
  });
});
