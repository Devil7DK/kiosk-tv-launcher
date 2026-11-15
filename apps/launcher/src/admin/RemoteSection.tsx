import type { RemoteButton } from '@kiosk-tv/shared';
import { useState } from 'preact/hooks';

import { adminApi } from '../api/api.client';

const PAD: [RemoteButton, string, string][] = [
  ['up', '▲', 'Up'],
  ['left', '◀', 'Left'],
  ['ok', 'OK', 'OK'],
  ['right', '▶', 'Right'],
  ['down', '▼', 'Down'],
];

const BELOW: [RemoteButton, string][] = [
  ['back', 'Back'],
  ['volumeDown', 'Volume −'],
  ['volumeUp', 'Volume +'],
];

/** The TV's remote on a phone, for when the real one is out of reach. */
export function RemoteSection() {
  const [error, setError] = useState<string | undefined>();
  const press = (button: RemoteButton) => {
    setError(undefined);
    adminApi.pressRemote(button).catch((e: unknown) => setError(String(e)));
  };

  return (
    <section>
      <h2>Remote</h2>
      {error && <p class='error'>{error}</p>}
      <div class='remote-pad'>
        {PAD.map(([button, label, name]) => (
          <button
            key={button}
            class={`remote-${button}`}
            aria-label={name}
            onClick={() => press(button)}
          >
            {label}
          </button>
        ))}
      </div>
      <div class='remote-below'>
        {BELOW.map(([button, label]) => (
          <button key={button} onClick={() => press(button)}>
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
