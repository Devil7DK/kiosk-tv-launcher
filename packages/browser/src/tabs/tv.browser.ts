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
  /**
   * Catches `keys` in the player tab before the site sees them, on every page
   * it loads. Leaving full screen is reported as the key `FullscreenExit`,
   * because Brave handles Escape itself while a page is full screen.
   */
  capturePlayerKeys(
    keys: string[],
    handler: (key: string) => void,
  ): Promise<void>;
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

const KEY_BINDING = '__kioskTvKey';

/** Runs inside the page, so it may only use what the page has. */
function installKeyCapture({
  binding,
  keys,
}: {
  binding: string;
  keys: string[];
}) {
  const w = window as unknown as Record<string, unknown>;
  if (w.__kioskTvKeysInstalled) return;
  w.__kioskTvKeysInstalled = true;
  const report = (key: string) => (w[binding] as (key: string) => void)(key);
  window.addEventListener(
    'keydown',
    (event) => {
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      report(event.key);
    },
    true,
  );
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) report('FullscreenExit');
  });
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

  const player = () => tab('player', async () => {});

  return {
    async launcher(url) {
      const page = await tab('launcher', async (p) => {
        await p.goto(url);
      });
      if (!page.url().startsWith(url)) await page.goto(url);
      return page;
    },
    player,
    background(providerId, origin) {
      return tab(`background:${providerId}`, async (p) => {
        await p.goto(origin, { waitUntil: 'domcontentloaded' });
      });
    },
    async capturePlayerKeys(keys, handler) {
      const page = await player();
      await page.exposeBinding(KEY_BINDING, (_source, key: string) =>
        handler(key),
      );
      await page.addInitScript(installKeyCapture, {
        binding: KEY_BINDING,
        keys,
      });
      await page
        .evaluate(installKeyCapture, { binding: KEY_BINDING, keys })
        .catch(() => {});
    },
    async show(page) {
      await page.bringToFront();
    },
    async disconnect() {
      await browser.close();
    },
  };
}
