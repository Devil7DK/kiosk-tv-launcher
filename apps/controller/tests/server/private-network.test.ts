import { describe, expect, it } from 'vitest';

import { isPrivateAddress } from '../../src/server/private-network.js';

describe('isPrivateAddress', () => {
  it('lets in the TV itself and phones on the home network', () => {
    for (const ip of [
      '127.0.0.1',
      '::1',
      '192.168.1.20',
      '::ffff:192.168.1.20',
      '10.0.0.5',
      '172.20.1.1',
      'fd12:3456::1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('keeps out addresses from the internet', () => {
    for (const ip of [
      '8.8.8.8',
      '172.32.0.1',
      '::ffff:1.2.3.4',
      '2001:db8::1',
      undefined,
    ]) {
      expect(isPrivateAddress(ip), String(ip)).toBe(false);
    }
  });
});
