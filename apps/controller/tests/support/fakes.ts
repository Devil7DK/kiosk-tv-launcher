import {
  defineProvider,
  type PlaybackEvents,
  type PlaybackSession,
  type Provider,
  type ProviderPages,
} from '@kiosk-tv/provider-kit';
import type { BluetoothDevice, Playable, Title } from '@kiosk-tv/shared';
import { z } from 'zod';

import type { Bluetooth } from '../../src/bluetooth/system-bluetooth.js';
import type { Logger } from '../../src/logging/logger.js';

export const silentLog: Logger = {
  info() {},
  warn() {},
  error() {},
  child: () => silentLog,
};

export const noPages: ProviderPages = {
  background: () => Promise.reject(new Error('no browser in tests')),
  player: () => Promise.reject(new Error('no browser in tests')),
};

export function show(provider: string, id: string, name: string): Title {
  return {
    ref: { provider, id },
    kind: 'series',
    name,
    artwork: {},
    url: `https://${provider}.example/show/${id}`,
  };
}

export function episode(
  parent: Title,
  number: number,
  airDate = `2026-11-${String((number % 28) + 1).padStart(2, '0')}`,
): Playable {
  const id = `${parent.ref.id}-e${number}`;
  return {
    ref: { provider: parent.ref.provider, id },
    kind: 'episode',
    title: `Episode ${number}`,
    parent: { ref: parent.ref, name: parent.name },
    number,
    airDate,
    artwork: {},
    url: `https://${parent.ref.provider}.example/play/${id}`,
  };
}

/** A session the test drives by hand. */
export class FakeSession implements PlaybackSession {
  private readonly listeners = new Map<
    string,
    Set<(...args: never[]) => void>
  >();
  stopped = false;
  paused = false;
  seeks: number[] = [];

  constructor(readonly playable: Playable) {}

  on<E extends keyof PlaybackEvents>(event: E, listener: PlaybackEvents[E]) {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener as (...args: never[]) => void);
    this.listeners.set(event, set);
    return () => set.delete(listener as (...args: never[]) => void);
  }

  emit<E extends keyof PlaybackEvents>(
    event: E,
    ...args: Parameters<PlaybackEvents[E]>
  ) {
    for (const fn of this.listeners.get(event) ?? []) {
      (fn as (...a: Parameters<PlaybackEvents[E]>) => void)(...args);
    }
  }

  async pause() {
    this.paused = true;
  }
  async resume() {
    this.paused = false;
  }
  async seek(seconds: number) {
    this.seeks.push(seconds);
  }
  async stop() {
    this.stopped = true;
  }
}

/** An in-memory provider: shows with their episodes, newest first. */
export function fakeProvider(
  catalog: { title: Title; episodes: Playable[] }[],
  overrides: Partial<Provider> = {},
) {
  const sessions: FakeSession[] = [];
  const plays: { playable: Playable; resumeAt?: number }[] = [];
  const provider: Provider = {
    status: async () => ({ state: 'ready' }),
    library: async () => ({
      follows: catalog.map((c) => c.title),
      playlists: [],
    }),
    shelves: async () => ({
      items: [
        {
          id: 'all',
          title: 'All',
          items: { items: catalog.map((c) => c.title) },
        },
      ],
    }),
    shelf: async () => ({ items: catalog.map((c) => c.title) }),
    title: async (ref) => {
      const found = catalog.find((c) => c.title.ref.id === ref.id);
      if (!found) throw new Error('unknown show');
      return found.title;
    },
    episodes: async (ref) => ({
      page: {
        items: catalog.find((c) => c.title.ref.id === ref.id)?.episodes ?? [],
      },
    }),
    resolve: async (url) =>
      catalog.find((c) => c.title.url === url.href)?.title,
    play: async (playable, options) => {
      plays.push({
        playable,
        ...(options?.resumeAt === undefined
          ? {}
          : { resumeAt: options.resumeAt }),
      });
      const session = new FakeSession(playable);
      sessions.push(session);
      return session;
    },
    ...overrides,
  };
  return { provider, sessions, plays };
}

export function fakeModule(id: string, provider: Provider) {
  return defineProvider({
    manifest: {
      id,
      name: id,
      color: '#123456',
      origins: [`https://${id}.example`],
    },
    configSchema: z.object({ profile: z.string().min(1) }),
    create: () => provider,
  });
}

/** A Bluetooth adapter in memory: devices appear when searched for. */
export function fakeBluetooth(nearby: { address: string; name: string }[]) {
  const devices = new Map<string, BluetoothDevice>();
  let scanning = false;
  const bluetooth: Bluetooth = {
    status: async () => ({
      available: true,
      scanning,
      devices: [...devices.values()],
    }),
    scan: async () => {
      scanning = true;
      for (const d of nearby)
        devices.set(d.address, { ...d, paired: false, connected: false });
    },
    connect: async (address) => {
      const device = devices.get(address);
      if (!device) throw new Error(`Device ${address} not available`);
      devices.set(address, { ...device, paired: true, connected: true });
    },
    disconnect: async (address) => {
      const device = devices.get(address);
      if (device) devices.set(address, { ...device, connected: false });
    },
    forget: async (address) => void devices.delete(address),
  };
  return bluetooth;
}
