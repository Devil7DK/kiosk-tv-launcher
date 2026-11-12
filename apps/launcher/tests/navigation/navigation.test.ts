import type { Playable } from '@kiosk-tv/shared';
import { describe, expect, it } from 'vitest';

import {
  itemName,
  itemSubtitle,
  screenKey,
} from '../../src/navigation/navigation';

const channel = {
  ref: { provider: 'youtube', id: 'UCkitchen' },
  name: "Sherin's Kitchen",
};

const video: Playable = {
  ref: { provider: 'youtube', id: 'v1' },
  kind: 'video',
  title: 'Mutton curry',
  parent: channel,
  artwork: {},
  url: 'https://www.youtube.com/watch?v=v1',
};

const episode: Playable = {
  ref: { provider: 'sunnxt', id: 'e1' },
  kind: 'episode',
  title: 'E688 - Nov 11, 2026',
  parent: { ref: { provider: 'sunnxt', id: 's1' }, name: 'Moondru Mudichu' },
  artwork: {},
  url: 'https://www.sunnxt.com/player/e1',
};

describe('tile names', () => {
  it('names a video by its own title, not its channel', () => {
    expect(itemName(video)).toBe('Mutton curry');
  });

  it('leaves the channel out on the channel’s own row, where every tile would repeat it', () => {
    expect(itemSubtitle(video, 'UCkitchen')).toBeUndefined();
    expect(itemSubtitle(video, 'subscriptions')).toBe("Sherin's Kitchen");
  });

  it('names an episode by its show, with the episode underneath', () => {
    expect(itemName(episode)).toBe('Moondru Mudichu');
    expect(itemSubtitle(episode)).toBe('E688 - Nov 11, 2026');
  });

  it('shows the channel of a feed video that names it only in its description', () => {
    const { parent: _parent, ...feed } = video;
    expect(itemSubtitle({ ...feed, description: "Gomathi's Kitchen" })).toBe(
      "Gomathi's Kitchen",
    );
  });
});

describe('screenKey', () => {
  it('gives a service tab that replaces another a fresh screen, not the old one’s rows', () => {
    expect(screenKey({ kind: 'provider', id: 'hotstar' }, 0)).not.toBe(
      screenKey({ kind: 'provider', id: 'sunnxt' }, 0),
    );
  });

  it('keeps the same screen while it shows the same thing', () => {
    expect(screenKey({ kind: 'home' }, 0)).toBe(screenKey({ kind: 'home' }, 0));
  });
});
