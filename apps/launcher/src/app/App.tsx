import './App.css';

import {
  type Playable,
  type PlaybackState,
  type ProviderInfo,
  refKey,
  type RemoteStatus,
} from '@kiosk-tv/shared';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'preact/hooks';

import { api } from '../api/api.client';
import { useServerEvents } from '../api/useServerEvents';
import { Message } from '../components/Message';
import { PowerDialog } from '../components/PowerDialog';
import { SettingsDialog } from '../components/SettingsDialog';
import {
  itemName,
  type Navigation,
  type Route,
  screenKey,
} from '../navigation/navigation';
import { useRemote } from '../remote/useRemote';
import { HomeScreen } from '../screens/HomeScreen';
import { ProviderScreen } from '../screens/ProviderScreen';
import { TitleScreen } from '../screens/TitleScreen';
import { UpNextScreen } from '../screens/UpNextScreen';
import { RemoteStatusContext } from './tv-status';

function usable(provider: ProviderInfo): boolean {
  return (
    provider.status.state !== 'loggedOut' && provider.status.state !== 'failed'
  );
}

function tabOf(stack: Route[]): string {
  const root = stack[0];
  return root?.kind === 'provider' ? root.id : 'home';
}

function NoticeScreen({
  route,
  active,
  onClose,
}: {
  route: Extract<Route, { kind: 'notice' }>;
  active: boolean;
  onClose: () => void;
}) {
  useRemote((key) => {
    if (key === 'ok' || key === 'back') onClose();
  }, active);
  return <Message title={route.title}>{route.detail}</Message>;
}

export function App() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [stack, setStack] = useState<Route[]>([{ kind: 'home' }]);
  const [version, setVersion] = useState(0);
  const [scale, setScale] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [power, setPower] = useState(false);
  const [powerOpen, setPowerOpen] = useState(false);
  useEffect(() => {
    api.powerAvailable().then(setPower, () => {});
  }, []);
  const [remote, setRemote] = useState<RemoteStatus>({ batteryLow: false });
  useEffect(() => {
    const root = document.getElementById('app');
    if (!root) return;
    // zoom scales every unit, the vw-based tile widths included, while
    // percentage sizes still fill the screen.
    root.style.zoom = String(scale);
  }, [scale]);
  const [playback, setPlayback] = useState<PlaybackState>({ state: 'idle' });
  const lastPlayback = useRef<PlaybackState>({ state: 'idle' });

  const tabs = useMemo(
    () => [
      { id: 'home', label: 'Home' },
      ...providers
        .filter(usable)
        .map((p) => ({ id: p.manifest.id, label: p.manifest.name })),
    ],
    [providers],
  );

  /** Goes to the show's page: back down the stack if it is open already, else opens it. */
  const showEpisodesOf = useCallback(async (playable: Playable) => {
    const parent = playable.parent;
    if (!parent) return setStack((s) => s.filter((r) => r.kind !== 'upNext'));
    const key = refKey(parent.ref);
    const title = await api.title(parent.ref).catch(() => undefined);
    setStack((s) => {
      const withoutUpNext = s.filter((r) => r.kind !== 'upNext');
      const at = withoutUpNext.findIndex(
        (r) => r.kind === 'title' && refKey(r.title.ref) === key,
      );
      if (at >= 0) return withoutUpNext.slice(0, at + 1);
      return title
        ? [...withoutUpNext, { kind: 'title', title }]
        : withoutUpNext;
    });
  }, []);

  useServerEvents((event) => {
    if (event.type === 'providers') setProviders(event.providers);
    if (event.type === 'home') setVersion((v) => v + 1);
    if (event.type === 'settings') setScale(event.settings.scale);
    if (event.type === 'remote') setRemote(event.remote);
    if (event.type !== 'playback') return;
    const state = event.playback;
    const previous = lastPlayback.current;
    lastPlayback.current = state;
    setPlayback(state);
    if (state.state !== 'finished' || previous.state === 'finished') return;
    if (state.reason === 'ended' && state.next) {
      const next = state.next;
      setStack((s) => [
        ...s.filter((r) => r.kind !== 'upNext'),
        { kind: 'upNext', finished: state.playable, next },
      ]);
    } else if (state.reason === 'ended') {
      void showEpisodesOf(state.playable);
    } else if (state.reason === 'failed') {
      setStack((s) => [
        ...s,
        {
          kind: 'notice',
          title: 'This did not start',
          detail: 'Try again in a little while.',
        },
      ]);
    }
  });

  const navigation: Navigation = {
    tabs,
    tab: tabOf(stack),
    switchTab: (id) =>
      setStack([id === 'home' ? { kind: 'home' } : { kind: 'provider', id }]),
    open: (route) => setStack((s) => [...s, route]),
    back: () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)),
    openSettings: () => setSettingsOpen(true),
    power,
    openPower: () => setPowerOpen(true),
    play: (playable, fromStart) => {
      setPlayback({ state: 'starting', playable });
      api.play(playable, fromStart).catch(() => {
        setPlayback({ state: 'idle' });
        setStack((s) => [
          ...s,
          {
            kind: 'notice',
            title: 'This did not start',
            detail: 'Try again in a little while.',
          },
        ]);
      });
    },
  };

  const starting = playback.state === 'starting';
  return (
    <RemoteStatusContext.Provider value={remote}>
      {stack.map((route, index) => {
        const top = index === stack.length - 1;
        const active = top && !starting && !settingsOpen && !powerOpen;
        return (
          <div key={screenKey(route, index)} class='screen' hidden={!top}>
            {route.kind === 'home' && (
              <HomeScreen
                navigation={navigation}
                active={active}
                version={version}
              />
            )}
            {route.kind === 'provider' && (
              <ProviderScreen
                id={route.id}
                navigation={navigation}
                active={active}
              />
            )}
            {route.kind === 'title' && (
              <TitleScreen
                title={route.title}
                navigation={navigation}
                active={active}
                version={version}
              />
            )}
            {route.kind === 'upNext' && (
              <UpNextScreen
                next={route.next}
                navigation={navigation}
                active={active}
                onShowEpisodes={() => void showEpisodesOf(route.finished)}
              />
            )}
            {route.kind === 'notice' && (
              <NoticeScreen
                route={route}
                active={active}
                onClose={navigation.back}
              />
            )}
          </div>
        );
      })}
      {settingsOpen && (
        <SettingsDialog scale={scale} onClose={() => setSettingsOpen(false)} />
      )}
      {powerOpen && <PowerDialog onClose={() => setPowerOpen(false)} />}
      {starting && (
        <div class='starting'>Starting {itemName(playback.playable)}…</div>
      )}
    </RemoteStatusContext.Provider>
  );
}
