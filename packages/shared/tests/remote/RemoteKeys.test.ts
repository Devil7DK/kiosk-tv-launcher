import { describe, expect, it } from 'vitest';

import {
  keyboardKeyFor,
  remoteKeyFor,
  RemoteKeySchema,
} from '../../src/index.js';

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

describe('keyboardKeyFor', () => {
  it('types a key the launcher reads back as the same button', () => {
    for (const key of RemoteKeySchema.options) {
      expect(remoteKeyFor(keyboardKeyFor(key))).toBe(key);
    }
  });
});
