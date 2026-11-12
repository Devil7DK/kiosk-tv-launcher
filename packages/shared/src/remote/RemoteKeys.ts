import type { RemoteKey } from '../api/ApiSchemas.js';

/**
 * Keyboard keys a remote may send for each button. Remotes that pose as a
 * keyboard differ in what they send for Back, so several keys mean the same.
 */
const KEYS: Record<string, RemoteKey> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Enter: 'ok',
  ' ': 'ok',
  Escape: 'back',
  Backspace: 'back',
  BrowserBack: 'back',
  GoBack: 'back',
};

export const REMOTE_KEYBOARD_KEYS = Object.keys(KEYS);

export function remoteKeyFor(keyboardKey: string): RemoteKey | undefined {
  return KEYS[keyboardKey];
}

/** The key typed into the launcher for a button pressed on our own remote. */
const KEYBOARD: Record<RemoteKey, string> = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  ok: 'Enter',
  back: 'Escape',
};

export function keyboardKeyFor(key: RemoteKey): string {
  return KEYBOARD[key];
}
