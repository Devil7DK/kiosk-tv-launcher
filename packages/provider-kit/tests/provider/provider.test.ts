import { describe, expect, it } from 'vitest';

import { capabilitiesOf, type Provider } from '../../src/index.js';

const basic: Provider = {
  status: async () => ({ state: 'ready' }),
  listShows: async () => [],
  listEpisodes: async () => [],
  play: async () => {},
};

describe('capabilitiesOf', () => {
  it('reports nothing extra for a provider with only the required methods', () => {
    expect(capabilitiesOf(basic)).toEqual([]);
  });

  it('reports each optional method the provider implements', () => {
    expect(
      capabilitiesOf({
        ...basic,
        continueWatching: async () => [],
        search: async () => [],
      }),
    ).toEqual(['continueWatching', 'search']);
  });
});
