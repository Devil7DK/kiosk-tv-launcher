import type { Shelf } from '@kiosk-tv/shared';
import { useEffect, useRef, useState } from 'preact/hooks';

import { api } from '../../api/api.client';
import { Message } from '../../components/Message';
import { Row } from '../../components/Row';
import { Tile } from '../../components/Tile';
import { TopBar } from '../../components/TopBar';
import {
  clampFocus,
  columnOf,
  moveFocus,
  startFocus,
} from '../../focus/grid-focus';
import {
  choose,
  itemName,
  itemSubtitle,
  type Navigation,
} from '../../navigation/navigation';
import { useRemote } from '../../remote/useRemote';

/** Rows and items are fetched this close to the end of what is loaded. */
const AHEAD = 3;

type State =
  | { state: 'loading' }
  | { state: 'failed'; message: string }
  | { state: 'ready'; shelves: Shelf[]; next?: string | undefined };

export function ProviderScreen({
  id,
  navigation,
  active,
}: {
  id: string;
  navigation: Navigation;
  active: boolean;
}) {
  const [loaded, setLoaded] = useState<State>({ state: 'loading' });
  const busy = useRef(new Set<string>());

  const loadShelves = (cursor?: string) => {
    if (busy.current.has('shelves')) return;
    busy.current.add('shelves');
    api
      .shelves(id, cursor)
      .then(
        (page) =>
          setLoaded((current) => ({
            state: 'ready',
            shelves: [
              ...(current.state === 'ready' ? current.shelves : []),
              ...page.items,
            ],
            next: page.next,
          })),
        (error: unknown) =>
          setLoaded((current) =>
            current.state === 'ready'
              ? current
              : { state: 'failed', message: String(error) },
          ),
      )
      .finally(() => busy.current.delete('shelves'));
  };

  const loadMoreItems = (shelf: Shelf) => {
    const cursor = shelf.items.next;
    if (!cursor || busy.current.has(shelf.id)) return;
    busy.current.add(shelf.id);
    api
      .shelf(id, shelf.id, cursor)
      .then((page) =>
        setLoaded((current) =>
          current.state !== 'ready'
            ? current
            : {
                ...current,
                shelves: current.shelves.map((s) =>
                  s.id === shelf.id
                    ? {
                        ...s,
                        items: {
                          items: [...s.items.items, ...page.items],
                          next: page.next,
                        },
                      }
                    : s,
                ),
              },
        ),
      )
      .catch(() => {})
      .finally(() => busy.current.delete(shelf.id));
  };

  useEffect(() => loadShelves(), [id]);

  const shelves = loaded.state === 'ready' ? loaded.shelves : [];
  const lengths = [
    navigation.tabs.length,
    ...shelves.map((s) => s.items.items.length),
  ];
  // Going up to the tabs lands on this service's own tab.
  const [focus, setFocus] = useState(() => ({
    ...startFocus(1),
    columns: [
      Math.max(
        0,
        navigation.tabs.findIndex((t) => t.id === id),
      ),
    ],
  }));
  useEffect(() => {
    if (loaded.state === 'ready') setFocus((f) => clampFocus(f, lengths));
  }, [lengths.join()]);

  useEffect(() => {
    if (loaded.state !== 'ready') return;
    if (loaded.next && focus.row >= shelves.length - AHEAD)
      loadShelves(loaded.next);
    const shelf = shelves[focus.row - 1];
    if (shelf && columnOf(focus) >= shelf.items.items.length - AHEAD)
      loadMoreItems(shelf);
  }, [focus, loaded]);

  useRemote((key) => {
    if (key === 'back') return;
    if (key !== 'ok') return setFocus((f) => moveFocus(f, key, lengths));
    const column = columnOf(focus);
    if (focus.row === 0)
      return navigation.switchTab(navigation.tabs[column]!.id);
    const item = shelves[focus.row - 1]?.items.items[column];
    if (item) choose(navigation, item);
  }, active);

  return (
    <>
      <TopBar
        tabs={navigation.tabs}
        selected={id}
        focusedIndex={active && focus.row === 0 ? columnOf(focus) : undefined}
      />
      {loaded.state === 'loading' && <Message title='Loading…' />}
      {loaded.state === 'failed' && (
        <Message title='This service is not answering right now'>
          Try again in a while.
        </Message>
      )}
      {shelves.map((shelf, r) => (
        <Row
          key={shelf.id}
          title={shelf.title}
          focused={active && focus.row === r + 1}
        >
          {shelf.items.items.map((item, i) => (
            <Tile
              key={`${item.ref.provider}:${item.ref.id}`}
              title={itemName(item)}
              subtitle={itemSubtitle(item)}
              artwork={item.artwork}
              focused={active && focus.row === r + 1 && columnOf(focus) === i}
            />
          ))}
        </Row>
      ))}
    </>
  );
}
