import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import {
  getCardSetDownloadPaths,
  getCardSetDownloadStatuses,
  resetCardSetDownloadState,
  startCardSetDownload,
  waitForAllCardSetDownloads,
} from './cardSetDownloads.js';

const createdDirs = [];

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fab-builder-card-set-downloads-'));
  createdDirs.push(dir);
  return dir;
}

async function writeCardsJson(cards) {
  const dir = await makeTempDir();
  const cardsJsonPath = path.join(dir, 'cards.json');
  await fs.writeFile(cardsJsonPath, JSON.stringify(cards, null, 2), 'utf8');
  return { dir, cardsJsonPath };
}

async function waitFor(assertion, { timeoutMs = 1500, intervalMs = 25 } = {}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await assertion();
      return;
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  await assertion();
}

afterEach(async () => {
  await waitForAllCardSetDownloads();
  resetCardSetDownloadState();
  await Promise.all(createdDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('card set downloads', () => {
  it('reports idle per-set download status from the cards manifest before any files exist', async () => {
    const baseDir = await makeTempDir();
    const { cardsJsonPath } = await writeCardsJson([
      {
        unique_id: 'card-arc',
        name: 'Arcane Shockwave',
        printings: [
          { unique_id: 'printing-arc-1', set_id: 'ARC', image_url: 'https://example.com/arc-1.png' },
          { unique_id: 'printing-arc-2', set_id: 'ARC', image_url: 'https://example.com/arc-2.png' },
        ],
      },
      {
        unique_id: 'card-wtr',
        name: 'Welcome to Rathe Card',
        printings: [{ unique_id: 'printing-wtr-1', set_id: 'WTR', image_url: 'https://example.com/wtr-1.png' }],
      },
    ]);

    const statuses = await getCardSetDownloadStatuses({
      baseDir,
      cardsJsonPath,
      setIds: ['ARC', 'WTR'],
    });

    expect(statuses).toEqual({
      ARC: { state: 'idle', total: 2, completed: 0, downloaded: false, error: '' },
      WTR: { state: 'idle', total: 1, completed: 0, downloaded: false, error: '' },
    });
  });

  it('downloads a full set in the background and persists the completed status on disk', async () => {
    const baseDir = await makeTempDir();
    const { cardsJsonPath } = await writeCardsJson([
      {
        unique_id: 'card-arc',
        name: 'Arcane Shockwave',
        printings: [
          { unique_id: 'printing-arc-1', set_id: 'ARC', image_url: 'https://example.com/arc-1.png' },
          { unique_id: 'printing-arc-2', set_id: 'ARC', image_url: 'https://example.com/arc-2.png' },
        ],
      },
    ]);

    const fetchImpl = async (url) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return new Response(`downloaded:${url}`, {
        status: 200,
        headers: { 'content-type': 'image/png' },
      });
    };

    const initialStatus = await startCardSetDownload({
      baseDir,
      cardsJsonPath,
      setId: 'ARC',
      fetchImpl,
    });

    expect(initialStatus).toEqual({
      state: 'downloading',
      total: 2,
      completed: 0,
      downloaded: false,
      error: '',
    });

    await waitFor(async () => {
      const statuses = await getCardSetDownloadStatuses({
        baseDir,
        cardsJsonPath,
        setIds: ['ARC'],
      });

      expect(statuses.ARC).toEqual({
        state: 'downloaded',
        total: 2,
        completed: 2,
        downloaded: true,
        error: '',
      });
    });

    const paths = getCardSetDownloadPaths({ baseDir });
    const downloadedFiles = await fs.readdir(path.join(paths.cardSetsDir, 'ARC'));

    expect(downloadedFiles.sort()).toEqual(['printing-arc-1.png', 'printing-arc-2.png']);
  });
});
