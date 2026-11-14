import { describe, expect, it } from 'vitest';

import {
  controlFile,
  debianVersion,
  isShipped,
  releaseVersion,
} from '../src/control.file.ts';

describe('debianVersion', () => {
  const committedAt = new Date('2026-11-14T08:30:15Z');

  it('names the build by its last release, its commit date and short sha', () => {
    expect(debianVersion({ base: '1.2.0', committedAt, sha: '85a5308' })).toBe(
      '1.2.0-20261114-85a5308',
    );
  });

  it('sorts a build with uncommitted changes just below its commit', () => {
    expect(
      debianVersion({
        base: '0.1.154',
        committedAt,
        sha: '85a5308',
        uncommittedAt: new Date('2026-11-14T09:00:00.500Z'),
      }),
    ).toBe('0.1.154-20261114-85a5308~dirty20261114090000');
  });
});

describe('releaseVersion', () => {
  it('takes a release version from its tag', () => {
    expect(releaseVersion('v1.2.0')).toBe('1.2.0');
    expect(releaseVersion('1.2.0')).toBe('1.2.0');
  });

  it('sorts a pre-release before the release it leads to', () => {
    expect(releaseVersion('v1.2.0-rc1')).toBe('1.2.0~rc1');
  });

  it('refuses a tag that is not a version', () => {
    expect(() => releaseVersion('latest')).toThrow(/not a release tag/);
  });
});

describe('controlFile', () => {
  it('ends with a newline, as dpkg requires of the last field', () => {
    const text = controlFile({
      version: '0.1.1',
      maintainer: 'TV <tv@example.org>',
      installedKiB: 10,
    });
    expect(text).toMatch(/^Package: kiosk-tv\n/);
    expect(text.endsWith('\n')).toBe(true);
  });
});

describe('isShipped', () => {
  it('keeps only the native build for this laptop', () => {
    expect(isShipped('prebuilds/linux-x64/node.napi.glibc.node')).toBe(true);
    expect(isShipped('prebuilds/win32-x64/node.napi.node')).toBe(false);
    expect(isShipped('prebuilds/darwin-x64+arm64/node.napi.node')).toBe(false);
  });

  it('leaves out type declarations and source maps', () => {
    expect(isShipped('dist/index.d.ts')).toBe(false);
    expect(isShipped('dist/index.js.map')).toBe(false);
    expect(isShipped('dist/index.js')).toBe(true);
  });
});
