import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

export interface BraveOptions {
  binary: string;
  /** Kept on 127.0.0.1: the DevTools port gives full control of every logged-in site. */
  port: number;
  /** A dedicated profile; Brave refuses remote debugging on the default one. */
  profileDir: string;
  kiosk: boolean;
}

export function braveArgs(options: BraveOptions): string[] {
  return [
    `--remote-debugging-port=${options.port}`,
    '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${options.profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    ...(options.kiosk ? ['--kiosk'] : []),
  ];
}

export function cdpUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

async function cdpReady(port: number): Promise<boolean> {
  try {
    const response = await fetch(`${cdpUrl(port)}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Starts Brave unless it already listens on the port. Brave is detached so it
 * outlives a controller restart and the viewer never sees the window close.
 */
export async function ensureBrave(
  options: BraveOptions,
  timeoutMs = 15_000,
): Promise<void> {
  if (await cdpReady(options.port)) return;

  await mkdir(options.profileDir, { recursive: true });
  spawn(options.binary, braveArgs(options), {
    detached: true,
    stdio: 'ignore',
  }).unref();

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdpReady(options.port)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `Brave did not open the DevTools port ${options.port} within ${timeoutMs} ms`,
  );
}
