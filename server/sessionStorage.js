import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const APP_STORAGE_DIR_NAME = 'fab-builder';
const SESSIONS_DIR_NAME = 'sessions';
const INDEX_FILE_NAME = 'sessions-index.json';

function defaultBaseDirForPlatform(platform = process.platform, homeDir = os.homedir()) {
  if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', APP_STORAGE_DIR_NAME);
  }
  if (platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), APP_STORAGE_DIR_NAME);
  }
  return path.join(process.env.XDG_DATA_HOME || path.join(homeDir, '.local', 'share'), APP_STORAGE_DIR_NAME);
}

function getSessionPaths({ baseDir = process.env.FAB_BUILDER_DATA_DIR || defaultBaseDirForPlatform() } = {}) {
  return {
    baseDir,
    sessionsDir: path.join(baseDir, SESSIONS_DIR_NAME),
    indexPath: path.join(baseDir, SESSIONS_DIR_NAME, INDEX_FILE_NAME),
  };
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  const tempPath = `${filePath}.tmp-${crypto.randomBytes(6).toString('hex')}`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tempPath, filePath);
}

function createSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function listSessions({ baseDir } = {}) {
  const paths = getSessionPaths({ baseDir });
  await ensureDir(paths.sessionsDir);
  const index = await readJson(paths.indexPath, []);
  return (Array.isArray(index) ? index : [])
    .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')));
}

export async function saveSession({ baseDir, session } = {}) {
  if (!session?.name?.trim()) {
    throw new Error('Session name is required');
  }

  const paths = getSessionPaths({ baseDir });
  await ensureDir(paths.sessionsDir);

  const index = await readJson(paths.indexPath, []);
  const existing = index.find((e) => e.id === session.id);
  const sessionId = existing?.id || session.id || createSessionId();
  const savedAt = new Date().toISOString();

  const sessionRecord = {
    id: sessionId,
    name: session.name.trim(),
    savedAt,
    tableCards: session.tableCards || [],
    piles: session.piles || [],
    handCards: session.handCards || [],
    spawnConfig: session.spawnConfig || {},
    tokens: session.tokens || [],
    dice: session.dice || [],
    trackers: session.trackers || undefined,
  };

  await writeJsonAtomic(path.join(paths.sessionsDir, `${sessionId}.json`), sessionRecord);

  const summary = {
    id: sessionId,
    name: sessionRecord.name,
    savedAt,
    cardCount: (sessionRecord.tableCards?.length || 0) + (sessionRecord.handCards?.length || 0),
  };

  const filteredIndex = index.filter((e) => e.id !== sessionId);
  await writeJsonAtomic(paths.indexPath, [summary, ...filteredIndex]);

  return summary;
}

export async function loadSession({ baseDir, sessionId } = {}) {
  if (!sessionId) throw new Error('Missing session ID');
  const paths = getSessionPaths({ baseDir });
  return readJson(path.join(paths.sessionsDir, `${sessionId}.json`), null);
}

export async function deleteSession({ baseDir, sessionId } = {}) {
  if (!sessionId) throw new Error('Missing session ID');
  const paths = getSessionPaths({ baseDir });
  const index = await readJson(paths.indexPath, []);
  await fs.rm(path.join(paths.sessionsDir, `${sessionId}.json`), { force: true }).catch(() => {});
  await writeJsonAtomic(paths.indexPath, index.filter((e) => e.id !== sessionId));
}
