/** UTC, to the second, as digits only: 20261114083015. */
function stamp(time: Date): string {
  return time.toISOString().replace(/[-:T]/g, '').replace(/\..*$/, '');
}

/**
 * A build's version: `<last release>-<commit date>-<short sha>`, the release
 * being `0.1.<commits>` before the first. A build with uncommitted changes
 * sorts just below its commit.
 */
export function debianVersion(build: {
  base: string;
  committedAt: Date;
  sha: string;
  uncommittedAt?: Date | undefined;
}): string {
  const version = `${build.base}-${stamp(build.committedAt).slice(0, 8)}-${build.sha}`;
  return build.uncommittedAt
    ? `${version}~dirty${stamp(build.uncommittedAt)}`
    : version;
}

const RELEASE_TAG = /^v?(\d+\.\d+\.\d+)(?:-([0-9A-Za-z.]+))?$/;

/**
 * A release's version from its tag: v1.2.0 is 1.2.0. A pre-release, v1.2.0-rc1,
 * becomes 1.2.0~rc1, which Debian sorts before 1.2.0 itself.
 */
export function releaseVersion(tag: string): string {
  const match = RELEASE_TAG.exec(tag);
  if (!match) {
    throw new Error(`${tag} is not a release tag like v1.2.0 or v1.2.0-rc1`);
  }
  return match[2] ? `${match[1]}~${match[2]}` : match[1]!;
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
    'Recommends: brave-browser, cage, xwayland, pipewire, wireplumber, unattended-upgrades, bluez, libspa-0.2-bluetooth',
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
