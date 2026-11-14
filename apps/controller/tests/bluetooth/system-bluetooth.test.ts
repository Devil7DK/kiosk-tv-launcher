import { describe, expect, it } from 'vitest';

import {
  devicesToReconnect,
  failureOf,
  parseDevices,
} from '../../src/bluetooth/system-bluetooth.js';

describe('parseDevices', () => {
  it('reads the devices bluetoothctl lists, leaving out the ones without a name', () => {
    const text = [
      'Device 00:11:22:33:44:55 JBL Flip 5',
      'Device 66:77:88:99:AA:BB 66-77-88-99-AA-BB',
      'Agent registered',
      '',
    ].join('\n');
    expect(parseDevices(text)).toEqual([
      { address: '00:11:22:33:44:55', name: 'JBL Flip 5' },
    ]);
  });
});

describe('failureOf', () => {
  it('finds the failure in what bluetoothctl prints, even when it exits cleanly', () => {
    expect(
      failureOf(
        'Attempting to pair with 00:11:22:33:44:55\nFailed to pair: org.bluez.Error.AuthenticationFailed\n',
      ),
    ).toBe('Failed to pair: org.bluez.Error.AuthenticationFailed');
    expect(failureOf('Device 00:11:22:33:44:55 not available\n')).toBe(
      'Device 00:11:22:33:44:55 not available',
    );
    expect(failureOf('Connection successful\n')).toBeUndefined();
  });
});

describe('devicesToReconnect', () => {
  const speaker = '00:11:22:33:44:55';

  it('calls back a trusted speaker, even one a reboot left unpaired', () => {
    expect(devicesToReconnect([speaker], new Set(), new Set())).toEqual([
      speaker,
    ]);
  });

  it('leaves alone a device still connected, and one disconnected on purpose', () => {
    expect(
      devicesToReconnect([speaker], new Set([speaker]), new Set()),
    ).toEqual([]);
    expect(
      devicesToReconnect([speaker], new Set(), new Set([speaker])),
    ).toEqual([]);
  });
});
