import { describe, expect, it } from 'vitest';

import { remoteKeyFor } from '../../src/index.js';

describe('remoteKeyFor', () => {
  it('treats every common Back key as back', () => {
    expect(['Escape', 'Backspace', 'BrowserBack'].map(remoteKeyFor)).toEqual([
      'back',
      'back',
      'back',
    ]);
  });

  it('ignores keys the remote does not have', () => {
    expect(remoteKeyFor('f')).toBeUndefined();
  });
});
