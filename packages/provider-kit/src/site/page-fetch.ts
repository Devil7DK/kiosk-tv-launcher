import type { Page } from 'playwright-core';
import type { z } from 'zod';

export class SiteRequestError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`${new URL(url).pathname} answered ${status}`);
    this.name = 'SiteRequestError';
  }
}

export class SiteResponseError extends Error {
  constructor(
    readonly url: string,
    readonly issues: string,
  ) {
    super(`${new URL(url).pathname} returned an unexpected shape: ${issues}`);
    this.name = 'SiteResponseError';
  }
}

export interface PageFetchInit {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
}

/** Fetches from inside a page of the site and returns the body as text. */
export async function fetchText(
  page: Page,
  url: string,
  init: PageFetchInit = {},
): Promise<string> {
  const response = await page.evaluate(
    async ({ url, init }) => {
      const res = await fetch(url, { credentials: 'include', ...init });
      const text = await res.text();
      return { status: res.status, text };
    },
    { url, init },
  );
  if (response.status < 200 || response.status >= 300) {
    throw new SiteRequestError(url, response.status);
  }
  return response.text;
}

/**
 * Fetches from inside a page of the site, so the site's own cookies and origin
 * apply, and parses the JSON with `schema`. The response body never leaves this
 * function unparsed, so it cannot end up in a log.
 */
export async function fetchJson<Schema extends z.ZodType>(
  page: Page,
  url: string,
  schema: Schema,
  init: PageFetchInit = {},
): Promise<z.infer<Schema>> {
  const text = await fetchText(page, url, init);
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
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; '),
    );
  }
  return parsed.data;
}
