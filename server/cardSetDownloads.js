import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getDeckStoragePaths } from './deckStorage.js';

const CARD_SETS_DIR_NAME = 'card-sets';
const CARD_SET_DOWNLOAD_CONCURRENCY = 6;

const manifestCache = new Map();
const activeDownloads = new Map();

function normalizeSetId(setId) {
  return String(setId || '').trim().toUpperCase();
}

function createStatus({ state = 'idle', total = 0, completed = 0, downloaded = false, error = '' } = {}) {
  return {
    state,
    total,
    completed,
    downloaded,
    error,
  };
}

function getManifestCacheKey(cardsJsonPath) {
  return path.resolve(String(cardsJsonPath || ''));
}

function getJobKey({ baseDir, cardsJsonPath, setId }) {
  return [
    path.resolve(getDeckStoragePaths({ baseDir }).baseDir),
    getManifestCacheKey(cardsJsonPath),
    normalizeSetId(setId),
  ].join('::');
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

function resolveDownloadFileExtension(imageUrl) {
  try {
    const extension = path.extname(new URL(imageUrl).pathname || '').toLowerCase();
    return extension && extension.length <= 8 ? extension : '';
  } catch {
    return '';
  }
}

function createDownloadFileName(printing) {
  const identifier = String(
    printing?.unique_id || printing?.set_printing_unique_id || printing?.id || hashValue(printing?.image_url)
  )
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-');
  const extension = resolveDownloadFileExtension(printing?.image_url) || '.png';
  return `${identifier}${extension}`;
}

async function writeBufferAtomic(filePath, buffer) {
  const tempPath = `${filePath}.tmp-${crypto.randomBytes(6).toString('hex')}`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tempPath, buffer);
  await fs.rename(tempPath, filePath);
}

async function readSetDirectoryFileNames(setDir) {
  try {
    const entries = await fs.readdir(setDir, { withFileTypes: true });
    return new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return new Set();
    }

    throw error;
  }
}

async function loadCardSetManifest(cardsJsonPath) {
  const cacheKey = getManifestCacheKey(cardsJsonPath);

  if (!manifestCache.has(cacheKey)) {
    const manifestPromise = fs
      .readFile(cacheKey, 'utf8')
      .then((raw) => JSON.parse(raw))
      .then((cards) => buildCardSetManifest(cards))
      .catch((error) => {
        manifestCache.delete(cacheKey);
        throw error;
      });

    manifestCache.set(cacheKey, manifestPromise);
  }

  return manifestCache.get(cacheKey);
}

async function getCardSetEntries({ cardsJsonPath, setId }) {
  const manifest = await loadCardSetManifest(cardsJsonPath);
  return manifest[normalizeSetId(setId)] || [];
}

async function getPersistedCompletionCount({ baseDir, cardsJsonPath, setId }) {
  const normalizedSetId = normalizeSetId(setId);
  const entries = await getCardSetEntries({ cardsJsonPath, setId: normalizedSetId });
  const paths = getCardSetDownloadPaths({ baseDir });
  const storedFiles = await readSetDirectoryFileNames(path.join(paths.cardSetsDir, normalizedSetId));
  const completed = entries.reduce((count, entry) => count + (storedFiles.has(entry.fileName) ? 1 : 0), 0);

  return {
    total: entries.length,
    completed,
  };
}

async function downloadPrintingImage(entry, destinationPath, fetchImpl) {
  const response = await fetchImpl(entry.imageUrl, { redirect: 'follow' });

  if (!response?.ok) {
    throw new Error(`Failed to download ${entry.imageUrl} (${response?.status || 0} ${response?.statusText || 'Error'})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeBufferAtomic(destinationPath, buffer);
}

async function runWithConcurrency(items, concurrency, worker) {
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        if (currentIndex >= items.length) {
          return;
        }

        await worker(items[currentIndex], currentIndex);
      }
    })
  );
}

async function downloadCardSetEntries({ baseDir, cardsJsonPath, setId, fetchImpl, job }) {
  const normalizedSetId = normalizeSetId(setId);
  const entries = await getCardSetEntries({ cardsJsonPath, setId: normalizedSetId });
  const paths = getCardSetDownloadPaths({ baseDir });
  const setDir = path.join(paths.cardSetsDir, normalizedSetId);
  const existingFiles = await readSetDirectoryFileNames(setDir);
  const pendingEntries = entries.filter((entry) => !existingFiles.has(entry.fileName));

  if (pendingEntries.length === 0) {
    job.completed = entries.length;
    return;
  }

  await fs.mkdir(setDir, { recursive: true });

  await runWithConcurrency(pendingEntries, CARD_SET_DOWNLOAD_CONCURRENCY, async (entry) => {
    await downloadPrintingImage(entry, path.join(setDir, entry.fileName), fetchImpl);
    job.completed += 1;
  });
}

export function getCardSetDownloadPaths({ baseDir } = {}) {
  const storageBaseDir = getDeckStoragePaths({ baseDir }).baseDir;

  return {
    baseDir: storageBaseDir,
    cardSetsDir: path.join(storageBaseDir, CARD_SETS_DIR_NAME),
  };
}

export function buildCardSetManifest(cards) {
  const entriesBySet = new Map();
  const seenFilesBySet = new Map();

  for (const card of Array.isArray(cards) ? cards : []) {
    for (const printing of Array.isArray(card?.printings) ? card.printings : []) {
      const setId = normalizeSetId(printing?.set_id);
      const imageUrl = String(printing?.image_url || '').trim();

      if (!setId || !imageUrl) {
        continue;
      }

      const fileName = createDownloadFileName(printing);
      const seenFiles = seenFilesBySet.get(setId) || new Set();

      if (seenFiles.has(fileName)) {
        continue;
      }

      seenFiles.add(fileName);
      seenFilesBySet.set(setId, seenFiles);

      const currentEntries = entriesBySet.get(setId) || [];
      currentEntries.push({
        fileName,
        imageUrl,
      });
      entriesBySet.set(setId, currentEntries);
    }
  }

  return Object.fromEntries(entriesBySet);
}

export async function getCardSetDownloadStatuses({ baseDir, cardsJsonPath, setIds = [] } = {}) {
  const statuses = {};

  for (const setId of Array.isArray(setIds) ? setIds : []) {
    const normalizedSetId = normalizeSetId(setId);

    if (!normalizedSetId) {
      continue;
    }

    const { total, completed } = await getPersistedCompletionCount({
      baseDir,
      cardsJsonPath,
      setId: normalizedSetId,
    });
    const isDownloaded = total > 0 && completed >= total;
    const activeJob = activeDownloads.get(getJobKey({ baseDir, cardsJsonPath, setId: normalizedSetId }));

    if (isDownloaded) {
      statuses[normalizedSetId] = createStatus({
        state: 'downloaded',
        total,
        completed,
        downloaded: true,
      });
      continue;
    }

    if (activeJob?.state === 'downloading') {
      statuses[normalizedSetId] = createStatus({
        state: 'downloading',
        total,
        completed: Math.max(completed, activeJob.completed),
        downloaded: false,
      });
      continue;
    }

    if (activeJob?.state === 'error') {
      statuses[normalizedSetId] = createStatus({
        state: 'error',
        total,
        completed,
        downloaded: false,
        error: activeJob.error || `Failed to download ${normalizedSetId}`,
      });
      continue;
    }

    statuses[normalizedSetId] = createStatus({
      state: 'idle',
      total,
      completed,
      downloaded: false,
    });
  }

  return statuses;
}

export async function startCardSetDownload({
  baseDir,
  cardsJsonPath,
  setId,
  fetchImpl = globalThis.fetch,
} = {}) {
  const normalizedSetId = normalizeSetId(setId);

  if (!normalizedSetId) {
    throw new Error('Missing set ID');
  }

  const { total, completed } = await getPersistedCompletionCount({
    baseDir,
    cardsJsonPath,
    setId: normalizedSetId,
  });

  if (total === 0) {
    const error = new Error(`Unknown card set ${normalizedSetId}`);
    error.code = 'CARD_SET_NOT_FOUND';
    throw error;
  }

  if (completed >= total) {
    return createStatus({
      state: 'downloaded',
      total,
      completed,
      downloaded: true,
    });
  }

  const jobKey = getJobKey({ baseDir, cardsJsonPath, setId: normalizedSetId });
  const existingJob = activeDownloads.get(jobKey);

  if (existingJob?.state === 'downloading') {
    return createStatus({
      state: 'downloading',
      total,
      completed: Math.max(completed, existingJob.completed),
      downloaded: false,
    });
  }

  const nextJob = {
    state: 'downloading',
    total,
    completed,
    downloaded: false,
    error: '',
    promise: null,
  };

  activeDownloads.set(jobKey, nextJob);
  nextJob.promise = downloadCardSetEntries({
    baseDir,
    cardsJsonPath,
    setId: normalizedSetId,
    fetchImpl,
    job: nextJob,
  })
    .then(() => {
      nextJob.state = 'downloaded';
      nextJob.completed = total;
      nextJob.downloaded = true;
      nextJob.error = '';
    })
    .catch((error) => {
      nextJob.state = 'error';
      nextJob.downloaded = false;
      nextJob.error = error?.message || `Failed to download ${normalizedSetId}`;
    })
    .finally(() => {
      if (nextJob.state === 'downloaded') {
        activeDownloads.delete(jobKey);
      }
    });

  return createStatus(nextJob);
}

export async function waitForAllCardSetDownloads() {
  await Promise.allSettled(
    Array.from(activeDownloads.values())
      .map((job) => job?.promise)
      .filter(Boolean)
  );
}

export function resetCardSetDownloadState() {
  manifestCache.clear();
  activeDownloads.clear();
}
