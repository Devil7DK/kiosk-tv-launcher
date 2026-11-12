import { describe, expect, it } from 'vitest';

import { controlFile, debianVersion, isShipped } from '../src/control.file.ts';

describe('debianVersion', () => {
  it('grows by one with each commit', () => {
    expect(debianVersion(88)).toBe('0.1.88');
  });

  it('sorts a build with uncommitted changes below its commit', () => {
    expect(debianVersion(88, new Date('2026-11-12T21:30:05.123Z'))).toBe(
      '0.1.88~dirty20261112T213005',
    );
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
