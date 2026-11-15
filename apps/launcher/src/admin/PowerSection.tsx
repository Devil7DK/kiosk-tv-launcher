import type { PowerAction } from '@kiosk-tv/shared';
import { useEffect, useState } from 'preact/hooks';

import { api } from '../api/api.client';

const ASK: Record<PowerAction, string> = {
  shutdown:
    'Shut down the TV? It comes back on only with the laptop’s own power button.',
  restart: 'Restart the TV? Whatever is playing stops.',
};

const YES: Record<PowerAction, string> = {
  shutdown: 'Yes, shut down',
  restart: 'Yes, restart',
};

const SAYING: Record<PowerAction, string> = {
  shutdown: 'Shutting down…',
  restart: 'Restarting… this page works again in a minute or two.',
};

/** Shuts the TV down or restarts it, where the TV allows it; each asks first. */
export function PowerSection() {
  const [available, setAvailable] = useState(false);
  const [asking, setAsking] = useState<PowerAction | undefined>();
  const [sent, setSent] = useState<PowerAction | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    api.powerAvailable().then(setAvailable, () => {});
  }, []);
  if (!available) return null;

  const confirm = (action: PowerAction) => {
    setAsking(undefined);
    setError(undefined);
    api.power(action).then(
      () => setSent(action),
      (e: unknown) => setError(String(e)),
    );
  };

  return (
    <section>
      <h2>Shut down or restart</h2>
      {error && <p class='error'>{error}</p>}
      {sent ? (
        <p>{SAYING[sent]}</p>
      ) : asking ? (
        <>
          <p>{ASK[asking]}</p>
          <div class='row-form'>
            <button class='primary' onClick={() => confirm(asking)}>
              {YES[asking]}
            </button>
            <button onClick={() => setAsking(undefined)}>Cancel</button>
          </div>
        </>
      ) : (
        <div class='row-form'>
          <button onClick={() => setAsking('restart')}>Restart</button>
          <button onClick={() => setAsking('shutdown')}>Shut down</button>
        </div>
      )}
    </section>
  );
}
