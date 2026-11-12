import { readFileSync } from 'node:fs';

import type { ProviderContext, ProviderLogger } from '@kiosk-tv/provider-kit';
import type { Page } from 'playwright-core';

import type { Zee5Config } from '../src/zee5.provider.js';

export function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'),
  );
}

export interface Route {
  match: RegExp;
  body: unknown;
  status?: number;
}

export interface Login {
  signedIn: boolean;
  expiresAt?: number;
  profileId?: string;
}

/** A zee5.com page: API calls answered from fixtures, login state held in memory. */
export function fakeSite(
  routes: Route[],
  login: Login = { signedIn: true, profileId: 'p-test' },
) {
  const site = {
    login,
    profileSet: undefined as string | undefined,
    requests: [] as string[],
  };
  const page = {
    async evaluate(_fn: unknown, arg?: unknown) {
      if (arg === undefined) return site.login;
      if (typeof arg === 'string') {
        site.requests.push(arg);
        const route = routes.find((r) => r.match.test(arg));
        if (!route) return { status: 404, text: '' };
        // Server-rendered pages answer with the embedded JSON as text.
        return {
          status: route.status ?? 200,
          text: JSON.stringify(route.body),
        };
      }
      if (arg && typeof arg === 'object' && 'url' in arg) {
        const { url, init } = arg as { url: string; init: { body?: string } };
        const key = `${url} ${init.body ?? ''}`;
        site.requests.push(key);
        const route = routes.find((r) => r.match.test(key));
        if (!route) return { status: 404, text: '{}' };
        return {
          status: route.status ?? 200,
          text: JSON.stringify(route.body),
        };
      }
      site.profileSet = (arg as { id: string }).id;
      return undefined;
    },
  } as unknown as Page;
  return { page, site };
}

export const quietLog: ProviderLogger = { info() {}, warn() {}, error() {} };

export function contextFor(
  page: Page,
  profile = 'Test',
): ProviderContext<Zee5Config> {
  return {
    config: { profile },
    log: quietLog,
    pages: { background: async () => page, player: async () => page },
  };
}
