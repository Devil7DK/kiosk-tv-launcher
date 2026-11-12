import {
  type CatalogItem,
  CatalogItemSchema,
  type EpisodeListing,
  EpisodeListingSchema,
  type Home,
  HomeSchema,
  type Page,
  pageSchema,
  type Playable,
  type PlaybackCommand,
  type ProviderInfo,
  ProviderInfoSchema,
  type Ref,
  refKey,
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
  await request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
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
  playback: (command: PlaybackCommand): Promise<void> =>
    post('/playback', command),
};
