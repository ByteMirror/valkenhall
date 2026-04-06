export const RELEASE_TARGETS = [
  {
    id: 'darwin-arm64',
    runner: 'macos-14',
    platform: 'darwin',
    arch: 'arm64',
    archiveExt: 'tar.gz',
  },
  {
    id: 'linux-x64',
    runner: 'ubuntu-latest',
    platform: 'linux',
    arch: 'x64',
    archiveExt: 'tar.gz',
  },
  {
    id: 'win32-x64',
    runner: 'windows-latest',
    platform: 'win32',
    arch: 'x64',
    archiveExt: 'zip',
  },
];

export function getReleaseTarget(targetId) {
  const target = RELEASE_TARGETS.find((entry) => entry.id === targetId);

  if (!target) {
    throw new Error(`Unknown release target: ${targetId}`);
  }

  return target;
}

export function getRuntimeReleaseTargetId({ platform = process.platform, arch = process.arch } = {}) {
  return RELEASE_TARGETS.find((target) => target.platform === platform && target.arch === arch)?.id || null;
}

export function getReleaseArchiveFileName({ version, targetId, appName = 'fab-builder' }) {
  const target = getReleaseTarget(targetId);
  const safeVersion = String(version || 'dev').replace(/^refs\/tags\//, '').replace(/[^\w.-]+/g, '-');
  return `${appName}-${safeVersion}-${target.id}.${target.archiveExt}`;
}
