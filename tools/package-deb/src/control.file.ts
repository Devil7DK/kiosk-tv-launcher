/**
 * The package version: one step per commit, so every build installs over the
 * one before. A build with uncommitted changes sorts below its commit (`~`),
 * and is told apart from other such builds by when it was made.
 */
export function debianVersion(commits: number, uncommittedAt?: Date): string {
  const base = `0.1.${commits}`;
  if (!uncommittedAt) return base;
  const stamp = uncommittedAt
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..*$/, '');
  return `${base}~dirty${stamp}`;
}

export interface Control {
  version: string;
  maintainer: string;
  installedKiB: number;
}

export function controlFile({
  version,
  maintainer,
  installedKiB,
}: Control): string {
  return [
    'Package: kiosk-tv',
    `Version: ${version}`,
    // serialport ships its native part built for x86-64 only.
    'Architecture: amd64',
    `Maintainer: ${maintainer}`,
    `Installed-Size: ${installedKiB}`,
    'Depends: nodejs (>= 24), udev',
    'Recommends: brave-browser, cage, xwayland, pipewire, wireplumber',
    'Section: video',
    'Priority: optional',
    'Description: TV launcher for streaming services, driven by a remote',
    ' Lists shows from JioHotstar, Sun NXT, ZEE5 and YouTube and plays them',
    ' full screen in Brave, for a viewer with only arrow keys, OK and Back.',
    '',
  ].join('\n');
}

/** Whether a file of a copied runtime package is needed on the TV. */
export function isShipped(path: string): boolean {
  if (/\.(map|d\.ts|d\.mts|d\.cts)$/.test(path)) return false;
  const prebuild = /(?:^|\/)prebuilds\/([^/]+)/.exec(path);
  return !prebuild || prebuild[1] === 'linux-x64';
}
