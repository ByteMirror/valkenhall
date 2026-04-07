import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function getPlatformName(platform) {
  switch (platform) {
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'win';
    default:
      return platform;
  }
}

export function getLaunchSpec({ platform, bundlePath, executablePath }) {
  if (platform === 'darwin') {
    return {
      command: 'open',
      args: ['-W', '-n', bundlePath],
      cwd: undefined,
    };
  }

  return {
    command: executablePath,
    args: [],
    cwd: path.dirname(executablePath),
  };
}

async function loadConfig(projectRoot) {
  const configUrl = pathToFileURL(path.join(projectRoot, 'electrobun.config.ts')).href;
  const imported = await import(configUrl);
  return imported.default;
}

function getDevBundlePaths(projectRoot, config) {
  const buildFolder = config.build?.buildFolder ?? 'build';
  const platformName = getPlatformName(process.platform);
  const buildSubFolder = `dev-${platformName}-${process.arch}`;
  const appBaseName = `${config.app.name}-dev`;
  const bundlePath =
    process.platform === 'darwin'
      ? path.join(projectRoot, buildFolder, buildSubFolder, `${appBaseName}.app`)
      : path.join(projectRoot, buildFolder, buildSubFolder, appBaseName);
  const executablePath =
    process.platform === 'darwin'
      ? path.join(bundlePath, 'Contents', 'MacOS', 'launcher')
      : process.platform === 'win32'
        ? path.join(bundlePath, 'bin', 'launcher.exe')
        : path.join(bundlePath, 'bin', 'launcher');

  return { bundlePath, executablePath };
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...options,
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 1}`));
    });

    child.on('error', reject);
  });
}

export function getElectrobunBuildSpec(projectRoot) {
  return {
    command: process.execPath,
    args: [
      path.join(projectRoot, 'node_modules', 'electrobun', 'bin', 'electrobun.cjs'),
      'build',
      '--env=dev',
    ],
  };
}

export function shouldIgnoreWatchPath(changedPath) {
  return (
    changedPath.includes(`${path.sep}build${path.sep}`) ||
    changedPath.includes(`${path.sep}node_modules${path.sep}`) ||
    changedPath.includes(`${path.sep}assets${path.sep}app-icons${path.sep}icon.iconset${path.sep}`) ||
    changedPath.includes(`${path.sep}public${path.sep}app-icon`)
  );
}

async function buildDevBundle(projectRoot) {
  await runCommand(process.execPath, ['run', 'icons:generate'], { cwd: projectRoot });
  const buildSpec = getElectrobunBuildSpec(projectRoot);

  await runCommand(buildSpec.command, buildSpec.args, {
    cwd: projectRoot,
    env: {
      ...process.env,
      ELECTROBUN_BUILD_ENV: 'dev',
    },
  });
}

function quitMacApp(bundleIdentifier, executablePath) {
  if (bundleIdentifier) {
    spawnSync('osascript', ['-e', `tell application id "${bundleIdentifier}" to quit`], {
      stdio: 'ignore',
    });
  }

  spawnSync('pkill', ['-f', executablePath], {
    stdio: 'ignore',
  });
}

function createAppHandle(config, projectRoot) {
  const { bundlePath, executablePath } = getDevBundlePaths(projectRoot, config);
  const launchSpec = getLaunchSpec({
    platform: process.platform,
    bundlePath,
    executablePath,
  });

  if (!fs.existsSync(process.platform === 'darwin' ? bundlePath : executablePath)) {
    throw new Error(`Dev app bundle not found at ${bundlePath}`);
  }

  const child = spawn(launchSpec.command, launchSpec.args, {
    cwd: launchSpec.cwd,
    stdio: 'inherit',
  });

  const exited = new Promise((resolve) => {
    child.on('exit', (code) => resolve(code ?? 0));
  });

  return {
    kill() {
      if (process.platform === 'darwin') {
        quitMacApp(config.app.identifier, executablePath);
        return;
      }

      child.kill();
    },
    exited,
  };
}

async function main() {
  const projectRoot = process.cwd();
  const config = await loadConfig(projectRoot);

  let appHandle = null;
  let isBuilding = false;
  let rebuildPending = false;
  let shuttingDown = false;
  let debounceTimer = null;

  const watchTargets = [
    {
      targetPath: projectRoot,
      recursive: false,
      accepts: (relativePath) => relativePath === 'electrobun.config.ts',
    },
    {
      targetPath: path.join(projectRoot, 'src', 'bun'),
      recursive: true,
      accepts: () => true,
    },
    {
      targetPath: path.join(projectRoot, 'assets', 'app-icons', 'source'),
      recursive: true,
      accepts: () => true,
    },
    {
      targetPath: path.join(projectRoot, 'scripts'),
      recursive: false,
      accepts: (relativePath) => relativePath === 'app-icons.js',
    },
  ].filter(({ targetPath }) => fs.existsSync(targetPath));

  async function rebuild(reason = 'initial build') {
    if (shuttingDown) {
      return;
    }

    if (isBuilding) {
      rebuildPending = true;
      return;
    }

    isBuilding = true;
    rebuildPending = false;

    if (appHandle) {
      appHandle.kill();
      await appHandle.exited.catch(() => {});
      appHandle = null;
    }

    console.log(`[desktop-dev] Rebuilding (${reason})...`);

    try {
      await buildDevBundle(projectRoot);
      console.log('[desktop-dev] Launching dev app...');
      appHandle = createAppHandle(config, projectRoot);
    } catch (error) {
      console.error('[desktop-dev] Build failed:', error);
    } finally {
      isBuilding = false;
    }

    if (rebuildPending && !shuttingDown) {
      await rebuild('pending change');
    }
  }

  function scheduleRebuild(reason) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(() => {
      rebuild(reason);
    }, 250);
  }

  const watchers = watchTargets.map(({ targetPath, recursive, accepts }) =>
    fs.watch(targetPath, { recursive }, (_eventType, filename) => {
      const relativePath = filename ? filename.toString() : '';
      if (relativePath && !accepts(relativePath)) {
        return;
      }

      const changedPath = relativePath ? path.join(targetPath, relativePath) : targetPath;

      if (shouldIgnoreWatchPath(changedPath)) {
        return;
      }

      scheduleRebuild(path.relative(projectRoot, changedPath));
    }),
  );

  process.on('SIGINT', async () => {
    if (shuttingDown) {
      process.exit(1);
    }

    shuttingDown = true;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    for (const watcher of watchers) {
      watcher.close();
    }

    if (appHandle) {
      appHandle.kill();
      await appHandle.exited.catch(() => {});
    }

    process.exit(0);
  });

  await rebuild();
  await new Promise(() => {});
}

if (import.meta.main) {
  await main();
}
