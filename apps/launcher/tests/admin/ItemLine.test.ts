import type { Playable, Title } from '@kiosk-tv/shared';
import { describe, expect, it } from 'vitest';

import { followTarget } from '../../src/admin/ItemLine';

const show: Title = {
  ref: { provider: 'sunnxt', id: '198692' },
  kind: 'series',
  name: 'Moondru Mudichu',
  artwork: {},
  url: 'https://www.sunnxt.com/show/detail/198692/0',
};

const episode: Playable = {
  ref: { provider: 'sunnxt', id: '282534' },
  kind: 'episode',
  title: 'E688 - Nov 11, 2026',
  parent: { ref: show.ref, name: show.name },
  artwork: {},
  url: 'https://www.sunnxt.com/player/282534',
};

describe('followTarget', () => {
  it('follows a show itself', () => {
    expect(followTarget(show)).toEqual({ ref: show.ref, label: '+ My shows' });
  });

  it('follows the show an episode belongs to, from a row of episodes', () => {
    expect(followTarget(episode)?.ref).toEqual(show.ref);
  });

  it('follows the channel of a YouTube video', () => {
    const video: Playable = {
      ...episode,
      kind: 'video',
      parent: {
        ref: { provider: 'youtube', id: 'UCkitchen' },
        name: 'Kitchen',
      },
    };
    expect(followTarget(video)).toEqual({
      ref: { provider: 'youtube', id: 'UCkitchen' },
      label: '+ Channel to My shows',
    });
  });

  it('offers nothing to follow for a film', () => {
    const { parent: _parent, ...film } = episode;
    expect(followTarget({ ...film, kind: 'movie' })).toBeUndefined();
  });
});
