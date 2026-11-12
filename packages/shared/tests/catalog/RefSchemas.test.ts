import { describe, expect, it } from 'vitest';

import { parseRefKey, refKey, sameRef } from '../../src/index.js';

describe('refKey', () => {
  it('round-trips through parseRefKey', () => {
    const ref = { provider: 'zee5', id: '0-6-4z5846408' };
    expect(parseRefKey(refKey(ref))).toEqual(ref);
  });

  it('keeps colons that belong to the item id', () => {
    expect(parseRefKey('youtube:PL:odd')).toEqual({
      provider: 'youtube',
      id: 'PL:odd',
    });
  });

  it('rejects a key with no provider part', () => {
    expect(parseRefKey('1271328975')).toBeUndefined();
    expect(parseRefKey(':1271328975')).toBeUndefined();
  });
});

describe('sameRef', () => {
  it('tells apart equal ids from different providers', () => {
    expect(
      sameRef(
        { provider: 'hotstar', id: '1' },
        { provider: 'sunnxt', id: '1' },
      ),
    ).toBe(false);
  });
});
