import { readFileSync } from 'node:fs';

import type { ProviderContext, ProviderLogger } from '@kiosk-tv/provider-kit';
import type { Page } from 'playwright-core';

import type { SunNxtConfig } from '../src/sunnxt.provider.js';

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

/** A page whose in-page fetches are answered from fixtures, by URL. */
export function fakeSite(routes: Route[]) {
  const requests: { url: string; method: string; body?: string }[] = [];
  const page = {
    async evaluate(
      _fn: unknown,
      arg: { url: string; init: { method?: string; body?: string } },
    ) {
      requests.push({
        url: arg.url,
        method: arg.init.method ?? 'GET',
        ...(arg.init.body ? { body: arg.init.body } : {}),
      });
      const route = routes.find((r) => r.match.test(arg.url));
      if (!route) return { status: 404, text: '{}' };
      return {
        status: route.status ?? 200,
        text:
          typeof route.body === 'string'
            ? route.body
            : JSON.stringify(route.body),
      };
    },
  } as unknown as Page;
  return { page, requests };
}

export const quietLog: ProviderLogger = {
  info() {},
  warn() {},
  error() {},
};

export function contextFor(
  page: Page,
  profile = 'Test',
): ProviderContext<SunNxtConfig> {
  return {
    config: { profile },
    log: quietLog,
    pages: {
      background: async () => page,
      player: async () => page,
    },
  };
}
