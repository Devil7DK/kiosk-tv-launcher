import type { CatalogOptions, Provider } from '@kiosk-tv/provider-kit';
import {
  type CatalogItem,
  type EpisodeListing,
  type Page,
  type Playable,
  type Ref,
  refKey,
  type Shelf,
  type Title,
} from '@kiosk-tv/shared';

import type { Logger } from '../logging/logger.js';
import type { ProviderRegistry } from '../providers/provider.registry.js';
import { TtlCache } from './ttl.cache.js';

export class ProviderUnavailableError extends Error {
  override readonly name = 'ProviderUnavailableError';
}

const MINUTE = 60_000;

/** Provider calls with caching, and with failures logged once and named. */
export class CatalogService {
  private readonly shelves = new TtlCache<Page<Shelf>>(30 * MINUTE);
  private readonly shelf = new TtlCache<Page<CatalogItem>>(30 * MINUTE);
  private readonly titles = new TtlCache<Title>(60 * MINUTE);
  private readonly episodeLists = new TtlCache<EpisodeListing>(15 * MINUTE);

  constructor(
    private readonly registry: ProviderRegistry,
    private readonly log: Logger,
  ) {}

  private provider(id: string): Provider {
    const provider = this.registry.get(id);
    if (!provider) throw new ProviderUnavailableError(`${id} is not available`);
    return provider;
  }

  private async call<T>(
    id: string,
    what: string,
    run: (p: Provider) => Promise<T>,
  ): Promise<T> {
    const provider = this.provider(id);
    try {
      return await run(provider);
    } catch (error) {
      this.log.warn('provider call failed', {
        provider: id,
        what,
        error: String(error),
      });
      throw new ProviderUnavailableError(`${id} could not answer`);
    }
  }

  shelvesOf(id: string, options: CatalogOptions): Promise<Page<Shelf>> {
    return this.shelves.get(
      `${id}|${options.languages}|${options.cursor ?? ''}`,
      () => this.call(id, 'shelves', (p) => p.shelves(options)),
    );
  }

  shelfOf(
    id: string,
    shelf: string,
    options: CatalogOptions,
  ): Promise<Page<CatalogItem>> {
    return this.shelf.get(
      `${id}|${shelf}|${options.languages}|${options.cursor ?? ''}`,
      () => this.call(id, 'shelf', (p) => p.shelf(shelf, options)),
    );
  }

  title(ref: Ref): Promise<Title> {
    return this.titles.get(refKey(ref), () =>
      this.call(ref.provider, 'title', (p) => p.title(ref)),
    );
  }

  episodes(
    ref: Ref,
    options: { group?: string; cursor?: string } = {},
  ): Promise<EpisodeListing> {
    return this.episodeLists.get(
      `${refKey(ref)}|${options.group ?? ''}|${options.cursor ?? ''}`,
      () =>
        this.call(ref.provider, 'episodes', (p) => p.episodes(ref, options)),
    );
  }

  search(
    id: string,
    query: string,
    options: CatalogOptions,
  ): Promise<CatalogItem[]> {
    return this.call(id, 'search', async (p) => {
      if (!p.search) throw new Error('search is not offered');
      return p.search(query, options);
    });
  }

  /** The episode after `playable`: the provider's answer, or the newer neighbour in its list. */
  async nextOf(playable: Playable): Promise<Playable | undefined> {
    const provider = this.registry.get(playable.ref.provider);
    if (!provider) return undefined;
    try {
      if (provider.next) return (await provider.next(playable)) ?? undefined;
      if (playable.kind !== 'episode' || !playable.parent) return undefined;
      const key = refKey(playable.ref);
      const listing = await this.episodes(playable.parent.ref);
      const index = listing.page.items.findIndex((e) => refKey(e.ref) === key);
      return index > 0 ? listing.page.items[index - 1] : undefined;
    } catch (error) {
      this.log.warn('could not find the next episode', {
        error: String(error),
      });
      return undefined;
    }
  }

  /** Drops cached episode lists, so a show just watched shows its latest state. */
  forgetEpisodes(): void {
    this.episodeLists.clear();
  }
}
