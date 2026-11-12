import { randomUUID } from 'node:crypto';

import {
  type CatalogItem,
  type Library,
  LibrarySchema,
  type PlaylistCreate,
  type PlaylistUpdate,
  type RefKey,
  refKey,
  type SettingsUpdate,
  type Title,
} from '@kiosk-tv/shared';

import type { Logger } from '../logging/logger.js';
import { JsonFile } from '../storage/json-file.js';

export class NotFoundError extends Error {
  override readonly name = 'NotFoundError';
}

/** Follows, playlists and settings, as edited from the admin page. */
export class LibraryStore {
  private readonly file: JsonFile<typeof LibrarySchema>;
  private readonly listeners = new Set<() => void>();

  constructor(
    path: string,
    log: Logger,
    private readonly now = () => new Date(),
  ) {
    this.file = new JsonFile(
      path,
      LibrarySchema,
      () => LibrarySchema.parse({}),
      log,
    );
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  read(): Promise<Library> {
    return this.file.read();
  }

  private async change(apply: (library: Library) => Library): Promise<Library> {
    const library = await this.file.update(apply);
    for (const listener of this.listeners) listener();
    return library;
  }

  follow(title: Title): Promise<Library> {
    const key = refKey(title.ref);
    return this.change((library) => ({
      ...library,
      follows: [
        ...library.follows.filter((f) => refKey(f.title.ref) !== key),
        { title, addedAt: this.now().toISOString() },
      ],
    }));
  }

  async unfollow(key: RefKey): Promise<Library> {
    const library = await this.read();
    if (!library.follows.some((f) => refKey(f.title.ref) === key)) {
      throw new NotFoundError(`Not following ${key}`);
    }
    return this.change((l) => ({
      ...l,
      follows: l.follows.filter((f) => refKey(f.title.ref) !== key),
    }));
  }

  createPlaylist(request: PlaylistCreate): Promise<Library> {
    return this.change((library) => ({
      ...library,
      playlists: [...library.playlists, { id: randomUUID(), ...request }],
    }));
  }

  async updatePlaylist(id: string, update: PlaylistUpdate): Promise<Library> {
    const library = await this.read();
    const playlist = library.playlists.find((p) => p.id === id);
    if (!playlist) throw new NotFoundError(`No playlist ${id}`);
    if (update.items && playlist.source.type !== 'manual') {
      throw new Error('Only a playlist made here can have its items changed');
    }
    return this.change((l) => {
      const others = l.playlists.filter((p) => p.id !== id);
      const updated = {
        ...playlist,
        ...(update.name ? { name: update.name } : {}),
        ...(update.items
          ? { source: { type: 'manual' as const, items: update.items } }
          : {}),
      };
      const at = Math.min(
        update.position ?? l.playlists.findIndex((p) => p.id === id),
        others.length,
      );
      others.splice(at, 0, updated);
      return { ...l, playlists: others };
    });
  }

  async addToPlaylist(id: string, item: CatalogItem): Promise<Library> {
    const playlist = (await this.read()).playlists.find((p) => p.id === id);
    if (!playlist) throw new NotFoundError(`No playlist ${id}`);
    if (playlist.source.type !== 'manual') {
      throw new Error('Only a playlist made here can have items added');
    }
    const key = refKey(item.ref);
    return this.updatePlaylist(id, {
      items: [
        ...playlist.source.items.filter((i) => refKey(i.ref) !== key),
        item,
      ],
    });
  }

  async deletePlaylist(id: string): Promise<Library> {
    if (!(await this.read()).playlists.some((p) => p.id === id)) {
      throw new NotFoundError(`No playlist ${id}`);
    }
    return this.change((l) => ({
      ...l,
      playlists: l.playlists.filter((p) => p.id !== id),
    }));
  }

  updateSettings(update: SettingsUpdate): Promise<Library> {
    return this.change((l) => ({
      ...l,
      settings: { ...l.settings, ...update },
    }));
  }
}
