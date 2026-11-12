import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serve } from '@hono/node-server';
import { getConnInfo } from '@hono/node-server/conninfo';
import { serveStatic } from '@hono/node-server/serve-static';
import { connectTvBrowser } from '@kiosk-tv/browser';
import { REMOTE_KEYBOARD_KEYS, remoteKeyFor } from '@kiosk-tv/shared';
import { Hono } from 'hono';

import { CatalogService } from './catalog/catalog.service.js';
import { TtlCache } from './catalog/ttl.cache.js';
import { loadTvConfig } from './config/tv-config.js';
import { EventHub } from './events/event.hub.js';
import { HomeService } from './home/home.service.js';
import { LibraryStore } from './library/library.store.js';
import { createLogger } from './logging/logger.js';
import { PlaybackService } from './playback/playback.service.js';
import { ProviderRegistry } from './providers/provider.registry.js';
import { createApi } from './server/api.routes.js';
import { isPrivateAddress } from './server/private-network.js';
import { WatchStore } from './watch/watch.store.js';

const STATUS_EVERY_MS = 15 * 60_000;

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

const browser = await connectTvBrowser(config.browser);
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
    log,
  }),
);
app.use('/*', serveStatic({ root: launcherDist }));
app.get('/*', serveStatic({ root: launcherDist, path: 'index.html' }));

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

async function shutdown(signal: string) {
  log.info('stopping', { signal });
  clearInterval(statusTimer);
  server.close();
  await registry.dispose();
  // Brave stays open, so the screen does not flash while the controller restarts.
  await browser.disconnect().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
