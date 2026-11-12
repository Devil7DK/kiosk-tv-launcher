import { describe, expect, it } from 'vitest';

import {
  ageSeconds,
  continuationOf,
  episodeNumber,
  isNewestFirst,
} from '../../src/catalog/youtube.mapping.js';

describe('episodeNumber', () => {
  it('finds the number in the ways serial uploads write it', () => {
    expect(episodeNumber('Tenali Ramann | Episode 369 | தெனாலிராமன்')).toBe(
      369,
    );
    expect(episodeNumber('Ep 12 - Kitchen tour')).toBe(12);
    expect(episodeNumber('EP.7 Final')).toBe(7);
    expect(episodeNumber('Sambar rice, wedding style')).toBeUndefined();
  });
});

describe('ageSeconds', () => {
  it('reads short and long ages', () => {
    expect(ageSeconds('2w ago')).toBe(2 * 604800);
    expect(ageSeconds('3mo ago')).toBe(3 * 2629800);
    expect(ageSeconds('1 year ago')).toBe(31557600);
    expect(ageSeconds('Streamed 5 days ago')).toBe(5 * 86400);
    expect(ageSeconds('22h ago')).toBe(22 * 3600);
    expect(ageSeconds('70K')).toBeUndefined();
  });
});

describe('isNewestFirst', () => {
  it('trusts episode numbers over ages', () => {
    expect(isNewestFirst({ number: 369, age: 99 }, { number: 1, age: 1 })).toBe(
      true,
    );
    expect(isNewestFirst({ number: 1 }, { number: 369 })).toBe(false);
  });

  it('falls back to ages, then to a playlist that grows at the end', () => {
    expect(isNewestFirst({ age: 60 }, { age: 6000 })).toBe(true);
    expect(isNewestFirst({}, {})).toBe(false);
  });
});

describe('continuationOf', () => {
  it('finds the token of a list that wraps its command in another', () => {
    const list = {
      contents: [
        { lockupViewModel: {} },
        {
          continuationItemViewModel: {
            continuationCommand: {
              innertubeCommand: {
                continuationCommand: { token: 'next-page' },
              },
            },
          },
        },
      ],
    };
    expect(continuationOf(list)).toBe('next-page');
  });

  it('finds the token where older lists put it', () => {
    expect(
      continuationOf({
        continuationItemRenderer: {
          continuationEndpoint: { continuationCommand: { token: 'older' } },
        },
      }),
    ).toBe('older');
  });
});
