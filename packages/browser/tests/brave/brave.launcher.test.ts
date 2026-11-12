import { describe, expect, it } from 'vitest';

import { braveArgs } from '../../src/index.js';

const options = {
  binary: '/usr/bin/brave-browser',
  port: 9222,
  profileDir: '/tmp/kiosk-tv-profile',
  kiosk: true,
};

describe('braveArgs', () => {
  it('keeps the DevTools port off the network', () => {
    expect(braveArgs(options)).toContain(
      '--remote-debugging-address=127.0.0.1',
    );
  });

  it('lets videos start without a click, since nobody clicks on the TV', () => {
    expect(braveArgs(options)).toContain(
      '--autoplay-policy=no-user-gesture-required',
    );
  });

  it('opens in kiosk mode only when asked', () => {
    expect(braveArgs(options)).toContain('--kiosk');
    expect(braveArgs({ ...options, kiosk: false })).not.toContain('--kiosk');
  });

  it('opens the launcher as Brave starts, after every flag', () => {
    const args = braveArgs({ ...options, startUrl: 'http://127.0.0.1:8765/' });
    expect(args.at(-1)).toBe('http://127.0.0.1:8765/');
    expect(braveArgs(options).some((a) => a.startsWith('http'))).toBe(false);
  });
});
