import {
  type Browser,
  type BrowserContext,
  chromium,
  type Page,
} from 'playwright-core';

import {
  type BraveOptions,
  cdpUrl,
  ensureBrave,
} from '../brave/brave.launcher.js';

/**
 * The one Brave window on the TV. Tabs are found again by role after a
 * controller restart, because Brave keeps running.
 */
export interface TvBrowser {
  /** The tab with the launcher UI. */
  launcher(url: string): Promise<Page>;
  /** The tab videos play in. */
  player(): Promise<Page>;
  /** A tab kept on a provider's site so its API calls carry the site's cookies. */
  background(providerId: string, origin: string): Promise<Page>;
  /** Puts a tab in front of the viewer. */
  show(page: Page): Promise<void>;
  /** Disconnects; Brave keeps running. */
  disconnect(): Promise<void>;
}

const ROLE_KEY = '__kioskTvRole';

async function roleOf(page: Page): Promise<string | undefined> {
  try {
    return await page.evaluate(
      (key) =>
        window.name.startsWith(key) ? window.name.slice(key.length) : undefined,
      ROLE_KEY,
    );
  } catch {
    return undefined;
  }
}

async function markRole(page: Page, role: string): Promise<void> {
  // window.name survives navigation within the tab, unlike anything on the page.
  await page.evaluate(
    ([key, value]) => {
      window.name = key + value;
    },
    [ROLE_KEY, role] as const,
  );
}

export async function connectTvBrowser(
  options: BraveOptions,
): Promise<TvBrowser> {
  await ensureBrave(options);
  const browser: Browser = await chromium.connectOverCDP(cdpUrl(options.port));
  const context: BrowserContext | undefined = browser.contexts()[0];
  if (!context) throw new Error('Brave has no browser context to attach to');

  const tabs = new Map<string, Promise<Page>>();

  async function find(role: string): Promise<Page | undefined> {
    for (const page of context!.pages()) {
      if (!page.isClosed() && (await roleOf(page)) === role) return page;
    }
    return undefined;
  }

  function tab(
    role: string,
    open: (page: Page) => Promise<void>,
  ): Promise<Page> {
    const known = tabs.get(role);
    const reuse = known?.then((page) => (page.isClosed() ? undefined : page));
    const next = (async () => {
      const existing = (await reuse) ?? (await find(role));
      if (existing) return existing;
      const page = await context!.newPage();
      await open(page);
      await markRole(page, role);
      return page;
    })();
    tabs.set(role, next);
    next.catch(() => tabs.delete(role));
    return next;
  }

  return {
    async launcher(url) {
      const page = await tab('launcher', async (p) => {
        await p.goto(url);
      });
      if (!page.url().startsWith(url)) await page.goto(url);
      return page;
    },
    player() {
      return tab('player', async () => {});
    },
    background(providerId, origin) {
      return tab(`background:${providerId}`, async (p) => {
        await p.goto(origin, { waitUntil: 'domcontentloaded' });
      });
    },
    async show(page) {
      await page.bringToFront();
    },
    async disconnect() {
      await browser.close();
    },
  };
}
