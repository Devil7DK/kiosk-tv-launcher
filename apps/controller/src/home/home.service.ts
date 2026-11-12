import {
  type CatalogItem,
  type FollowedTitle,
  type Home,
  newerProgress,
  type Playable,
  type PlaylistView,
  type RefKey,
  refKey,
  type Title,
} from '@kiosk-tv/shared';

import type { CatalogService } from '../catalog/catalog.service.js';
import { TtlCache } from '../catalog/ttl.cache.js';
import type { LibraryStore } from '../library/library.store.js';
import type { Logger } from '../logging/logger.js';
import type { ProviderRegistry } from '../providers/provider.registry.js';
import type { WatchStore } from '../watch/watch.store.js';

const CONTINUE_WATCHING = 20;
/** Sites are asked about this many shows at once; the laptop is slow. */
const PARALLEL = 4;
const MINUTE = 60_000;

async function inBatches<In, Out>(
  items: readonly In[],
  run: (item: In) => Promise<Out>,
): Promise<Out[]> {
  const out: Out[] = [];
  for (let i = 0; i < items.length; i += PARALLEL) {
    out.push(...(await Promise.all(items.slice(i, i + PARALLEL).map(run))));
  }
  return out;
}

function updated(p: Playable): number {
  return Date.parse(p.progress?.updatedAt ?? '') || 0;
}

export class HomeService {
  private readonly accountLists = new TtlCache<{
    follows: Title[];
    playlists: Title[];
  }>(30 * MINUTE);
  private readonly accountProgress = new TtlCache<Playable[]>(10 * MINUTE);

  constructor(
    private readonly deps: {
      registry: ProviderRegistry;
      catalog: CatalogService;
      library: LibraryStore;
      watch: WatchStore;
      log: Logger;
    },
  ) {}

  /** Account lists are read again on the next build. */
  refreshAccounts(): void {
    this.accountLists.clear();
    this.accountProgress.clear();
  }

  private async fromAccounts() {
    const lists = await Promise.all(
      this.deps.registry.usable().map(({ manifest, provider }) =>
        this.accountLists
          .get(manifest.id, () => provider.library())
          .catch((error: unknown) => {
            this.deps.log.warn('could not read account lists', {
              provider: manifest.id,
              error: String(error),
            });
            return { follows: [], playlists: [] };
          }),
      ),
    );
    return { follows: lists.flatMap((l) => l.follows) };
  }

  private async followed(title: Title): Promise<FollowedTitle> {
    const newest = await this.deps.catalog
      .episodes(title.ref)
      .then((listing) => listing.page.items)
      .catch(() => [] as Playable[]);
    const latest = newest[0];
    const last = await this.deps.watch.lastOfShow(title.ref);
    const resume =
      last && !last.progress.completed
        ? { ...last.playable, progress: last.progress }
        : undefined;
    // Lists run newest first: anything above the episode watched last is new.
    // Position works where air dates are missing, as on YouTube playlists.
    const position = last
      ? newest.findIndex((e) => refKey(e.ref) === refKey(last.playable.ref))
      : -1;
    const hasNew =
      latest !== undefined &&
      last !== undefined &&
      (position >= 0
        ? position > 0
        : (latest.airDate ?? '') > (last.playable.airDate ?? ''));
    return {
      title,
      ...(latest ? { latest } : {}),
      ...(resume ? { resume } : {}),
      hasNew,
    };
  }

  private async continueWatching(all: boolean): Promise<Playable[]> {
    const byKey = new Map<RefKey, Playable>();
    for (const w of await this.deps.watch.recent()) {
      if (
        !w.progress.completed &&
        this.deps.registry.get(w.playable.ref.provider)
      ) {
        byKey.set(refKey(w.playable.ref), {
          ...w.playable,
          progress: w.progress,
        });
      }
    }
    if (all) {
      for (const { manifest, provider } of this.deps.registry.usable()) {
        if (!provider.progress) continue;
        const reported = await this.accountProgress
          .get(manifest.id, () => provider.progress!())
          .catch(() => [] as Playable[]);
        for (const playable of reported) {
          if (!playable.progress || playable.progress.completed) continue;
          const key = refKey(playable.ref);
          const ours = byKey.get(key);
          const progress = newerProgress(ours?.progress, playable.progress);
          byKey.set(key, {
            ...(ours ?? playable),
            ...(progress ? { progress } : {}),
          });
        }
      }
    }
    return [...byKey.values()]
      .sort((a, b) => updated(b) - updated(a))
      .slice(0, CONTINUE_WATCHING);
  }

  private async playlist(
    id: string,
    name: string,
    source:
      | { type: 'manual'; items: CatalogItem[] }
      | { type: 'provider'; title: Title },
  ): Promise<PlaylistView> {
    if (source.type === 'manual') {
      return {
        id,
        name,
        items: source.items.filter((item) =>
          this.deps.registry.get(item.ref.provider),
        ),
      };
    }
    const items = await this.deps.catalog
      .episodes(source.title.ref)
      .then((listing) => listing.page.items)
      .catch(() => []);
    return { id, name, items };
  }

  async build(): Promise<Home> {
    const library = await this.deps.library.read();
    const accounts = await this.fromAccounts();

    const titles = new Map<RefKey, Title>();
    for (const title of [
      ...library.follows.map((f) => f.title),
      ...accounts.follows,
    ]) {
      if (this.deps.registry.get(title.ref.provider))
        titles.set(refKey(title.ref), title);
    }
    const myShows = (
      await inBatches([...titles.values()], (t) => this.followed(t))
    ).sort(
      (a, b) =>
        Number(b.hasNew) - Number(a.hasNew) ||
        Number(Boolean(b.resume)) - Number(Boolean(a.resume)) ||
        (b.latest?.airDate ?? '').localeCompare(a.latest?.airDate ?? ''),
    );

    const playlists = (
      await inBatches(library.playlists, (p) =>
        this.playlist(p.id, p.name, p.source),
      )
    ).filter((p) => p.items.length > 0);

    return {
      continueWatching: await this.continueWatching(
        library.settings.continueWatching === 'all',
      ),
      myShows,
      playlists,
    };
  }
}
