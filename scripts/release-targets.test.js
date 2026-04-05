import { describe, expect, it } from 'bun:test';
import {
  getBinaryDownloadEnvName,
  getOfficialUpscaylArchiveSpec,
  getReleaseArchiveFileName,
  getReleaseTarget,
  getRuntimeReleaseTargetId,
  getUpscaylBinaryRelativePath,
  RELEASE_TARGETS,
} from './release-targets.js';

describe('release targets', () => {
  it('defines the supported GitHub release targets', () => {
    expect(RELEASE_TARGETS.map((target) => target.id)).toEqual(['darwin-arm64', 'linux-x64', 'win32-x64']);
  });

  it('maps each release target to the correct bundled upscaling binary path', () => {
    expect(getUpscaylBinaryRelativePath('darwin-arm64')).toBe('server/upscaling/bin/darwin-arm64/upscayl-bin');
    expect(getUpscaylBinaryRelativePath('linux-x64')).toBe('server/upscaling/bin/linux-x64/upscayl-bin');
    expect(getUpscaylBinaryRelativePath('win32-x64')).toBe('server/upscaling/bin/win32-x64/upscayl-bin.exe');
  });

  it('defines a download environment variable per target for CI bootstrap', () => {
    expect(getBinaryDownloadEnvName('darwin-arm64')).toBe('UPSCAYL_BIN_URL_DARWIN_ARM64');
    expect(getBinaryDownloadEnvName('linux-x64')).toBe('UPSCAYL_BIN_URL_LINUX_X64');
    expect(getBinaryDownloadEnvName('win32-x64')).toBe('UPSCAYL_BIN_URL_WIN32_X64');
  });

  it('maps each target to the correct official Upscayl archive member for binary extraction', () => {
    expect(getOfficialUpscaylArchiveSpec('darwin-arm64', '2.15.0')).toEqual({
      downloadUrl: 'https://github.com/upscayl/upscayl/releases/download/v2.15.0/upscayl-2.15.0-mac.zip',
      archiveMemberPath: 'Upscayl.app/Contents/Resources/bin/upscayl-bin',
    });
    expect(getOfficialUpscaylArchiveSpec('linux-x64', '2.15.0')).toEqual({
      downloadUrl: 'https://github.com/upscayl/upscayl/releases/download/v2.15.0/upscayl-2.15.0-linux.zip',
      archiveMemberPath: 'resources/bin/upscayl-bin',
    });
    expect(getOfficialUpscaylArchiveSpec('win32-x64', '2.15.0')).toEqual({
      downloadUrl: 'https://github.com/upscayl/upscayl/releases/download/v2.15.0/upscayl-2.15.0-win.zip',
      archiveMemberPath: 'resources/bin/upscayl-bin.exe',
    });
  });

  it('maps the current runtime platform and architecture to a supported release target', () => {
    expect(getRuntimeReleaseTargetId({ platform: 'darwin', arch: 'arm64' })).toBe('darwin-arm64');
    expect(getRuntimeReleaseTargetId({ platform: 'linux', arch: 'x64' })).toBe('linux-x64');
    expect(getRuntimeReleaseTargetId({ platform: 'win32', arch: 'x64' })).toBe('win32-x64');
    expect(getRuntimeReleaseTargetId({ platform: 'darwin', arch: 'x64' })).toBeNull();
  });

  it('builds release archive names per platform convention', () => {
    expect(getReleaseArchiveFileName({ version: 'v1.2.3', targetId: 'darwin-arm64' })).toBe('fab-builder-v1.2.3-darwin-arm64.tar.gz');
    expect(getReleaseArchiveFileName({ version: 'v1.2.3', targetId: 'linux-x64' })).toBe('fab-builder-v1.2.3-linux-x64.tar.gz');
    expect(getReleaseArchiveFileName({ version: 'v1.2.3', targetId: 'win32-x64' })).toBe('fab-builder-v1.2.3-win32-x64.zip');
  });

  it('rejects unknown release targets', () => {
    expect(() => getReleaseTarget('plan9-x64')).toThrow('Unknown release target');
  });
});
