import { SiteRequestError, SiteResponseError } from '@kiosk-tv/provider-kit';
import type { Page } from 'playwright-core';
import type { z } from 'zod';

import { type ZeeProfile } from './zee5.schemas.js';

export const SITE = 'https://www.zee5.com';
const GRAPHQL = 'https://artemis.zee5.com/artemis/route/web_app/IN/';
const PROFILES = 'https://profiles.zee5.com/v3/profiles';

function parse<Schema extends z.ZodType>(
  url: string,
  text: string,
  schema: Schema,
): z.infer<Schema> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new SiteResponseError(url, 'not JSON');
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new SiteResponseError(
      url,
      parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
    );
  }
  return parsed.data;
}

/** Calls ZEE5 from inside a zee5.com page, with the login the page keeps. */
export class Zee5Api {
  constructor(private readonly page: () => Promise<Page>) {}

  private async call(
    url: string,
    init: { method: 'GET' | 'POST'; body?: string },
  ) {
    const page = await this.page();
    const answer = await page.evaluate(
      async ({ url, init }) => {
        const cookie = (name: string) =>
          new RegExp(`(?:^|; )${name}=([^;]+)`).exec(document.cookie)?.[1] ??
          '';
        const headers: Record<string, string> = {
          authorization: `bearer ${localStorage.getItem('token') ?? cookie('token')}`,
          'x-access-token': cookie('xaccesstoken'),
          'profile-id': cookie('profile-id'),
          'content-type': 'application/json',
        };
        const response = await fetch(url, { ...init, headers });
        return { status: response.status, text: await response.text() };
      },
      { url, init },
    );
    if (answer.status < 200 || answer.status >= 300) {
      throw new SiteRequestError(url, answer.status);
    }
    return answer.text;
  }

  async query<Schema extends z.ZodType>(
    operation: string,
    query: string,
    variables: Record<string, unknown>,
    schema: Schema,
  ): Promise<z.infer<Schema>> {
    const url = GRAPHQL + operation;
    const text = await this.call(url, {
      method: 'POST',
      body: JSON.stringify({
        query,
        variables: { country: 'IN', translation: 'en', ...variables },
      }),
    });
    return parse(url, text, schema);
  }

  async profiles<Schema extends z.ZodType>(
    schema: Schema,
  ): Promise<z.infer<Schema>> {
    return parse(
      PROFILES,
      await this.call(PROFILES, { method: 'GET' }),
      schema,
    );
  }

  /** The data a server-rendered page was built from, without opening the page. */
  async pageData<Schema extends z.ZodType>(
    path: string,
    schema: Schema,
  ): Promise<z.infer<Schema>> {
    const page = await this.page();
    const url = SITE + path;
    const answer = await page.evaluate(async (url) => {
      const response = await fetch(url);
      const html = await response.text();
      const data =
        /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(
          html,
        );
      return { status: response.status, text: data?.[1] ?? '' };
    }, url);
    if (answer.status !== 200) throw new SiteRequestError(url, answer.status);
    return parse(url, answer.text, schema);
  }

  async login(): Promise<{
    signedIn: boolean;
    expiresAt?: number;
    profileId?: string;
  }> {
    const page = await this.page();
    return page.evaluate(() => {
      const expires = Number(localStorage.getItem('EXPIRES_IN'));
      const profileId = /(?:^|; )profile-id=([^;]+)/.exec(document.cookie)?.[1];
      return {
        signedIn: Boolean(localStorage.getItem('token')),
        ...(expires > 0 ? { expiresAt: expires } : {}),
        ...(profileId ? { profileId } : {}),
      };
    });
  }

  /**
   * The viewer profile lives only in the browser: a cookie for the API and a
   * localStorage copy for the site's own pages. No server call switches it.
   */
  async useProfile(profile: ZeeProfile): Promise<void> {
    const page = await this.page();
    await page.evaluate((profile) => {
      const keep = '; path=/; max-age=31536000; secure; samesite=lax';
      document.cookie = `profile-id=${profile.id}${keep}`;
      if (profile.contentLanguages?.length) {
        document.cookie = `content-language=${profile.contentLanguages.join(',')}${keep}`;
      }
      localStorage.setItem('userCurrentProfile', JSON.stringify(profile));
    }, profile);
  }
}
