import {
  capabilitiesOf,
  type Provider,
  type ProviderModule,
  type ProviderPages,
} from '@kiosk-tv/provider-kit';
import type {
  ProviderInfo,
  ProviderManifest,
  ProviderStatus,
} from '@kiosk-tv/shared';

import type { Logger } from '../logging/logger.js';

export type ProviderLoader = (id: string) => Promise<ProviderModule<unknown>>;

export const importProvider: ProviderLoader = async (id) => {
  const module = (await import(`@kiosk-tv/provider-${id}`)) as {
    default: ProviderModule<unknown>;
  };
  return module.default;
};

interface Entry {
  manifest: ProviderManifest;
  provider?: Provider;
  status: ProviderStatus;
}

/** Whether a provider in this state can still be asked for its catalog. */
export function isUsable(status: ProviderStatus): boolean {
  return status.state !== 'loggedOut' && status.state !== 'failed';
}

export class ProviderRegistry {
  private constructor(
    private readonly entries: Map<string, Entry>,
    private readonly log: Logger,
  ) {}

  /** A provider that fails to load or start is kept as `failed`; the rest carry on. */
  static async start(
    configs: Record<string, unknown>,
    options: {
      load?: ProviderLoader;
      pagesFor: (manifest: ProviderManifest) => ProviderPages;
      log: Logger;
    },
  ): Promise<ProviderRegistry> {
    const load = options.load ?? importProvider;
    const entries = new Map<string, Entry>();
    for (const [id, rawConfig] of Object.entries(configs)) {
      const log = options.log.child(id);
      let module: ProviderModule<unknown>;
      try {
        module = await load(id);
      } catch (error) {
        log.error('provider package could not be loaded', {
          error: String(error),
        });
        entries.set(id, {
          manifest: {
            id,
            name: id,
            color: '#444444',
            origins: ['https://invalid.invalid'],
          },
          status: { state: 'failed', reason: 'not installed' },
        });
        continue;
      }
      const entry: Entry = {
        manifest: module.manifest,
        status: { state: 'failed', reason: 'not started' },
      };
      entries.set(id, entry);
      const config = module.configSchema.safeParse(rawConfig ?? {});
      if (!config.success) {
        entry.status = { state: 'failed', reason: 'invalid settings' };
        log.error('provider settings are invalid', {
          issues: config.error.issues.map(
            (i) => `${i.path.join('.')}: ${i.message}`,
          ),
        });
        continue;
      }
      try {
        entry.provider = await module.create({
          config: config.data,
          pages: options.pagesFor(module.manifest),
          log,
        });
      } catch (error) {
        entry.status = { state: 'failed', reason: String(error) };
        log.error('provider did not start', { error: String(error) });
      }
    }
    const registry = new ProviderRegistry(entries, options.log);
    await registry.refreshStatus();
    return registry;
  }

  async refreshStatus(): Promise<void> {
    await Promise.all(
      [...this.entries.values()].map(async (entry) => {
        if (!entry.provider) return;
        try {
          entry.status = await entry.provider.status();
        } catch (error) {
          entry.status = { state: 'failed', reason: String(error) };
        }
        this.log.info('provider status', {
          provider: entry.manifest.id,
          state: entry.status.state,
        });
      }),
    );
  }

  list(): ProviderInfo[] {
    return [...this.entries.values()].map((entry) => ({
      manifest: entry.manifest,
      status: entry.status,
      capabilities: entry.provider ? capabilitiesOf(entry.provider) : [],
    }));
  }

  /** The provider, if it is running and its account can be used. */
  get(id: string): Provider | undefined {
    const entry = this.entries.get(id);
    return entry?.provider && isUsable(entry.status)
      ? entry.provider
      : undefined;
  }

  manifest(id: string): ProviderManifest | undefined {
    return this.entries.get(id)?.manifest;
  }

  usable(): { manifest: ProviderManifest; provider: Provider }[] {
    return [...this.entries.values()].flatMap((entry) =>
      entry.provider && isUsable(entry.status)
        ? [{ manifest: entry.manifest, provider: entry.provider }]
        : [],
    );
  }

  /** Whether `url` is on one of the provider's own sites. */
  owns(id: string, url: string): boolean {
    const origins = this.entries.get(id)?.manifest.origins ?? [];
    try {
      const origin = new URL(url).origin;
      return origins.some((o) => new URL(o).origin === origin);
    } catch {
      return false;
    }
  }

  async dispose(): Promise<void> {
    await Promise.all(
      [...this.entries.values()].map((e) =>
        e.provider?.dispose?.().catch(() => {}),
      ),
    );
  }
}
