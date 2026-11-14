import type { BluetoothDevice, BluetoothStatus } from '@kiosk-tv/shared';
import { useEffect, useState } from 'preact/hooks';

import { adminApi } from '../api/api.client';

const REFRESH_MS = 2000;

function DeviceLine({
  device,
  busy,
  onAction,
}: {
  device: BluetoothDevice;
  busy: boolean;
  onAction: (action: Promise<void>) => void;
}) {
  const { address } = device;
  return (
    <li>
      <div class='grow'>
        {device.name}
        {device.paired && (
          <span class='muted'>
            {' '}
            · {device.connected ? 'Connected' : 'Not connected'}
          </span>
        )}
      </div>
      {busy ? (
        <span class='muted'>Working…</span>
      ) : (
        <>
          {device.connected ? (
            <button
              onClick={() => onAction(adminApi.disconnectBluetooth(address))}
            >
              Disconnect
            </button>
          ) : (
            <button
              class='primary'
              onClick={() => onAction(adminApi.connectBluetooth(address))}
            >
              Connect
            </button>
          )}
          {device.paired && (
            <button onClick={() => onAction(adminApi.forgetBluetooth(address))}>
              Forget
            </button>
          )}
        </>
      )}
    </li>
  );
}

/** Pairs and connects a speaker or headphones to the TV. */
export function BluetoothSection() {
  const [status, setStatus] = useState<BluetoothStatus | undefined>();
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const load = () =>
    adminApi.bluetooth().then(setStatus, (e: unknown) => setError(String(e)));

  useEffect(() => {
    void load();
  }, []);
  // While searching or connecting, the list changes by itself.
  useEffect(() => {
    if (!status?.scanning && !busy) return;
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [status?.scanning, busy]);

  const act = (address: string) => (action: Promise<void>) => {
    setBusy(address);
    setError(undefined);
    action
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
      .finally(() => {
        setBusy(undefined);
        void load();
      });
  };

  if (status && !status.available) {
    return (
      <section>
        <h2>Bluetooth</h2>
        <p class='muted'>This computer has no Bluetooth.</p>
      </section>
    );
  }
  // The TV switches the adapter just after it saves the setting.
  const switchTo = (on: boolean) =>
    act('')(
      adminApi
        .settings({ bluetooth: on })
        .then(() => new Promise((resolve) => setTimeout(resolve, 1500))),
    );
  if (status && !status.powered) {
    return (
      <section>
        <h2>Bluetooth</h2>
        {error && <p class='error'>{error}</p>}
        <div class='row-form'>
          <span class='grow'>Bluetooth is off.</span>
          <button
            class='primary'
            disabled={busy !== undefined}
            onClick={() => switchTo(true)}
          >
            Turn on
          </button>
        </div>
      </section>
    );
  }
  const paired = status?.devices.filter((d) => d.paired) ?? [];
  const nearby = status?.devices.filter((d) => !d.paired) ?? [];
  return (
    <section>
      <h2>Bluetooth</h2>
      <div class='row-form'>
        <span class='grow'>Bluetooth is on.</span>
        <button disabled={busy !== undefined} onClick={() => switchTo(false)}>
          Turn off
        </button>
      </div>
      <p class='muted'>
        For a speaker or headphones. Put the device in pairing mode, search,
        then connect it while the search runs.
      </p>
      {error && <p class='error'>{error}</p>}
      {paired.length > 0 && (
        <ul>
          {paired.map((d) => (
            <DeviceLine
              key={d.address}
              device={d}
              busy={busy === d.address}
              onAction={act(d.address)}
            />
          ))}
        </ul>
      )}
      <div class='row-form'>
        <button
          disabled={status?.scanning}
          onClick={() =>
            adminApi
              .searchBluetooth()
              .then(load, (e: unknown) =>
                setError(e instanceof Error ? e.message : String(e)),
              )
          }
        >
          {status?.scanning ? 'Searching…' : 'Search for devices'}
        </button>
      </div>
      {nearby.length > 0 && (
        <ul>
          {nearby.map((d) => (
            <DeviceLine
              key={d.address}
              device={d}
              busy={busy === d.address}
              onAction={act(d.address)}
            />
          ))}
        </ul>
      )}
      {status?.scanning && nearby.length === 0 && (
        <p class='muted'>Looking for devices nearby…</p>
      )}
    </section>
  );
}
