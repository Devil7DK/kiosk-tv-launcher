import { describe, expect, it } from 'vitest';

import {
  CatalogItemSchema,
  isPlayable,
  PlayableSchema,
  ShelfSchema,
} from '../../src/index.js';

const episode = {
  ref: { provider: 'sunnxt', id: '282534' },
  kind: 'episode',
  title: 'E688 - Nov 11, 2026',
  parent: {
    ref: { provider: 'sunnxt', id: '198692' },
    name: 'Moondru Mudichu',
  },
  number: 688,
  airDate: '2026-11-11',
  artwork: {},
  url: 'https://www.sunnxt.com/player/282534',
};

const series = {
  ref: { provider: 'hotstar', id: '1260129356' },
  kind: 'series',
  name: 'Siragadikka Aasai',
  languages: ['ta'],
  artwork: {},
  url: 'https://www.hotstar.com/in/shows/siragadikka-aasai/1260129356',
};

describe('PlayableSchema', () => {
  it('accepts an episode with only what is needed to play it', () => {
    expect(PlayableSchema.parse(episode)).toEqual(episode);
  });

  it('rejects an episode with no URL, since it could never be played', () => {
    const { url: _url, ...withoutUrl } = episode;
    expect(PlayableSchema.safeParse(withoutUrl).success).toBe(false);
  });

  it('rejects a language name where a code is expected', () => {
    expect(
      PlayableSchema.safeParse({ ...episode, languages: ['tamil'] }).success,
    ).toBe(false);
  });
});

describe('CatalogItemSchema', () => {
  it('tells a show from an episode on a mixed shelf', () => {
    const shelf = ShelfSchema.parse({
      id: 'tamil-tv-shows',
      title: 'Tamil TV Shows',
      items: { items: [series, episode], next: '2' },
    });
    expect(shelf.items.items.map(isPlayable)).toEqual([false, true]);
  });

  it('rejects an item that is neither a show nor a playable', () => {
    expect(
      CatalogItemSchema.safeParse({ ...series, kind: 'episode' }).success,
    ).toBe(false);
  });
});
