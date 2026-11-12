import {
  CatalogItemSchema,
  FollowRequestSchema,
  parseRefKey,
  PlaybackCommandSchema,
  PlaylistCreateSchema,
  PlaylistUpdateSchema,
  PlayRequestSchema,
  type Ref,
  RemoteKeySchema,
  SettingsUpdateSchema,
} from '@kiosk-tv/shared';
import { type Context, Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';

import {
  type CatalogService,
  ProviderUnavailableError,
} from '../catalog/catalog.service.js';
import type { EventHub } from '../events/event.hub.js';
import type { HomeService } from '../home/home.service.js';
import { type LibraryStore, NotFoundError } from '../library/library.store.js';
import type { Logger } from '../logging/logger.js';
import {
  PlaybackRequestError,
  type PlaybackService,
} from '../playback/playback.service.js';
import type { ProviderRegistry } from '../providers/provider.registry.js';
import type { WatchStore } from '../watch/watch.store.js';

export interface ApiDeps {
  registry: ProviderRegistry;
  catalog: CatalogService;
  home: () => Promise<unknown>;
  homeService: HomeService;
  library: LibraryStore;
  playback: PlaybackService;
  watch: WatchStore;
  events: EventHub;
  log: Logger;
}

async function body<Schema extends z.ZodType>(
  c: Context,
  schema: Schema,
): Promise<z.infer<Schema>> {
  const json: unknown = await c.req.json().catch(() => {
    throw new HTTPException(400, { message: 'The body is not JSON' });
  });
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new HTTPException(400, { message: z.prettifyError(parsed.error) });
  }
  return parsed.data;
}

function refParam(c: Context): Ref {
  const ref = parseRefKey(c.req.param('refKey') ?? '');
  if (!ref) throw new HTTPException(400, { message: 'Expected provider:id' });
  return ref;
}

export function createApi(deps: ApiDeps): Hono {
  const api = new Hono();

  api.onError((error, c) => {
    if (error instanceof HTTPException)
      return c.json({ error: error.message }, error.status);
    if (error instanceof NotFoundError)
      return c.json({ error: error.message }, 404);
    if (error instanceof ProviderUnavailableError)
      return c.json({ error: error.message }, 502);
    if (error instanceof PlaybackRequestError)
      return c.json({ error: error.message }, 409);
    deps.log.error('request failed', {
      path: c.req.path,
      error: String(error),
    });
    return c.json({ error: 'Something went wrong' }, 500);
  });

  const languages = async () => (await deps.library.read()).settings.languages;
  const cursor = (c: Context) => c.req.query('cursor');

  api.get('/home', async (c) => c.json(await deps.home()));
  api.get('/providers', (c) => c.json(deps.registry.list()));

  api.get('/providers/:id/shelves', async (c) => {
    const at = cursor(c);
    return c.json(
      await deps.catalog.shelvesOf(c.req.param('id'), {
        languages: await languages(),
        ...(at ? { cursor: at } : {}),
      }),
    );
  });
  api.get('/providers/:id/shelves/:shelf', async (c) => {
    const at = cursor(c);
    return c.json(
      await deps.catalog.shelfOf(c.req.param('id'), c.req.param('shelf'), {
        languages: await languages(),
        ...(at ? { cursor: at } : {}),
      }),
    );
  });
  api.get('/providers/:id/search', async (c) => {
    const query = c.req.query('q')?.trim();
    if (!query) throw new HTTPException(400, { message: 'Missing q' });
    return c.json(
      await deps.catalog.search(c.req.param('id'), query, {
        languages: await languages(),
      }),
    );
  });
  api.get('/providers/:id/library', async (c) => {
    const provider = deps.registry.get(c.req.param('id'));
    if (!provider)
      throw new ProviderUnavailableError(
        `${c.req.param('id')} is not available`,
      );
    return c.json(await provider.library());
  });

  api.get('/titles/:refKey', async (c) =>
    c.json(await deps.catalog.title(refParam(c))),
  );
  api.get('/titles/:refKey/episodes', async (c) => {
    const group = c.req.query('group');
    const at = cursor(c);
    const listing = await deps.catalog.episodes(refParam(c), {
      ...(group ? { group } : {}),
      ...(at ? { cursor: at } : {}),
    });
    return c.json({
      ...listing,
      page: {
        ...listing.page,
        items: await deps.watch.withProgress(listing.page.items),
      },
    });
  });

  api.get('/playback', (c) => c.json(deps.playback.state));
  api.post('/play', async (c) => {
    const request = await body(c, PlayRequestSchema);
    deps.playback.check(request);
    // Starting takes seconds; the launcher follows it through events.
    void deps.playback
      .play(request)
      .catch((error: unknown) =>
        deps.log.error('play failed', { error: String(error) }),
      );
    return c.body(null, 202);
  });
  api.post('/playback', async (c) => {
    await deps.playback.command(await body(c, PlaybackCommandSchema));
    return c.body(null, 204);
  });
  api.post('/keys', async (c) => {
    const { key } = await body(c, z.object({ key: RemoteKeySchema }));
    await deps.playback.key(key);
    return c.body(null, 204);
  });

  api.get('/events', (c) =>
    streamSSE(c, async (stream) => {
      const send = (data: unknown) =>
        stream.writeSSE({ data: JSON.stringify(data) });
      await send({ type: 'playback', playback: deps.playback.state });
      await send({ type: 'providers', providers: deps.registry.list() });
      const unsubscribe = deps.events.subscribe(
        (event) => void send(event).catch(() => {}),
      );
      stream.onAbort(unsubscribe);
      // Comments keep idle proxies and the browser from closing a quiet stream.
      while (!stream.aborted) {
        await stream.sleep(25_000);
        await stream.write(': keep-alive\n\n').catch(() => {});
      }
    }),
  );

  api.get('/library', async (c) => c.json(await deps.library.read()));
  api.put('/library/follows', async (c) => {
    const { title } = await body(c, FollowRequestSchema);
    return c.json(await deps.library.follow(title));
  });
  api.delete('/library/follows/:refKey', async (c) => {
    const ref = refParam(c);
    return c.json(await deps.library.unfollow(`${ref.provider}:${ref.id}`));
  });
  api.post('/library/playlists', async (c) =>
    c.json(
      await deps.library.createPlaylist(await body(c, PlaylistCreateSchema)),
      201,
    ),
  );
  api.patch('/library/playlists/:id', async (c) =>
    c.json(
      await deps.library.updatePlaylist(
        c.req.param('id'),
        await body(c, PlaylistUpdateSchema),
      ),
    ),
  );
  api.post('/library/playlists/:id/items', async (c) => {
    const { item } = await body(c, z.object({ item: CatalogItemSchema }));
    return c.json(await deps.library.addToPlaylist(c.req.param('id'), item));
  });
  api.delete('/library/playlists/:id', async (c) =>
    c.json(await deps.library.deletePlaylist(c.req.param('id'))),
  );
  api.patch('/settings', async (c) => {
    const library = await deps.library.updateSettings(
      await body(c, SettingsUpdateSchema),
    );
    deps.homeService.refreshAccounts();
    return c.json(library);
  });
  api.post('/refresh', async (c) => {
    await deps.registry.refreshStatus();
    deps.homeService.refreshAccounts();
    deps.events.publish({ type: 'providers', providers: deps.registry.list() });
    deps.events.publish({ type: 'home' });
    return c.body(null, 204);
  });

  return api;
}
