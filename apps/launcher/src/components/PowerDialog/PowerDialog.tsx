import './PowerDialog.css';

import type { PowerAction } from '@kiosk-tv/shared';
import { useState } from 'preact/hooks';

import { api } from '../../api/api.client';
import { useRemote } from '../../remote/useRemote';
import { Button } from '../Button';

const SAYING: Record<PowerAction, string> = {
  shutdown: 'Shutting down…',
  restart: 'Restarting…',
};

/** Shut down or restart the TV, from the power button beside the settings. */
export function PowerDialog({ onClose }: { onClose: () => void }) {
  const [focus, setFocus] = useState<PowerAction>('shutdown');
  const [chosen, setChosen] = useState<PowerAction | undefined>();
  const [failed, setFailed] = useState(false);

  useRemote((key) => {
    if (chosen && !failed) return;
    if (key === 'back') return onClose();
    if (key === 'left') setFocus('shutdown');
    else if (key === 'right') setFocus('restart');
    else if (key === 'ok') {
      setChosen(focus);
      setFailed(false);
      api.power(focus).catch(() => setFailed(true));
    }
  });

  return (
    <div class='dialog-backdrop'>
      <div class='dialog' role='dialog' aria-label='Power'>
        <h2>Turn off the TV</h2>
        {chosen && !failed ? (
          <div class='power-saying'>{SAYING[chosen]}</div>
        ) : (
          <>
            {failed && (
              <div class='power-failed'>That did not work. Try again.</div>
            )}
            <div class='power-choices'>
              <Button label='Shut down' focused={focus === 'shutdown'} />
              <Button label='Restart' focused={focus === 'restart'} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
