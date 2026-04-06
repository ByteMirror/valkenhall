import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'bun:test';
import { deleteDeck, getDeckStoragePaths, listDecks, loadDeck, saveDeck } from './deckStorage.js';

const createdDirs = [];

function makeSvgDataUrl(label, fill) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="240" height="336" viewBox="0 0 240 336">
      <rect width="240" height="336" rx="24" fill="${fill}" />
      <text x="28" y="180" fill="white" font-size="32" font-family="Arial">${label}</text>
    </svg>
  `;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fab-builder-deck-storage-'));
  createdDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(createdDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('deck storage', () => {
  it('persists decks as files and generates a composite webp preview', async () => {
    const baseDir = await makeTempDir();

    const summary = await saveDeck({
      baseDir,
      deck: {
        name: 'Bravo Deck',
        format: 'classic-constructed',
        cards: [
          { cardId: 'hero', cardName: 'Bravo, Showstopper', printingId: 'hero-printing' },
          { cardId: 'crush', cardName: 'Crippling Crush', printingId: 'crush-printing', isSideboard: true },
        ],
        previewCards: [
          { name: 'Bravo, Showstopper', imageUrl: makeSvgDataUrl('Hero', '#1d4ed8') },
          { name: 'Crippling Crush', imageUrl: makeSvgDataUrl('Crush', '#b91c1c') },
        ],
      },
      previewBaseUrl: 'http://127.0.0.1:3001',
    });

    const paths = getDeckStoragePaths({ baseDir });
    const storedDeck = await loadDeck({ baseDir, deckId: summary.id });
    const listedDecks = await listDecks({ baseDir, previewBaseUrl: 'http://127.0.0.1:3001' });
    const previewPath = path.join(paths.previewsDir, `${summary.id}.webp`);
    const previewStat = await fs.stat(previewPath);
    const previewMetadata = await sharp(previewPath).metadata();
    const previewPixels = await sharp(previewPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const index = JSON.parse(await fs.readFile(paths.indexPath, 'utf8'));

    expect(summary.name).toBe('Bravo Deck');
    expect(summary.format).toBe('classic-constructed');
    expect(summary.cardCount).toBe(2);
    expect(summary.previewUrl).toMatch(
      new RegExp(`^http://127.0.0.1:3001/api/decks/${summary.id}/preview\\?v=`)
    );
    expect(storedDeck.cards).toEqual([
      { cardId: 'hero', cardName: 'Bravo, Showstopper', printingId: 'hero-printing', isSideboard: false },
      { cardId: 'crush', cardName: 'Crippling Crush', printingId: 'crush-printing', isSideboard: true },
    ]);
    expect(storedDeck.format).toBe('classic-constructed');
    expect(storedDeck.previewCards).toHaveLength(2);
    expect(listedDecks).toEqual([summary]);
    expect(previewStat.size).toBeGreaterThan(0);
    expect(previewMetadata.width).toBe(712);
    expect(previewMetadata.height).toBe(256);
    expect(previewPixels.data[((Math.floor(previewPixels.info.height / 2) * previewPixels.info.width + (previewPixels.info.width - 2)) * 4) + 3]).toBeGreaterThan(0);
    expect(index).toHaveLength(1);
    expect(index[0].id).toBe(summary.id);
  });

  it('deletes deck files and removes deck summaries from the index', async () => {
    const baseDir = await makeTempDir();

    const summary = await saveDeck({
      baseDir,
      deck: {
        name: 'Oldhim Deck',
        cards: [{ cardId: 'hero', cardName: 'Oldhim', printingId: 'hero-printing' }],
        previewCards: [{ name: 'Oldhim', imageUrl: makeSvgDataUrl('Oldhim', '#0369a1') }],
      },
      previewBaseUrl: 'http://127.0.0.1:3001',
    });

    const paths = getDeckStoragePaths({ baseDir });

    await deleteDeck({ baseDir, deckId: summary.id });

    const listedDecks = await listDecks({ baseDir, previewBaseUrl: 'http://127.0.0.1:3001' });
    const index = JSON.parse(await fs.readFile(paths.indexPath, 'utf8'));

    await expect(fs.stat(path.join(paths.decksDir, `${summary.id}.json`))).rejects.toThrow();
    await expect(fs.stat(path.join(paths.previewsDir, `${summary.id}.webp`))).rejects.toThrow();
    expect(listedDecks).toEqual([]);
    expect(index).toEqual([]);
  });

  it('upgrades stale preview files to the current preview format when listing decks', async () => {
    const baseDir = await makeTempDir();
    const paths = getDeckStoragePaths({ baseDir });
    const deckId = 'deck-old-preview';
    const savedAt = '2026-03-08T10:00:00.000Z';

    await fs.mkdir(paths.decksDir, { recursive: true });
    await fs.mkdir(paths.previewsDir, { recursive: true });

    await fs.writeFile(
      path.join(paths.decksDir, `${deckId}.json`),
      JSON.stringify(
        {
          id: deckId,
          name: 'Oldhim Deck',
          savedAt,
          cards: [{ cardId: 'hero', cardName: 'Oldhim', printingId: 'hero-printing' }],
          previewCards: [{ name: 'Oldhim', imageUrl: makeSvgDataUrl('Oldhim', '#0369a1') }],
          previewVersion: savedAt,
        },
        null,
        2
      ),
      'utf8'
    );
    await fs.writeFile(
      paths.indexPath,
      JSON.stringify(
        [
          {
            id: deckId,
            name: 'Oldhim Deck',
            savedAt,
            cardCount: 1,
            previewVersion: savedAt,
          },
        ],
        null,
        2
      ),
      'utf8'
    );
    await sharp({
      create: {
        width: 356,
        height: 128,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .webp()
      .toFile(path.join(paths.previewsDir, `${deckId}.webp`));

    const listedDecks = await listDecks({ baseDir, previewBaseUrl: 'http://127.0.0.1:3001' });
    const previewMetadata = await sharp(path.join(paths.previewsDir, `${deckId}.webp`)).metadata();
    const index = JSON.parse(await fs.readFile(paths.indexPath, 'utf8'));
    const storedDeck = await loadDeck({ baseDir, deckId });

    expect(listedDecks).toHaveLength(1);
    expect(listedDecks[0].previewUrl).toBe(
      'http://127.0.0.1:3001/api/decks/deck-old-preview/preview?v=v4-2026-03-08T10%3A00%3A00.000Z&game=fab'
    );
    expect(previewMetadata.width).toBe(712);
    expect(previewMetadata.height).toBe(256);
    expect(index[0].previewVersion).toBe('v4-2026-03-08T10:00:00.000Z');
    expect(storedDeck.previewVersion).toBe('v4-2026-03-08T10:00:00.000Z');
  });

});
