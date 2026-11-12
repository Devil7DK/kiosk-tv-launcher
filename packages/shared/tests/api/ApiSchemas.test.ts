import { describe, expect, it } from 'vitest';

import { PlaylistCreateSchema, SettingsUpdateSchema } from '../../src/index.js';

describe('PlaylistCreateSchema', () => {
  it('rejects a name of only spaces, which would show as an empty row', () => {
    expect(
      PlaylistCreateSchema.safeParse({
        name: '   ',
        source: { type: 'manual', items: [] },
      }).success,
    ).toBe(false);
  });
});

describe('SettingsUpdateSchema', () => {
  it('changes one setting without restating the others', () => {
    expect(SettingsUpdateSchema.parse({ continueWatching: 'all' })).toEqual({
      continueWatching: 'all',
    });
  });
});
