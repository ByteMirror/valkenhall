import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  DEFAULT_UPSCAYL_RELEASE_VERSION,
  getBinaryDownloadEnvName,
  getOfficialUpscaylArchiveSpec,
  getReleaseTarget,
  getUpscaylBinaryRelativePath,
} from './release-targets.js';

const targetId = process.argv[2];

if (!targetId) {
  console.error('Usage: bun scripts/prepare-release-assets.js <target-id>');
  process.exit(1);
}

const target = getReleaseTarget(targetId);
const targetBinaryPath = path.resolve(getUpscaylBinaryRelativePath(targetId));
const legacyBinaryPath = path.resolve('server/upscaling/upscayl-bin');
const binaryUrlEnvName = getBinaryDownloadEnvName(targetId);
const binaryUrl = process.env[binaryUrlEnvName];
const upscaylReleaseVersion = process.env.UPSCAYL_RELEASE_VERSION || DEFAULT_UPSCAYL_RELEASE_VERSION;

async function pathExists(filePath) {
  try {
    await fs.access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureExecutableIfNeeded(filePath) {
  if (target.platform !== 'win32') {
    await fs.chmod(filePath, 0o755);
  }
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? 1}. ${stderr || stdout}`.trim()));
    });
  });
}

async function downloadFile(url, outPath) {
  const response = await fetch(url, { redirect: 'follow' });

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(outPath, buffer);
}

async function extractZipMember({ archivePath, archiveMemberPath, outPath }) {
  const pythonScript = [
    'import pathlib',
    'import sys',
    'import zipfile',
    'archive_path, member_path, out_path = sys.argv[1:4]',
    'data = zipfile.ZipFile(archive_path).read(member_path)',
    'path = pathlib.Path(out_path)',
    'path.parent.mkdir(parents=True, exist_ok=True)',
    'path.write_bytes(data)',
  ].join('; ');

  await runCommand('python3', ['-c', pythonScript, archivePath, archiveMemberPath, outPath]);
}

if (await pathExists(targetBinaryPath)) {
  await ensureExecutableIfNeeded(targetBinaryPath);
  console.log(`Release binary already present for ${targetId}: ${path.relative(process.cwd(), targetBinaryPath)}`);
  process.exit(0);
}

await fs.mkdir(path.dirname(targetBinaryPath), { recursive: true });

if (targetId === 'linux-x64' && (await pathExists(legacyBinaryPath))) {
  await fs.copyFile(legacyBinaryPath, targetBinaryPath);
  await ensureExecutableIfNeeded(targetBinaryPath);
  console.log(`Copied legacy linux upscayl binary into ${path.relative(process.cwd(), targetBinaryPath)}`);
  process.exit(0);
}

if (binaryUrl) {
  await downloadFile(binaryUrl, targetBinaryPath);
  await ensureExecutableIfNeeded(targetBinaryPath);
  console.log(`Downloaded ${targetId} upscayl binary into ${path.relative(process.cwd(), targetBinaryPath)}`);
  process.exit(0);
}

const archiveSpec = getOfficialUpscaylArchiveSpec(targetId, upscaylReleaseVersion);
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `fab-builder-upscayl-${targetId}-`));
const tempArchivePath = path.join(tempDir, path.basename(new URL(archiveSpec.downloadUrl).pathname));

try {
  await downloadFile(archiveSpec.downloadUrl, tempArchivePath);
  await extractZipMember({
    archivePath: tempArchivePath,
    archiveMemberPath: archiveSpec.archiveMemberPath,
    outPath: targetBinaryPath,
  });
  await ensureExecutableIfNeeded(targetBinaryPath);
  console.log(
    `Downloaded and extracted ${targetId} upscayl binary from Upscayl ${upscaylReleaseVersion} into ${path.relative(process.cwd(), targetBinaryPath)}`
  );
} catch (error) {
  console.error(
    `Missing release binary for ${targetId}. Tried ${path.relative(process.cwd(), targetBinaryPath)}, ${binaryUrlEnvName}, and ${archiveSpec.downloadUrl}.`
  );
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
