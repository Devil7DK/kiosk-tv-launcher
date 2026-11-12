import { readFileSync } from 'node:fs';

import type { ProviderContext, ProviderLogger } from '@kiosk-tv/provider-kit';
import type { Page } from 'playwright-core';

export function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'),
  );
}

export interface Route {
  match: (request: Record<string, unknown>) => boolean;
  body: unknown;
}

/** A youtube.com page whose InnerTube calls are answered from fixtures. */
export function fakeSite(routes: Route[], signedIn = true) {
  const requests: Record<string, unknown>[] = [];
  const page = {
    async evaluate(_fn: unknown, arg?: { request: Record<string, unknown> }) {
      if (!arg) return signedIn;
      requests.push(arg.request);
      const route = routes.find((r) => r.match(arg.request));
      return { status: 200, text: JSON.stringify(route?.body ?? {}) };
    },
  } as unknown as Page;
  return { page, requests };
}

export const browseId = (id: string) => (request: Record<string, unknown>) =>
  request.browseId === id;

export const quietLog: ProviderLogger = { info() {}, warn() {}, error() {} };

export function contextFor(page: Page): ProviderContext<Record<string, never>> {
  return {
    config: {},
    log: quietLog,
    pages: { background: async () => page, player: async () => page },
  };
}
