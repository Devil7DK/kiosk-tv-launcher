import { describe, expect, it } from 'vitest';

import { EpisodeSchema } from '../../src/index.js';

const episode = {
  providerId: 'hotstar',
  id: '1000123',
  title: 'Episode 1',
  url: 'https://www.hotstar.com/in/shows/example/1000123',
};

describe('EpisodeSchema', () => {
  it('accepts an episode with only what is needed to play it', () => {
    expect(EpisodeSchema.parse(episode)).toEqual(episode);
  });

  it('rejects an episode with no URL, since it could never be played', () => {
    const { url: _url, ...withoutUrl } = episode;
    expect(EpisodeSchema.safeParse(withoutUrl).success).toBe(false);
  });

  it('rejects progress outside 0 to 1, so a percentage is not mistaken for a fraction', () => {
    expect(EpisodeSchema.safeParse({ ...episode, progress: 45 }).success).toBe(
      false,
    );
  });
});
