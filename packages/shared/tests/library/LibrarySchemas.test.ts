import { describe, expect, it } from 'vitest';

import { LibrarySchema } from '../../src/index.js';

describe('LibrarySchema', () => {
  it('starts an empty store with Tamil and launcher-only continue watching', () => {
    expect(LibrarySchema.parse({})).toEqual({
      follows: [],
      playlists: [],
      settings: { continueWatching: 'launcher', languages: ['ta'], scale: 1 },
    });
  });

  it('keeps a playlist that mixes providers', () => {
    const library = LibrarySchema.parse({
      playlists: [
        {
          id: 'bhakti',
          name: 'Bhakti',
          source: {
            type: 'manual',
            items: [
              {
                ref: { provider: 'youtube', id: 'tMl4FpmGWWM' },
                kind: 'video',
                title: 'Tiruchendur temple',
                artwork: {},
                url: 'https://www.youtube.com/watch?v=tMl4FpmGWWM',
              },
              {
                ref: { provider: 'sunnxt', id: '198692' },
                kind: 'series',
                name: 'Moondru Mudichu',
                artwork: {},
                url: 'https://www.sunnxt.com/show/detail/198692/0',
              },
            ],
          },
        },
      ],
    });
    expect(library.playlists[0]?.source).toMatchObject({ type: 'manual' });
  });

  it('refuses a size so small or large the screen would be unusable', () => {
    expect(LibrarySchema.safeParse({ settings: { scale: 0.2 } }).success).toBe(
      false,
    );
    expect(LibrarySchema.safeParse({ settings: { scale: 3 } }).success).toBe(
      false,
    );
  });

  it('refuses to save no languages at all, which would empty every provider tab', () => {
    expect(
      LibrarySchema.safeParse({ settings: { languages: [] } }).success,
    ).toBe(false);
  });
});
