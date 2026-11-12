import {
  type CatalogItem,
  CatalogItemSchema,
  type EpisodeListing,
  EpisodeListingSchema,
  type Home,
  HomeSchema,
  type Library,
  LibrarySchema,
  type Page,
  pageSchema,
  type Playable,
  type PlaybackCommand,
  type PlaylistCreate,
  type PlaylistUpdate,
  type ProviderInfo,
  ProviderInfoSchema,
  type Ref,
  refKey,
  type RemoteStatus,
  RemoteStatusSchema,
  type SettingsUpdate,
  type Shelf,
  ShelfSchema,
  type Title,
  TitleSchema,
} from '@kiosk-tv/shared';
import { z } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`/api${path}`, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new ApiError(response.status, body.error ?? response.statusText);
  }
  return response;
}

async function get<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
): Promise<z.infer<Schema>> {
  return schema.parse(await (await request(path)).json());
}

async function post(path: string, body: unknown): Promise<void> {
  await send('POST', path, body);
}

async function send(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return request(path, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
}

async function sendFor<Schema extends z.ZodType>(
  method: string,
  path: string,
  schema: Schema,
  body?: unknown,
): Promise<z.infer<Schema>> {
  return schema.parse(await (await send(method, path, body)).json());
}

const query = (params: Record<string, string | undefined>) => {
  const entries = Object.entries(params).filter(
    (e): e is [string, string] => e[1] !== undefined,
  );
  return entries.length ? `?${new URLSearchParams(entries)}` : '';
};

export const api = {
  home: (): Promise<Home> => get('/home', HomeSchema),
  providers: (): Promise<ProviderInfo[]> =>
    get('/providers', z.array(ProviderInfoSchema)),
  shelves: (provider: string, cursor?: string): Promise<Page<Shelf>> =>
    get(
      `/providers/${provider}/shelves${query({ cursor })}`,
      pageSchema(ShelfSchema),
    ),
  shelf: (
    provider: string,
    shelf: string,
    cursor?: string,
  ): Promise<Page<CatalogItem>> =>
    get(
      `/providers/${provider}/shelves/${encodeURIComponent(shelf)}${query({ cursor })}`,
      pageSchema(CatalogItemSchema),
    ),
  title: (ref: Ref): Promise<Title> =>
    get(`/titles/${refKey(ref)}`, TitleSchema),
  episodes: (ref: Ref, cursor?: string): Promise<EpisodeListing> =>
    get(
      `/titles/${refKey(ref)}/episodes${query({ cursor })}`,
      EpisodeListingSchema,
    ),
  play: (playable: Playable, fromStart = false): Promise<void> =>
    post('/play', { playable, ...(fromStart ? { fromStart } : {}) }),
  remote: (): Promise<RemoteStatus> => get('/remote', RemoteStatusSchema),
  playback: (command: PlaybackCommand): Promise<void> =>
    post('/playback', command),
};

/** What the admin page changes; every call answers with the whole library. */
export const adminApi = {
  library: (): Promise<Library> => get('/library', LibrarySchema),
  follow: (title: Title): Promise<Library> =>
    sendFor('PUT', '/library/follows', LibrarySchema, { title }),
  unfollow: (ref: Ref): Promise<Library> =>
    sendFor('DELETE', `/library/follows/${refKey(ref)}`, LibrarySchema),
  createPlaylist: (request: PlaylistCreate): Promise<Library> =>
    sendFor('POST', '/library/playlists', LibrarySchema, request),
  updatePlaylist: (id: string, update: PlaylistUpdate): Promise<Library> =>
    sendFor('PATCH', `/library/playlists/${id}`, LibrarySchema, update),
  addToPlaylist: (id: string, item: CatalogItem): Promise<Library> =>
    sendFor('POST', `/library/playlists/${id}/items`, LibrarySchema, { item }),
  deletePlaylist: (id: string): Promise<Library> =>
    sendFor('DELETE', `/library/playlists/${id}`, LibrarySchema),
  settings: (update: SettingsUpdate): Promise<Library> =>
    sendFor('PATCH', '/settings', LibrarySchema, update),
  accountLists: (
    provider: string,
  ): Promise<{ follows: Title[]; playlists: Title[] }> =>
    get(
      `/providers/${provider}/library`,
      z.object({
        follows: z.array(TitleSchema),
        playlists: z.array(TitleSchema),
      }),
    ),
  search: (provider: string, q: string): Promise<CatalogItem[]> =>
    get(
      `/providers/${provider}/search${query({ q })}`,
      z.array(CatalogItemSchema),
    ),
  refresh: (): Promise<void> => post('/refresh', {}),
  followLink: (url: string): Promise<{ title: Title; library: Library }> =>
    sendFor(
      'POST',
      '/library/follows/from-link',
      z.object({ title: TitleSchema, library: LibrarySchema }),
      { url },
    ),
};
