import { describe, expect, it } from 'vitest';

import { capabilitiesOf, type Provider } from '../../src/index.js';

const notUsed = () => Promise.reject(new Error('not used in this test'));

const basic: Provider = {
  status: async () => ({ state: 'ready' }),
  library: async () => ({ follows: [], playlists: [] }),
  shelves: async () => ({ items: [] }),
  shelf: async () => ({ items: [] }),
  title: notUsed,
  episodes: async () => ({ page: { items: [] } }),
  play: notUsed,
};

describe('capabilitiesOf', () => {
  it('reports nothing extra for a provider with only the required methods', () => {
    expect(capabilitiesOf(basic)).toEqual([]);
  });

  it('reports each optional method the provider implements', () => {
    expect(
      capabilitiesOf({
        ...basic,
        progress: async () => [],
        next: async () => null,
        search: async () => [],
      }),
    ).toEqual(['progress', 'next', 'search']);
  });
});
