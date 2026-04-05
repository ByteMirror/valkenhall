export const DEFAULT_UPSCAYL_RELEASE_VERSION = '2.15.0';

export const RELEASE_TARGETS = [
  {
    id: 'darwin-arm64',
    runner: 'macos-14',
    platform: 'darwin',
    arch: 'arm64',
    archiveExt: 'tar.gz',
    binaryUrlEnv: 'UPSCAYL_BIN_URL_DARWIN_ARM64',
    upscaylBinaryRelativePath: 'server/upscaling/bin/darwin-arm64/upscayl-bin',
    officialArchiveSuffix: 'mac',
    officialArchiveMemberPath: 'Upscayl.app/Contents/Resources/bin/upscayl-bin',
  },
  {
    id: 'linux-x64',
    runner: 'ubuntu-latest',
    platform: 'linux',
    arch: 'x64',
    archiveExt: 'tar.gz',
    binaryUrlEnv: 'UPSCAYL_BIN_URL_LINUX_X64',
    upscaylBinaryRelativePath: 'server/upscaling/bin/linux-x64/upscayl-bin',
    officialArchiveSuffix: 'linux',
    officialArchiveMemberPath: 'resources/bin/upscayl-bin',
  },
  {
    id: 'win32-x64',
    runner: 'windows-latest',
    platform: 'win32',
    arch: 'x64',
    archiveExt: 'zip',
    binaryUrlEnv: 'UPSCAYL_BIN_URL_WIN32_X64',
    upscaylBinaryRelativePath: 'server/upscaling/bin/win32-x64/upscayl-bin.exe',
    officialArchiveSuffix: 'win',
    officialArchiveMemberPath: 'resources/bin/upscayl-bin.exe',
  },
];

export function getReleaseTarget(targetId) {
  const target = RELEASE_TARGETS.find((entry) => entry.id === targetId);

  if (!target) {
    throw new Error(`Unknown release target: ${targetId}`);
  }

  return target;
}

export function getUpscaylBinaryRelativePath(targetId) {
  return getReleaseTarget(targetId).upscaylBinaryRelativePath;
}

export function getBinaryDownloadEnvName(targetId) {
  return getReleaseTarget(targetId).binaryUrlEnv;
}

export function getOfficialUpscaylArchiveSpec(targetId, version = DEFAULT_UPSCAYL_RELEASE_VERSION) {
  const target = getReleaseTarget(targetId);
  const normalizedVersion = String(version || DEFAULT_UPSCAYL_RELEASE_VERSION).replace(/^v/i, '');

  return {
    downloadUrl: `https://github.com/upscayl/upscayl/releases/download/v${normalizedVersion}/upscayl-${normalizedVersion}-${target.officialArchiveSuffix}.zip`,
    archiveMemberPath: target.officialArchiveMemberPath,
  };
}

export function getRuntimeReleaseTargetId({ platform = process.platform, arch = process.arch } = {}) {
  return RELEASE_TARGETS.find((target) => target.platform === platform && target.arch === arch)?.id || null;
}

export function getReleaseArchiveFileName({ version, targetId, appName = 'fab-builder' }) {
  const target = getReleaseTarget(targetId);
  const safeVersion = String(version || 'dev').replace(/^refs\/tags\//, '').replace(/[^\w.-]+/g, '-');
  return `${appName}-${safeVersion}-${target.id}.${target.archiveExt}`;
}
