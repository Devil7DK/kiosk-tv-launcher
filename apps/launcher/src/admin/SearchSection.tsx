import {
  type CatalogItem,
  type Library,
  type ProviderInfo,
  refKey,
  type SearchResult,
} from '@kiosk-tv/shared';
import { useState } from 'preact/hooks';

import { adminApi, api } from '../api/api.client';
import { itemName } from '../navigation/navigation';
import { followItem } from './follow';
import { ItemLine } from './ItemLine';

/** Enough to find the right one on a phone without scrolling past four services' worth. */
const SHOWN_AT_FIRST = 5;

/** Finds a show, film or video on every service at once, to play it or keep it. */
export function SearchSection({
  providers,
  library,
  onChange,
}: {
  providers: ProviderInfo[];
  library: Library;
  onChange: (change: Promise<Library>) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | undefined>();
  const [busy, setBusy] = useState(false);
  /** Services whose whole list is shown, not only the first few results. */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [message, setMessage] = useState<
    { text: string; error: boolean } | undefined
  >();

  const nameOf = (id: string) =>
    providers.find((p) => p.manifest.id === id)?.manifest.name ?? id;
  const followed = new Set(library.follows.map((f) => refKey(f.title.ref)));

  const search = (event: Event) => {
    event.preventDefault();
    const text = query.trim();
    if (!text || busy) return;
    setBusy(true);
    setMessage(undefined);
    adminApi
      .searchAll(text)
      .then(
        (found) => {
          setResults(found);
          setExpanded(new Set());
        },
        (e: unknown) =>
          setMessage({
            text: e instanceof Error ? e.message : String(e),
            error: true,
          }),
      )
      .finally(() => setBusy(false));
  };

  const follow = (item: CatalogItem) => {
    const change = followItem(item);
    if (change) onChange(change);
  };

  return (
    <section>
      <h2>Search</h2>
      <p class='muted'>
        Type the name in English letters: ZEE5 and Sun NXT do not find Tamil
        letters. Voice typing works too, with the keyboard set to English.
      </p>
      <form class='row-form' onSubmit={search}>
        <input
          class='grow'
          type='search'
          enterKeyHint='search'
          value={query}
          placeholder='Show, film or video name'
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
        <button class='primary' type='submit' disabled={busy}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </form>
      {message && (
        <p class={message.error ? 'error' : 'muted'}>{message.text}</p>
      )}
      {results?.length === 0 && (
        <p class='muted'>None of the services can search.</p>
      )}
      {results?.map((result) => (
        <div key={result.provider}>
          <h3>{nameOf(result.provider)}</h3>
          {result.failed ? (
            <p class='muted'>
              Could not search {nameOf(result.provider)} just now.
            </p>
          ) : result.items.length === 0 ? (
            <p class='muted'>Nothing found.</p>
          ) : (
            <ul>
              {(expanded.has(result.provider)
                ? result.items
                : result.items.slice(0, SHOWN_AT_FIRST)
              ).map((item) => (
                <ItemLine
                  key={`${item.ref.provider}:${item.ref.id}`}
                  item={item}
                  playlists={library.playlists}
                  followed={followed}
                  onFollow={follow}
                  onAddTo={(id, added) =>
                    onChange(adminApi.addToPlaylist(id, added))
                  }
                  onPlay={(playable) =>
                    api.play(playable).then(
                      () =>
                        setMessage({
                          text: `Playing on the TV: ${itemName(playable)}`,
                          error: false,
                        }),
                      (e: unknown) =>
                        setMessage({
                          text: e instanceof Error ? e.message : String(e),
                          error: true,
                        }),
                    )
                  }
                />
              ))}
            </ul>
          )}
          {!expanded.has(result.provider) &&
            result.items.length > SHOWN_AT_FIRST && (
              <button
                onClick={() =>
                  setExpanded((shown) => new Set([...shown, result.provider]))
                }
              >
                Show all {result.items.length}
              </button>
            )}
        </div>
      ))}
    </section>
  );
}
