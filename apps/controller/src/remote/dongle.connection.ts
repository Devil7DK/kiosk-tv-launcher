import { ReadlineParser, SerialPort } from 'serialport';
import { z } from 'zod';

import type { Logger } from '../logging/logger.js';

export const RemoteButtonSchema = z.enum([
  'up',
  'down',
  'left',
  'right',
  'ok',
  'back',
  'volumeUp',
  'volumeDown',
]);
export type RemoteButton = z.infer<typeof RemoteButtonSchema>;

export interface RemotePress {
  button: RemoteButton;
  repeat: boolean;
  /** Absent when the remote has no battery divider fitted. */
  batteryMillivolts?: number;
}

const HelloSchema = z.object({
  hello: z.literal('kiosk-tv-dongle'),
  version: z.literal(1),
});
const BatteryReportSchema = z
  .object({ battery: z.number().int().nonnegative() })
  .strict();
const PressSchema = z.object({
  key: RemoteButtonSchema,
  repeat: z.boolean(),
  battery: z.number().int().nonnegative(),
});

/** One open serial port, as lines of text. */
export interface SerialLink {
  onLine(listener: (line: string) => void): void;
  onClose(listener: () => void): void;
  write(text: string): void;
  close(): Promise<void>;
}

export interface SerialPorts {
  /** USB serial ports that might be the dongle. */
  candidates(): Promise<string[]>;
  open(path: string): Promise<SerialLink>;
}

export const usbSerialPorts: SerialPorts = {
  async candidates() {
    return (await SerialPort.list())
      .filter(
        (port) => port.vendorId !== undefined || /tty(USB|ACM)/.test(port.path),
      )
      .map((port) => port.path);
  },
  open(path) {
    return new Promise((resolve, reject) => {
      const port = new SerialPort({ path, baudRate: 115200 }, (error) => {
        if (error) return reject(error);
        restartIntoFirmware(port);
        const lines = port.pipe(new ReadlineParser({ delimiter: '\n' }));
        resolve({
          onLine: (listener) =>
            lines.on('data', (line: string) => listener(line.trim())),
          onClose: (listener) => port.on('close', listener),
          write: (text) => port.write(text),
          close: () =>
            new Promise((done) =>
              port.isOpen ? port.close(() => done()) : done(),
            ),
        });
      });
    });
  },
};

/**
 * The NodeMCU's auto-reset circuit ties DTR to the boot-mode pin and RTS to
 * reset, so the way the port was last opened or closed can leave the ESP8266
 * in its silent flashing mode. A reset with DTR released always runs the
 * firmware, which greets once it has started.
 */
function restartIntoFirmware(port: SerialPort): void {
  port.set({ dtr: false, rts: true }, () => {
    setTimeout(() => port.set({ dtr: false, rts: false }), 100);
  });
}

/** The JSON object on a line, also behind the noise the ESP8266 prints as it starts. */
function parseLine(line: string): unknown {
  const start = line.indexOf('{"');
  if (start < 0) return undefined;
  try {
    return JSON.parse(line.slice(start));
  } catch {
    return undefined;
  }
}

/**
 * Finds the remote's USB dongle by the greeting it prints, reads its presses,
 * and looks for it again whenever it goes away.
 */
export class DongleConnection {
  private link: SerialLink | undefined;
  private timer: NodeJS.Timeout | undefined;
  private stopped = false;

  constructor(
    private readonly options: {
      onPress: (press: RemotePress) => void;
      /** The level the remote reports before it sleeps; undefined when it cannot measure. */
      onBatteryReport?: (batteryMillivolts: number | undefined) => void;
      log: Logger;
      /** A fixed port, instead of trying each USB serial port. */
      port?: string | undefined;
      ports?: SerialPorts;
      helloTimeoutMs?: number;
      retryMs?: number;
    },
  ) {}

  start(): void {
    void this.connect();
  }

  get connected(): boolean {
    return this.link !== undefined;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.link?.close();
  }

  private retry(): void {
    if (this.stopped) return;
    this.timer = setTimeout(
      () => void this.connect(),
      this.options.retryMs ?? 5000,
    );
  }

  /** Opens the port and waits for the greeting; the board restarts when opened, which also prints it. */
  private async probe(path: string): Promise<SerialLink | undefined> {
    const ports = this.options.ports ?? usbSerialPorts;
    let link: SerialLink;
    try {
      link = await ports.open(path);
    } catch {
      return undefined;
    }
    const greeted = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(
        () => resolve(false),
        this.options.helloTimeoutMs ?? 4000,
      );
      link.onLine((line) => {
        if (HelloSchema.safeParse(parseLine(line)).success) {
          clearTimeout(timeout);
          resolve(true);
        }
      });
      link.write('?\n');
    });
    if (greeted) return link;
    await link.close();
    return undefined;
  }

  private async connect(): Promise<void> {
    if (this.stopped || this.link) return;
    const ports = this.options.ports ?? usbSerialPorts;
    const paths = this.options.port
      ? [this.options.port]
      : await ports.candidates().catch(() => []);
    for (const path of paths) {
      const link = await this.probe(path);
      if (!link) continue;
      if (this.stopped) {
        await link.close();
        return;
      }
      this.link = link;
      this.options.log.info('remote dongle connected', { port: path });
      link.onLine((line) => {
        const json = parseLine(line);
        const report = BatteryReportSchema.safeParse(json);
        if (report.success) {
          const millivolts = report.data.battery;
          this.options.onBatteryReport?.(
            millivolts > 0 ? millivolts : undefined,
          );
          return;
        }
        const press = PressSchema.safeParse(json);
        if (!press.success) return;
        this.options.onPress({
          button: press.data.key,
          repeat: press.data.repeat,
          ...(press.data.battery > 0
            ? { batteryMillivolts: press.data.battery }
            : {}),
        });
      });
      link.onClose(() => {
        this.link = undefined;
        this.options.log.warn('remote dongle disconnected', { port: path });
        this.retry();
      });
      return;
    }
    this.retry();
  }
}
