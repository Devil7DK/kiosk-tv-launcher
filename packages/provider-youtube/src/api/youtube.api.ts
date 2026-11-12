import { SiteRequestError, SiteResponseError } from '@kiosk-tv/provider-kit';
import type { Page } from 'playwright-core';

export const SITE = 'https://www.youtube.com';

export interface Browse {
  browseId?: string;
  params?: string;
  continuation?: string;
}

/**
 * Calls YouTube's own API (InnerTube) from inside a youtube.com page. Signed-in
 * calls need a SAPISIDHASH header; without it YouTube answers 200 but signed
 * out, with empty feeds and no error to notice.
 */
export class YouTubeApi {
  constructor(private readonly page: () => Promise<Page>) {}

  async signedIn(): Promise<boolean> {
    const page = await this.page();
    return page.evaluate(() =>
      /(?:^|; )(?:SAPISID|__Secure-3PAPISID)=/.test(document.cookie),
    );
  }

  async browse(request: Browse): Promise<unknown> {
    const page = await this.page();
    const url = `${SITE}/youtubei/v1/browse?prettyPrint=false`;
    const answer = await page.evaluate(
      async ({ url, request }) => {
        const sapisid =
          /(?:^|; )(?:SAPISID|__Secure-3PAPISID)=([^;]+)/.exec(
            document.cookie,
          )?.[1] ?? '';
        const time = Math.floor(Date.now() / 1000);
        const origin = location.origin;
        const digest = await crypto.subtle.digest(
          'SHA-1',
          new TextEncoder().encode(`${time} ${sapisid} ${origin}`),
        );
        const hash = [...new Uint8Array(digest)]
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        const config = (
          window as unknown as { ytcfg?: { get(key: string): unknown } }
        ).ytcfg;
        const response = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'content-type': 'application/json',
            authorization: `SAPISIDHASH ${time}_${hash}`,
            'x-origin': origin,
            'x-goog-authuser': '0',
          },
          body: JSON.stringify({
            context: config?.get('INNERTUBE_CONTEXT'),
            ...request,
          }),
        });
        return { status: response.status, text: await response.text() };
      },
      { url, request },
    );
    if (answer.status !== 200) throw new SiteRequestError(url, answer.status);
    try {
      return JSON.parse(answer.text) as unknown;
    } catch {
      throw new SiteResponseError(url, 'not JSON');
    }
  }
}
