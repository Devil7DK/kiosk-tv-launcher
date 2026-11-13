import {
  type CatalogItem,
  type Library,
  type ProviderInfo,
  refKey,
  type Shelf,
  type Title,
} from '@kiosk-tv/shared';
import { useEffect, useState } from 'preact/hooks';

import { adminApi, api } from '../api/api.client';
import { followItem } from './follow';
import { ItemLine } from './ItemLine';

type View =
  | { kind: 'shelves'; shelves: Shelf[]; next?: string | undefined }
  | { kind: 'search'; items: CatalogItem[] }
  | { kind: 'account'; follows: Title[]; playlists: Title[] };

/** Find shows and videos on one service and add them to the TV. */
export function BrowseSection({
  providers,
  library,
  onChange,
}: {
  providers: ProviderInfo[];
  library: Library;
  onChange: (change: Promise<Library>) => void;
}) {
  const usable = providers.filter(
    (p) => p.status.state !== 'failed' && p.status.state !== 'loggedOut',
  );
  const [provider, setProvider] = useState(usable[0]?.manifest.id ?? '');
  const [view, setView] = useState<View | undefined>();
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | undefined>();
  const searchable = usable
    .find((p) => p.manifest.id === provider)
    ?.capabilities.includes('search');

  useEffect(() => {
    if (!provider && usable[0]) setProvider(usable[0].manifest.id);
  }, [usable.length]);

  const run = (load: Promise<View>) => {
    setError(undefined);
    load.then(setView, (e: unknown) => setError(String(e)));
  };

  const showShelves = (cursor?: string) =>
    run(
      api.shelves(provider, cursor).then((page) => ({
        kind: 'shelves',
        shelves: [
          ...(cursor && view?.kind === 'shelves' ? view.shelves : []),
          ...page.items,
        ],
        next: page.next,
      })),
    );

  const follow = (item: CatalogItem) => {
    const change = followItem(item);
    if (change) onChange(change);
  };
  const followed = new Set(library.follows.map((f) => refKey(f.title.ref)));
  const addTo = (id: string, item: CatalogItem) =>
    onChange(adminApi.addToPlaylist(id, item));
  const line = (item: CatalogItem) => (
    <ItemLine
      key={`${item.ref.provider}:${item.ref.id}`}
      item={item}
      playlists={library.playlists}
      followed={followed}
      onFollow={follow}
      onAddTo={addTo}
    />
  );

  if (usable.length === 0) {
    return (
      <section>
        <h2>Add from a service</h2>
        <p class='muted'>No service is signed in and working right now.</p>
      </section>
    );
  }

  return (
    <section>
      <h2>Add from a service</h2>
      <div class='row-form'>
        <select
          value={provider}
          onChange={(e) => {
            setProvider(e.currentTarget.value);
            setView(undefined);
          }}
        >
          {usable.map((p) => (
            <option key={p.manifest.id} value={p.manifest.id}>
              {p.manifest.name}
            </option>
          ))}
        </select>
        <button onClick={() => showShelves()}>Browse</button>
        <button
          onClick={() =>
            run(
              adminApi
                .accountLists(provider)
                .then((l) => ({ kind: 'account', ...l })),
            )
          }
        >
          From the account
        </button>
      </div>
      {searchable && (
        <form
          class='row-form'
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) {
              run(
                adminApi
                  .search(provider, query.trim())
                  .then((items) => ({ kind: 'search', items })),
              );
            }
          }}
        >
          <input
            class='grow'
            value={query}
            placeholder='Search'
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          <button type='submit'>Search</button>
        </form>
      )}
      {error && <p class='error'>{error}</p>}
      {view?.kind === 'search' && <ul>{view.items.map(line)}</ul>}
      {view?.kind === 'shelves' && (
        <>
          {view.shelves.map((shelf) => (
            <details key={shelf.id}>
              <summary>
                {shelf.title}{' '}
                <span class='muted'>({shelf.items.items.length})</span>
              </summary>
              <ul>{shelf.items.items.map(line)}</ul>
            </details>
          ))}
          {view.next && (
            <button onClick={() => showShelves(view.next)}>More rows</button>
          )}
        </>
      )}
      {view?.kind === 'account' && (
        <>
          <h3>Shows on the account’s own list</h3>
          <p class='muted'>These are on the TV already, under My shows.</p>
          <ul>{view.follows.map(line)}</ul>
          <h3>Playlists</h3>
          {view.playlists.length === 0 && <p class='muted'>None.</p>}
          <ul>
            {view.playlists.map((playlist) => (
              <li key={playlist.ref.id}>
                <div class='grow'>{playlist.name}</div>
                <button
                  onClick={() =>
                    onChange(
                      adminApi.createPlaylist({
                        name: playlist.name,
                        source: { type: 'provider', title: playlist },
                      }),
                    )
                  }
                >
                  Show on the TV
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
