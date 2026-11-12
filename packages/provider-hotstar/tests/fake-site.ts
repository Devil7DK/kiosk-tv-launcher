import { readFileSync } from 'node:fs';

import type { ProviderContext, ProviderLogger } from '@kiosk-tv/provider-kit';
import type { Page } from 'playwright-core';

import type { HotstarConfig } from '../src/hotstar.provider.js';

export function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'),
  );
}

export interface Route {
  /** Matched against the BFF path, plus the deeplink for `/v2/start`. */
  match: RegExp;
  body: unknown;
  status?: number;
  profileId?: string;
}

/** A hotstar.com page whose BFF calls are answered from fixtures. */
export function fakeSite(
  routes: Route[],
  profileId = 'test00000000000000000000000000003',
) {
  const site = { profileId, requests: [] as { url: string; body?: string }[] };
  const page = {
    async reload() {},
    async waitForRequest() {
      return {
        headers: () => ({
          'x-hs-platform': 'web',
          'x-hs-usertoken': 'not copied',
        }),
      };
    },
    async evaluate(_fn: unknown, arg?: { url: string; body?: string }) {
      if (!arg) return site.profileId;
      site.requests.push({
        url: arg.url,
        ...(arg.body ? { body: arg.body } : {}),
      });
      const key = `${arg.url} ${arg.body ?? ''}`;
      const route = routes.find((r) => r.match.test(key));
      if (!route) return { status: 404, body: '{}', profileId: null };
      if (route.profileId) site.profileId = route.profileId;
      return {
        status: route.status ?? 200,
        body: JSON.stringify(route.body),
        profileId: route.profileId ?? null,
      };
    },
  } as unknown as Page;
  return { page, site };
}

export const quietLog: ProviderLogger = { info() {}, warn() {}, error() {} };

export function contextFor(
  page: Page,
  profile = 'Test',
): ProviderContext<HotstarConfig> {
  return {
    config: { profile },
    log: quietLog,
    pages: { background: async () => page, player: async () => page },
  };
}
