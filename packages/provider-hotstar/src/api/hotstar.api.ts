import { SiteRequestError, SiteResponseError } from '@kiosk-tv/provider-kit';
import type { Page } from 'playwright-core';
import type { z } from 'zod';

import {
  ItemsPageSchema,
  SpaceSchema,
  type StartPage,
  StartSchema,
} from './hotstar.schemas.js';

export const SITE = 'https://www.hotstar.com';
const BFF = '/api/internal/bff';

/** BFF paths come from earlier answers; only these are ever requested. */
export function isBffPath(path: string): boolean {
  return path.startsWith('/v2/') && !path.includes('..');
}

interface Answer {
  status: number;
  body: string;
  profileId: string | null;
}

/**
 * Calls the site's BFF from inside a hotstar.com page. The site's own headers
 * are copied from one of its requests; they carry location details and are
 * never logged.
 */
export class HotstarApi {
  private headers: Promise<Record<string, string>> | undefined;

  constructor(private readonly page: () => Promise<Page>) {}

  private async siteHeaders(): Promise<Record<string, string>> {
    this.headers ??= (async () => {
      const page = await this.page();
      const seen = page.waitForRequest((r) => r.url().includes(BFF), {
        timeout: 30_000,
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      const headers = (await seen).headers();
      // The token is read from the cookie on every call, since the site rotates it.
      return Object.fromEntries(
        Object.entries(headers).filter(
          ([k]) => k.startsWith('x-') && k !== 'x-hs-usertoken',
        ),
      );
    })();
    this.headers.catch(() => {
      this.headers = undefined;
    });
    return this.headers;
  }

  private async raw(
    path: string,
    method: 'GET' | 'POST' | 'PUT',
    body?: unknown,
  ): Promise<Answer> {
    if (!isBffPath(path)) throw new Error(`Refusing to request ${path}`);
    const headers = await this.siteHeaders();
    const page = await this.page();
    const answer = await page.evaluate(
      async ({ url, method, body, headers }) => {
        const token = /(?:^|; )userUP=([^;]+)/.exec(document.cookie)?.[1] ?? '';
        const response = await fetch(url, {
          method,
          credentials: 'include',
          headers: {
            ...headers,
            'x-hs-usertoken': token,
            ...(body === undefined
              ? {}
              : { 'content-type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body }),
        });
        // The site keeps these cookies in step with the server; calls made here must too.
        const keep = '; path=/; max-age=15552000; secure; samesite=none';
        const updated = response.headers.get('x-hs-updatedusertoken');
        const profileId = response.headers.get('x-hs-pid');
        if (updated) document.cookie = `userUP=${updated}${keep}`;
        if (profileId) document.cookie = `userPID=${profileId}${keep}`;
        return {
          status: response.status,
          body: await response.text(),
          profileId,
        };
      },
      {
        url: BFF + path,
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
        headers,
      },
    );
    if (answer.status === 401 || answer.status === 403)
      this.headers = undefined;
    if (answer.status < 200 || answer.status >= 300) {
      throw new SiteRequestError(
        SITE + BFF + path.replace(/\?.*/, ''),
        answer.status,
      );
    }
    return answer;
  }

  private parse<Schema extends z.ZodType>(
    path: string,
    body: string,
    schema: Schema,
  ): z.infer<Schema> {
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      throw new SiteResponseError(
        SITE + BFF + path.replace(/\?.*/, ''),
        'not JSON',
      );
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new SiteResponseError(
        SITE + BFF + path.replace(/\?.*/, ''),
        parsed.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; '),
      );
    }
    return parsed.data;
  }

  /** Loads a page by its browser path, the way the site's app does. */
  async start(deeplink: string): Promise<StartPage> {
    const answer = await this.raw('/v2/start', 'POST', {
      deeplink_url: deeplink,
      app_launch_count: 1,
    });
    return this.parse('/v2/start', answer.body, StartSchema).success.page;
  }

  async space(path: string) {
    const answer = await this.raw(path, 'GET');
    return this.parse(path, answer.body, SpaceSchema).success.space;
  }

  async items(path: string) {
    const answer = await this.raw(path, 'GET');
    return this.parse(path, answer.body, ItemsPageSchema).success.widget_wrapper
      .widget.data;
  }

  /** Answers with the profile id the server switched to. */
  async switchProfile(path: string, profileId: string): Promise<string | null> {
    const answer = await this.raw(path, 'POST', {
      body: {
        '@type': 'type.googleapis.com/feature.login.SelectProfileRequest',
        profile_id: profileId,
      },
    });
    return answer.profileId;
  }

  async currentProfileId(): Promise<string | undefined> {
    const page = await this.page();
    return page.evaluate(
      () => /(?:^|; )userPID=([^;]+)/.exec(document.cookie)?.[1],
    );
  }
}
