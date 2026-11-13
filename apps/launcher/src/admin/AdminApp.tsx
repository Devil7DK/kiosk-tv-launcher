import './admin.css';

import type { Library, ProviderInfo, RemoteStatus } from '@kiosk-tv/shared';
import { useEffect, useState } from 'preact/hooks';

import { adminApi, api } from '../api/api.client';
import { AddFromLink } from './AddFromLink';
import { BluetoothSection } from './BluetoothSection';
import { BrowseSection } from './BrowseSection';
import { PlaylistsSection } from './PlaylistsSection';
import { SearchSection } from './SearchSection';

const SIZES = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6];

const LANGUAGES: [code: string, name: string][] = [
  ['ta', 'Tamil'],
  ['te', 'Telugu'],
  ['ml', 'Malayalam'],
  ['kn', 'Kannada'],
  ['hi', 'Hindi'],
  ['en', 'English'],
];

function statusText(provider: ProviderInfo): string {
  const status = provider.status;
  switch (status.state) {
    case 'ready':
      return 'Working';
    case 'loggedOut':
      return 'Signed out: sign in again in the TV’s browser';
    case 'wrongProfile':
      return `On the profile “${status.actual}” instead of “${status.expected}”`;
    case 'expiring':
      return `Sign-in runs out ${new Date(status.at).toLocaleString()}`;
    case 'failed':
      return `Not working: ${status.reason}`;
  }
}

function remoteText(remote: RemoteStatus | undefined): string {
  if (!remote?.lastHeardAt) return 'Not heard from since the TV started';
  if (remote.batteryPercent === undefined)
    return 'Working; battery level not measured';
  return `Battery ${remote.batteryPercent}%${remote.batteryLow ? ', needs charging' : ''}`;
}

/** The page family members open from a phone to set up the TV. */
export function AdminApp() {
  const [library, setLibrary] = useState<Library | undefined>();
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [remote, setRemote] = useState<RemoteStatus | undefined>();

  const loadProviders = () =>
    api.providers().then(setProviders, (e: unknown) => setError(String(e)));
  useEffect(() => {
    adminApi.library().then(setLibrary, (e: unknown) => setError(String(e)));
    void loadProviders();
    api.remote().then(setRemote, () => {});
  }, []);

  const onChange = (change: Promise<Library>) => {
    setError(undefined);
    change.then(setLibrary, (e: unknown) => setError(String(e)));
  };

  if (!library) {
    return (
      <div class='admin'>
        {error ? <p class='error'>{error}</p> : 'Loading…'}
      </div>
    );
  }
  const { settings } = library;

  return (
    <div class='admin'>
      <section>
        <h1>TV setup</h1>
        {error && <p class='error'>{error}</p>}
        <ul>
          {providers.map((p) => (
            <li key={p.manifest.id}>
              <div class='grow'>{p.manifest.name}</div>
              <div class='muted'>{statusText(p)}</div>
            </li>
          ))}
        </ul>
        <ul>
          <li>
            <div class='grow'>Remote</div>
            <div class='muted'>{remoteText(remote)}</div>
          </li>
        </ul>
        <div class='row-form'>
          <button onClick={() => adminApi.refresh().then(loadProviders)}>
            Check again
          </button>
        </div>
      </section>

      <SearchSection
        providers={providers}
        library={library}
        onChange={onChange}
      />

      <section>
        <h2>My shows</h2>
        <p class='muted'>
          Added here. Shows on each service’s own watchlist or favourites appear
          on the TV too.
        </p>
        <AddFromLink onAdded={setLibrary} />
        {library.follows.length === 0 && (
          <p class='muted'>None added here yet.</p>
        )}
        <ul>
          {library.follows.map(({ title }) => (
            <li key={`${title.ref.provider}:${title.ref.id}`}>
              <div class='grow'>
                {title.name} <span class='muted'>· {title.ref.provider}</span>
              </div>
              <button onClick={() => onChange(adminApi.unfollow(title.ref))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      <PlaylistsSection library={library} onChange={onChange} />
      <BluetoothSection />
      <BrowseSection
        providers={providers}
        library={library}
        onChange={onChange}
      />

      <section>
        <h2>Settings</h2>
        <p>Continue watching shows</p>
        <label class='row-form'>
          <input
            type='radio'
            checked={settings.continueWatching === 'launcher'}
            onChange={() =>
              onChange(adminApi.settings({ continueWatching: 'launcher' }))
            }
          />
          only what was started on this TV
        </label>
        <label class='row-form'>
          <input
            type='radio'
            checked={settings.continueWatching === 'all'}
            onChange={() =>
              onChange(adminApi.settings({ continueWatching: 'all' }))
            }
          />
          also what the services report from other devices
        </label>
        <p>Size of everything on the TV</p>
        <label class='row-form'>
          <select
            value={String(settings.scale)}
            onChange={(e) =>
              onChange(
                adminApi.settings({ scale: Number(e.currentTarget.value) }),
              )
            }
          >
            {SIZES.map((size) => (
              <option key={size} value={String(size)}>
                {Math.round(size * 100)}%{size === 1 ? ' (normal)' : ''}
              </option>
            ))}
          </select>
        </label>
        <p>Languages on the service tabs</p>
        {LANGUAGES.map(([code, name]) => (
          <label key={code} class='row-form'>
            <input
              type='checkbox'
              checked={settings.languages.includes(code)}
              disabled={
                settings.languages.length === 1 &&
                settings.languages.includes(code)
              }
              onChange={(e) => {
                const languages = e.currentTarget.checked
                  ? [...settings.languages, code]
                  : settings.languages.filter((l) => l !== code);
                onChange(adminApi.settings({ languages }));
              }}
            />
            {name}
          </label>
        ))}
      </section>
    </div>
  );
}
