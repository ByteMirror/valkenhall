import { describe, expect, it } from 'bun:test';
import {
  getReleaseArchiveFileName,
  getReleaseTarget,
  getRuntimeReleaseTargetId,
  RELEASE_TARGETS,
} from './release-targets.js';

describe('release targets', () => {
  it('defines the supported GitHub release targets', () => {
    expect(RELEASE_TARGETS.map((target) => target.id)).toEqual(['darwin-arm64', 'linux-x64', 'win32-x64']);
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
