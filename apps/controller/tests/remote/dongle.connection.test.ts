import { describe, expect, it } from 'vitest';

import {
  DongleConnection,
  type RemotePress,
  type SerialLink,
  type SerialPorts,
} from '../../src/remote/dongle.connection.js';
import { silentLog } from '../support/fakes.js';

/** A port that answers "?" with `greeting`, and can be fed lines and closed. */
class FakeLink implements SerialLink {
  lines: ((line: string) => void)[] = [];
  closes: (() => void)[] = [];
  closed = false;
  constructor(private readonly greeting?: string) {}
  onLine(listener: (line: string) => void) {
    this.lines.push(listener);
  }
  onClose(listener: () => void) {
    this.closes.push(listener);
  }
  write(text: string) {
    if (text === '?\n' && this.greeting)
      setTimeout(() => this.feed(this.greeting!), 1);
  }
  feed(line: string) {
    for (const listener of this.lines) listener(line);
  }
  async close() {
    this.closed = true;
  }
  unplug() {
    for (const listener of this.closes) listener();
  }
}

function ports(
  links: Record<string, FakeLink>,
): SerialPorts & { opened: string[] } {
  const opened: string[] = [];
  return {
    opened,
    candidates: async () => Object.keys(links),
    open: async (path) => {
      opened.push(path);
      const link = links[path];
      if (!link) throw new Error('no such port');
      return link;
    },
  };
}

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

describe('DongleConnection', () => {
  it('picks the port that greets as the dongle, then reads presses and battery reports', async () => {
    const other = new FakeLink();
    const dongle = new FakeLink('{"hello":"kiosk-tv-dongle","version":1}');
    const presses: RemotePress[] = [];
    const reports: (number | undefined)[] = [];
    const connection = new DongleConnection({
      onPress: (p) => presses.push(p),
      onBatteryReport: (mv) => reports.push(mv),
      log: silentLog,
      ports: ports({ '/dev/ttyUSB0': other, '/dev/ttyUSB1': dongle }),
      helloTimeoutMs: 10,
      retryMs: 10,
    });
    connection.start();
    await tick(60);
    expect(connection.connected).toBe(true);
    expect(other.closed).toBe(true);

    dongle.feed('{"key":"left","repeat":true,"battery":3950}');
    dongle.feed('{"key":"ok","repeat":false,"battery":0}');
    dongle.feed('{"battery":3712}');
    dongle.feed('boot garbage from the ESP8266 ROM');
    expect(presses).toEqual([
      { button: 'left', repeat: true, batteryMillivolts: 3950 },
      { button: 'ok', repeat: false },
    ]);
    expect(reports).toEqual([3712]);
    await connection.stop();
  });

  it('looks for the dongle again after it is unplugged', async () => {
    const dongle = new FakeLink('{"hello":"kiosk-tv-dongle","version":1}');
    const fake = ports({ '/dev/ttyUSB0': dongle });
    const connection = new DongleConnection({
      onPress: () => {},
      log: silentLog,
      ports: fake,
      helloTimeoutMs: 10,
      retryMs: 10,
    });
    connection.start();
    await tick();
    dongle.unplug();
    expect(connection.connected).toBe(false);
    await tick(40);
    expect(connection.connected).toBe(true);
    expect(fake.opened.length).toBeGreaterThanOrEqual(2);
    await connection.stop();
  });

  it('uses only the configured port when one is set', async () => {
    const fake = ports({
      '/dev/ttyUSB0': new FakeLink('{"hello":"kiosk-tv-dongle","version":1}'),
      '/dev/ttyUSB1': new FakeLink('{"hello":"kiosk-tv-dongle","version":1}'),
    });
    const connection = new DongleConnection({
      onPress: () => {},
      log: silentLog,
      ports: fake,
      port: '/dev/ttyUSB1',
      helloTimeoutMs: 10,
    });
    connection.start();
    await tick();
    expect(fake.opened).toEqual(['/dev/ttyUSB1']);
    await connection.stop();
  });
});
