import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

interface Manifest {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

/** Where Node would find package `name` when imported from `dir`. */
async function locate(name: string, dir: string): Promise<string | undefined> {
  for (let at = dir; ; at = dirname(at)) {
    const candidate = join(at, 'node_modules', name);
    try {
      await access(join(candidate, 'package.json'));
      return candidate;
    } catch {
      if (dirname(at) === at) return undefined;
    }
  }
}

/** The folders of `names` and of everything they depend on, as installed under `from`. */
export async function runtimePackages(
  from: string,
  names: readonly string[],
): Promise<string[]> {
  const found = new Set<string>();
  const visit = async (name: string, dir: string, optional: boolean) => {
    const folder = await locate(name, dir);
    if (!folder) {
      if (optional) return;
      throw new Error(`${name} is not installed; run yarn install`);
    }
    if (found.has(folder)) return;
    found.add(folder);
    const manifest = JSON.parse(
      await readFile(join(folder, 'package.json'), 'utf8'),
    ) as Manifest;
    for (const dep of Object.keys(manifest.dependencies ?? {})) {
      await visit(dep, folder, false);
    }
    for (const dep of Object.keys(manifest.optionalDependencies ?? {})) {
      await visit(dep, folder, true);
    }
  };
  for (const name of names) await visit(name, from, false);
  return [...found].sort();
}
