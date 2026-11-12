// Builds dist/kiosk-tv_<version>_amd64.deb from the built workspaces.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'rolldown';

import { controlFile, debianVersion, isShipped } from './control.file.ts';
import { runtimePackages } from './runtime.deps.ts';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const tool = fileURLToPath(new URL('../', import.meta.url));
const out = join(tool, 'dist');
const root = join(out, 'root');
const control = join(out, 'control');
const lib = join(root, 'usr/lib/kiosk-tv');

// Native code, or files read at runtime next to the code: copied, not bundled.
const COPIED = ['serialport', 'playwright-core'];

function git(...args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
  }).trim();
}

async function providerIds(): Promise<string[]> {
  const manifest = JSON.parse(
    await readFile(join(repo, 'apps/controller/package.json'), 'utf8'),
  ) as { dependencies: Record<string, string> };
  return Object.keys(manifest.dependencies)
    .map((name) => /^@kiosk-tv\/provider-(.+)$/.exec(name)?.[1])
    .filter((id): id is string => id !== undefined && id !== 'kit');
}

async function bundle(ids: string[]): Promise<void> {
  await build({
    input: {
      main: join(repo, 'apps/controller/dist/main.js'),
      ...Object.fromEntries(
        ids.map((id) => [
          `provider-${id}`,
          join(repo, `packages/provider-${id}/dist/index.js`),
        ]),
      ),
    },
    platform: 'node',
    external: (id) =>
      COPIED.some((name) => id === name || id.startsWith(`${name}/`)),
    logLevel: 'warn',
    output: {
      // The controller finds the launcher at ../../launcher/dist from here.
      dir: join(lib, 'apps/controller/dist'),
      format: 'esm',
      entryFileNames: '[name].js',
      chunkFileNames: 'chunks/[name]-[hash].js',
    },
  });
  // The registry imports each provider by package name.
  for (const id of ids) {
    const folder = join(lib, `node_modules/@kiosk-tv/provider-${id}`);
    await mkdir(folder, { recursive: true });
    await writeFile(
      join(folder, 'package.json'),
      JSON.stringify({
        name: `@kiosk-tv/provider-${id}`,
        type: 'module',
        exports: './index.js',
      }),
    );
    await writeFile(
      join(folder, 'index.js'),
      `export { default } from '../../../apps/controller/dist/provider-${id}.js';\n`,
    );
  }
}

async function copyRuntimePackages(): Promise<void> {
  for (const folder of await runtimePackages(repo, COPIED)) {
    await cp(folder, join(lib, relative(repo, folder)), {
      recursive: true,
      filter: (source) => isShipped(relative(folder, source)),
    });
  }
}

async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name))
    .sort();
}

async function writeControl(version: string): Promise<void> {
  await mkdir(control, { recursive: true });
  const shipped = await files(root);
  let bytes = 0;
  const sums: string[] = [];
  for (const file of shipped) {
    const content = await readFile(file);
    bytes += content.length;
    sums.push(
      `${createHash('md5').update(content).digest('hex')}  ${relative(root, file)}`,
    );
  }
  const maintainer = `${git('config', 'user.name')} <${git('config', 'user.email')}>`;
  await writeFile(
    join(control, 'control'),
    controlFile({ version, maintainer, installedKiB: Math.ceil(bytes / 1024) }),
  );
  await writeFile(join(control, 'md5sums'), `${sums.join('\n')}\n`);
  // Kept as edited when the package is upgraded.
  await writeFile(
    join(control, 'conffiles'),
    '/etc/kiosk-tv/tv.json\n/etc/brave/policies/managed/kiosk-tv.json\n',
  );
}

async function archive(version: string): Promise<string> {
  const mtime = `@${git('log', '-1', '--format=%ct')}`;
  const tar = (name: string, from: string) =>
    execFileSync('tar', [
      '--create',
      '--xz',
      '--file',
      join(out, name),
      '--directory',
      from,
      '--owner=0',
      '--group=0',
      '--numeric-owner',
      '--sort=name',
      `--mtime=${mtime}`,
      '--mode=u+rw,go+r,go-w',
      '.',
    ]);
  await writeFile(join(out, 'debian-binary'), '2.0\n');
  tar('control.tar.xz', control);
  tar('data.tar.xz', root);
  const deb = join(out, `kiosk-tv_${version}_amd64.deb`);
  // dpkg reads the members in this order.
  execFileSync(
    'ar',
    ['rcD', deb, 'debian-binary', 'control.tar.xz', 'data.tar.xz'],
    { cwd: out },
  );
  return deb;
}

await rm(out, { recursive: true, force: true });
const ids = await providerIds();
await bundle(ids);
await copyRuntimePackages();
await cp(join(repo, 'apps/launcher/dist'), join(lib, 'apps/launcher/dist'), {
  recursive: true,
});
await mkdir(join(root, 'etc/kiosk-tv'), { recursive: true });
await copyFile(
  join(repo, 'config/tv.example.json'),
  join(root, 'etc/kiosk-tv/tv.json'),
);
await mkdir(join(root, 'etc/brave/policies/managed'), { recursive: true });
await copyFile(
  join(tool, 'files/brave-policy.json'),
  join(root, 'etc/brave/policies/managed/kiosk-tv.json'),
);
await mkdir(join(root, 'usr/share/polkit-1/rules.d'), { recursive: true });
await copyFile(
  join(tool, 'files/kiosk-tv.rules'),
  join(root, 'usr/share/polkit-1/rules.d/50-kiosk-tv.rules'),
);
await mkdir(join(root, 'usr/lib/systemd/user'), { recursive: true });
await copyFile(
  join(tool, 'files/kiosk-tv.service'),
  join(root, 'usr/lib/systemd/user/kiosk-tv.service'),
);
await mkdir(join(root, 'usr/bin'), { recursive: true });
await copyFile(
  join(tool, 'files/kiosk-tv-session'),
  join(root, 'usr/bin/kiosk-tv-session'),
);
await chmod(join(root, 'usr/bin/kiosk-tv-session'), 0o755);

const dirty = git('status', '--porcelain') !== '';
const version = debianVersion(
  Number(git('rev-list', '--count', 'HEAD')),
  dirty ? new Date() : undefined,
);
await writeControl(version);
const deb = await archive(version);
console.log(
  `${relative(repo, deb)} (${((await stat(deb)).size / 1e6).toFixed(1)} MB, providers: ${ids.join(', ')})`,
);
