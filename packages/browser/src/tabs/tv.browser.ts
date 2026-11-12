import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

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

/** The one Brave window on the TV, with a tab for each role. */
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

/**
 * Which tab plays which role, by DevTools target id, kept in a file because
 * Brave outlives the controller. A page's own state cannot hold it: Brave
 * clears `window.name` when a tab moves to another site.
 */
class TabRoles {
  constructor(private readonly file: string) {}

  async read(): Promise<Record<string, string>> {
    try {
      return JSON.parse(await readFile(this.file, 'utf8')) as Record<
        string,
        string
      >;
    } catch {
      return {};
    }
  }

  async set(role: string, targetId: string): Promise<void> {
    const roles = { ...(await this.read()), [role]: targetId };
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(roles, null, 2) + '\n');
  }
}

async function targetIdOf(
  context: BrowserContext,
  page: Page,
): Promise<string> {
  const session = await context.newCDPSession(page);
  try {
    const { targetInfo } = (await session.send('Target.getTargetInfo')) as {
      targetInfo: { targetId: string };
    };
    return targetInfo.targetId;
  } finally {
    await session.detach().catch(() => {});
  }
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
  options: BraveOptions & {
    /** Where the tab roles are kept; defaults to a file beside the profile. */
    rolesFile?: string;
  },
): Promise<TvBrowser> {
  await ensureBrave(options);
  const browser: Browser = await chromium.connectOverCDP(cdpUrl(options.port));
  const context: BrowserContext | undefined = browser.contexts()[0];
  if (!context) throw new Error('Brave has no browser context to attach to');

  const tabs = new Map<string, Promise<Page>>();
  const roles = new TabRoles(
    options.rolesFile ?? join(dirname(options.profileDir), 'tab-roles.json'),
  );

  async function find(role: string): Promise<Page | undefined> {
    const targetId = (await roles.read())[role];
    if (!targetId) return undefined;
    for (const page of context!.pages()) {
      if (page.isClosed()) continue;
      if (
        (await targetIdOf(context!, page).catch(() => undefined)) === targetId
      ) {
        return page;
      }
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
      await roles.set(role, await targetIdOf(context!, page));
      await open(page);
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
