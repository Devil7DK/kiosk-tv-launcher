import type { RemoteStatus, TvBattery } from '@kiosk-tv/shared';
import { createContext } from 'preact';

/** What the TV knows about its own hardware, for screens that show it. */
export const RemoteStatusContext = createContext<RemoteStatus>({
  batteryLow: false,
});

/** Undefined on a computer without a battery. */
export const TvBatteryContext = createContext<TvBattery | undefined>(undefined);
