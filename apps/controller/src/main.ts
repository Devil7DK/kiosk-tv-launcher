import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { serveStatic } from '@hono/node-server/serve-static';
import { connectTvBrowser, showVolume } from '@kiosk-tv/browser';
import { REMOTE_KEYBOARD_KEYS, remoteKeyFor } from '@kiosk-tv/shared';
import { type Context, Hono } from 'hono';

import { createSystemBluetooth } from './bluetooth/system-bluetooth.js';
import { CatalogService } from './catalog/catalog.service.js';
import { TtlCache } from './catalog/ttl.cache.js';
import { loadTvConfig } from './config/tv-config.js';
import { EventHub } from './events/event.hub.js';
import { HomeService } from './home/home.service.js';
import { LibraryStore } from './library/library.store.js';
import { createLogger } from './logging/logger.js';
import { PlaybackService } from './playback/playback.service.js';
import { powerTv } from './power/system-power.js';
import { readTvBattery } from './power/tv-battery.js';
import { ProviderRegistry } from './providers/provider.registry.js';
import { DongleConnection } from './remote/dongle.connection.js';
import { createRemoteInput } from './remote/remote.input.js';
import { RemoteStatusTracker } from './remote/remote.status.js';
import { createApi } from './server/api.routes.js';
import { isPrivateAddress } from './server/private-network.js';
import { WatchStore } from './watch/watch.store.js';

const STATUS_EVERY_MS = 15 * 60_000;
const BATTERY_EVERY_MS = 60_000;
// A speaker that was switched off cannot call back, so the TV calls it. Each
// call at a device that is off keeps the shared Wi-Fi and Bluetooth radio busy
// for about five seconds, so not more often.
const BLUETOOTH_RECONNECT_EVERY_MS = 30_000;

const configPath =
  process.argv[2] ??
  fileURLToPath(new URL('../../../config/tv.json', import.meta.url));
const launcherDist = fileURLToPath(
  new URL('../../launcher/dist/', import.meta.url),
);

const log = createLogger();
const config = await loadTvConfig(configPath);
const launcherUrl =
  config.launcherUrl ?? `http://127.0.0.1:${config.server.port}/`;

const browser = await connectTvBrowser({
  ...config.browser,
  startUrl: launcherUrl,
});
const events = new EventHub();
const registry = await ProviderRegistry.start(config.providers, {
  pagesFor: (manifest) => ({
    background: () => browser.background(manifest.id, manifest.origins[0]!),
    player: () => browser.player(),
  }),
  log,
});
const library = new LibraryStore(
  join(config.dataDir, 'library.json'),
  log.child('library'),
);
const watch = new WatchStore(
  join(config.dataDir, 'watch.json'),
  log.child('watch'),
);
const catalog = new CatalogService(registry, log.child('catalog'));
const homeService = new HomeService({
  registry,
  catalog,
  library,
  watch,
  log: log.child('home'),
});

const homeCache = new TtlCache<Awaited<ReturnType<HomeService['build']>>>(
  5 * 60_000,
);
const home = () => homeCache.get('home', () => homeService.build());
events.subscribe((event) => {
  if (event.type === 'home') homeCache.clear();
});
library.onChange(() => {
  homeCache.clear();
  events.publish({ type: 'home' });
  void library
    .read()
    .then((l) => events.publish({ type: 'settings', settings: l.settings }));
});

const screen = {
  showPlayer: async () => browser.show(await browser.player()),
  showLauncher: async () => browser.show(await browser.launcher(launcherUrl)),
};
const playback = new PlaybackService({
  registry,
  catalog,
  watch,
  screen,
  events,
  log: log.child('playback'),
});

let battery = await readTvBattery();
const bluetooth = createSystemBluetooth(log.child('bluetooth'));
const remoteStatus = new RemoteStatusTracker();
const remoteInput = createRemoteInput({
  playback,
  // Typed into the page directly, so it lands even if another window has focus.
  pressInLauncher: async (key) =>
    (await browser.launcher(launcherUrl)).keyboard.press(key),
  showVolume: async (volume) => {
    const state = playback.state.state;
    const front =
      state === 'playing' || state === 'starting'
        ? await browser.player()
        : await browser.launcher(launcherUrl);
    await showVolume(front, volume);
  },
  log: log.child('remote'),
});
const dongle = config.remote.enabled
  ? new DongleConnection({
      port: config.remote.port,
      log: log.child('remote'),
      onPress: (press) => {
        void remoteInput(press);
        const changed = remoteStatus.update(press);
        if (changed) events.publish({ type: 'remote', remote: changed });
      },
      onBatteryReport: (millivolts) => {
        const changed = remoteStatus.report(millivolts);
        if (changed) events.publish({ type: 'remote', remote: changed });
      },
    })
  : undefined;
dongle?.start();

await browser.capturePlayerKeys([...REMOTE_KEYBOARD_KEYS], (key) => {
  const remote =
    key === 'FullscreenExit' ? 'fullscreenExit' : remoteKeyFor(key);
  if (!remote) return;
  playback
    .key(remote)
    .catch((error: unknown) =>
      log.warn('key not handled', { key: remote, error: String(error) }),
    );
});

const app = new Hono();
app.use(async (c, next) => {
  if (!isPrivateAddress(getConnInfo(c).remote.address)) {
    return c.text('Only available on the home network', 403);
  }
  await next();
});
app.route(
  '/api',
  createApi({
    registry,
    catalog,
    home,
    homeService,
    library,
    playback,
    watch,
    events,
    remote: () => remoteStatus.current,
    battery: () => battery,
    bluetooth,
    ...(config.power.enabled ? { power: powerTv } : {}),
    log,
  }),
);
// Bundled files are named by their content and never change; the page that
// names them is checked on every load, so a rebuilt launcher shows at once.
const cacheHeaders = (path: string, c: Context) => {
  c.header(
    'Cache-Control',
    path.includes('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  );
};
app.use('/*', serveStatic({ root: launcherDist, onFound: cacheHeaders }));
app.get(
  '/*',
  serveStatic({
    root: launcherDist,
    path: 'index.html',
    onFound: cacheHeaders,
  }),
);

const server = serve(
  { fetch: app.fetch, hostname: config.server.host, port: config.server.port },
  (info) => log.info('listening', { port: info.port }),
);

await screen.showLauncher();

const statusTimer = setInterval(() => {
  void registry
    .refreshStatus()
    .then(() =>
      events.publish({ type: 'providers', providers: registry.list() }),
    );
}, STATUS_EVERY_MS);

const batteryTimer = setInterval(() => {
  void readTvBattery().then((latest) => {
    if (JSON.stringify(latest) === JSON.stringify(battery)) return;
    battery = latest;
    events.publish({ type: 'battery', battery: latest });
  });
}, BATTERY_EVERY_MS);

const bluetoothTimer = setInterval(
  () => void bluetooth.reconnect().catch(() => {}),
  BLUETOOTH_RECONNECT_EVERY_MS,
);

async function shutdown(signal: string) {
  log.info('stopping', { signal });
  clearInterval(statusTimer);
  clearInterval(batteryTimer);
  clearInterval(bluetoothTimer);
  await dongle?.stop().catch(() => {});
  server.close();
  await registry.dispose();
  // Brave stays open, so the screen does not flash while the controller restarts.
  await browser.disconnect().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
