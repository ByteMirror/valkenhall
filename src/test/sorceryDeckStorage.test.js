import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getDeckStoragePaths, listDecks, migrateToGameSubdirectories, saveDeck } from '../../server/deckStorage.js';

async function makeTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'fab-builder-test-'));
}

const MINIMAL_CARD = { cardId: 'card-1', cardName: 'Test Card', printingId: 'print-1' };

describe('getDeckStoragePaths', () => {
  it('defaults to fab subdirectory', () => {
    const paths = getDeckStoragePaths({ baseDir: '/tmp/test' });
    expect(paths.decksDir).toBe('/tmp/test/decks/fab');
    expect(paths.previewsDir).toBe('/tmp/test/previews/fab');
    expect(paths.game).toBe('fab');
  });

  it('returns sorcery subdirectory for game=sorcery', () => {
    const paths = getDeckStoragePaths({ baseDir: '/tmp/test', game: 'sorcery' });
    expect(paths.decksDir).toBe('/tmp/test/decks/sorcery');
    expect(paths.previewsDir).toBe('/tmp/test/previews/sorcery');
    expect(paths.game).toBe('sorcery');
  });

  it('falls back to fab for unknown game values', () => {
    const paths = getDeckStoragePaths({ baseDir: '/tmp/test', game: 'unknown-game' });
    expect(paths.game).toBe('fab');
    expect(paths.decksDir).toBe('/tmp/test/decks/fab');
  });

  it('normalizes game name to lowercase', () => {
    const paths = getDeckStoragePaths({ baseDir: '/tmp/test', game: 'FAB' });
    expect(paths.game).toBe('fab');
  });

  it('keeps indexPath at root (not game-specific)', () => {
    const fabPaths = getDeckStoragePaths({ baseDir: '/tmp/test', game: 'fab' });
    const sorceryPaths = getDeckStoragePaths({ baseDir: '/tmp/test', game: 'sorcery' });
    expect(fabPaths.indexPath).toBe('/tmp/test/index.json');
    expect(sorceryPaths.indexPath).toBe('/tmp/test/index.json');
  });
});

describe('migrateToGameSubdirectories', () => {
  let baseDir;

  beforeEach(async () => {
    baseDir = await makeTempDir();
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it('creates game subdirectories and moves existing deck files to fab/', async () => {
    const decksDir = path.join(baseDir, 'decks');
    const previewsDir = path.join(baseDir, 'previews');
    await fs.mkdir(decksDir, { recursive: true });
    await fs.mkdir(previewsDir, { recursive: true });
    await fs.writeFile(path.join(decksDir, 'deck-1.json'), JSON.stringify({ id: 'deck-1', name: 'Test' }));
    await fs.writeFile(path.join(previewsDir, 'deck-1.webp'), Buffer.from('fake-webp'));

    await migrateToGameSubdirectories({ baseDir });

    const fabDeckExists = await fs.stat(path.join(baseDir, 'decks', 'fab', 'deck-1.json')).then(() => true).catch(() => false);
    const fabPreviewExists = await fs.stat(path.join(baseDir, 'previews', 'fab', 'deck-1.webp')).then(() => true).catch(() => false);
    expect(fabDeckExists).toBe(true);
    expect(fabPreviewExists).toBe(true);
  });

  it('updates index.json entries with game: "fab"', async () => {
    const decksDir = path.join(baseDir, 'decks');
    await fs.mkdir(decksDir, { recursive: true });
    const indexEntries = [
      { id: 'deck-1', name: 'Deck One', savedAt: '2024-01-01T00:00:00.000Z' },
      { id: 'deck-2', name: 'Deck Two', savedAt: '2024-01-02T00:00:00.000Z' },
    ];
    await fs.writeFile(path.join(baseDir, 'index.json'), JSON.stringify(indexEntries));
    await fs.writeFile(path.join(decksDir, 'deck-1.json'), '{}');
    await fs.writeFile(path.join(decksDir, 'deck-2.json'), '{}');

    await migrateToGameSubdirectories({ baseDir });

    const updatedIndex = JSON.parse(await fs.readFile(path.join(baseDir, 'index.json'), 'utf8'));
    expect(updatedIndex.every((e) => e.game === 'fab')).toBe(true);
  });

  it('skips migration if decks/fab/ already exists', async () => {
    const fabDir = path.join(baseDir, 'decks', 'fab');
    await fs.mkdir(fabDir, { recursive: true });
    await fs.writeFile(path.join(fabDir, 'already-migrated.json'), '{}');

    await migrateToGameSubdirectories({ baseDir });

    const files = await fs.readdir(fabDir);
    expect(files).toContain('already-migrated.json');
    expect(files).toHaveLength(1);
  });

  it('creates all four game subdirectories', async () => {
    await migrateToGameSubdirectories({ baseDir });

    for (const subPath of ['decks/fab', 'decks/sorcery', 'previews/fab', 'previews/sorcery']) {
      const exists = await fs.stat(path.join(baseDir, subPath)).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    }
  });

  it('does not move non-JSON files out of decks/', async () => {
    const decksDir = path.join(baseDir, 'decks');
    await fs.mkdir(decksDir, { recursive: true });
    await fs.writeFile(path.join(decksDir, 'readme.txt'), 'ignore me');

    await migrateToGameSubdirectories({ baseDir });

    const txtInFab = await fs.stat(path.join(baseDir, 'decks', 'fab', 'readme.txt')).then(() => true).catch(() => false);
    expect(txtInFab).toBe(false);
  });
});

describe('listDecks with game filter', () => {
  let baseDir;

  beforeEach(async () => {
    baseDir = await makeTempDir();
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it('returns only fab decks when game=fab', async () => {
    const index = [
      { id: 'fab-deck', name: 'FAB Deck', game: 'fab', savedAt: '2024-01-01T00:00:00.000Z', cardCount: 1 },
      { id: 'sorcery-deck', name: 'Sorcery Deck', game: 'sorcery', savedAt: '2024-01-02T00:00:00.000Z', cardCount: 1 },
    ];
    await fs.mkdir(path.join(baseDir, 'decks', 'fab'), { recursive: true });
    await fs.mkdir(path.join(baseDir, 'previews', 'fab'), { recursive: true });
    await fs.writeFile(path.join(baseDir, 'index.json'), JSON.stringify(index));
    await fs.writeFile(path.join(baseDir, 'decks', 'fab', 'fab-deck.json'), JSON.stringify({ id: 'fab-deck', name: 'FAB Deck', cards: [MINIMAL_CARD] }));

    const decks = await listDecks({ baseDir, game: 'fab' });
    expect(decks.every((d) => d.id !== 'sorcery-deck')).toBe(true);
    expect(decks.some((d) => d.id === 'fab-deck')).toBe(true);
  });

  it('returns only sorcery decks when game=sorcery', async () => {
    const index = [
      { id: 'fab-deck', name: 'FAB Deck', game: 'fab', savedAt: '2024-01-01T00:00:00.000Z', cardCount: 1 },
      { id: 'sorcery-deck', name: 'Sorcery Deck', game: 'sorcery', savedAt: '2024-01-02T00:00:00.000Z', cardCount: 1 },
    ];
    await fs.mkdir(path.join(baseDir, 'decks', 'sorcery'), { recursive: true });
    await fs.mkdir(path.join(baseDir, 'previews', 'sorcery'), { recursive: true });
    await fs.writeFile(path.join(baseDir, 'index.json'), JSON.stringify(index));
    await fs.writeFile(path.join(baseDir, 'decks', 'sorcery', 'sorcery-deck.json'), JSON.stringify({ id: 'sorcery-deck', name: 'Sorcery Deck', cards: [MINIMAL_CARD] }));

    const decks = await listDecks({ baseDir, game: 'sorcery' });
    expect(decks.every((d) => d.id !== 'fab-deck')).toBe(true);
    expect(decks.some((d) => d.id === 'sorcery-deck')).toBe(true);
  });

  it('treats entries without a game field as fab', async () => {
    const index = [
      { id: 'legacy-deck', name: 'Legacy Deck', savedAt: '2024-01-01T00:00:00.000Z', cardCount: 1 },
    ];
    await fs.mkdir(path.join(baseDir, 'decks', 'fab'), { recursive: true });
    await fs.mkdir(path.join(baseDir, 'previews', 'fab'), { recursive: true });
    await fs.writeFile(path.join(baseDir, 'index.json'), JSON.stringify(index));
    await fs.writeFile(path.join(baseDir, 'decks', 'fab', 'legacy-deck.json'), JSON.stringify({ id: 'legacy-deck', name: 'Legacy Deck', cards: [MINIMAL_CARD] }));

    const decks = await listDecks({ baseDir, game: 'fab' });
    expect(decks.some((d) => d.id === 'legacy-deck')).toBe(true);
  });
});

describe('saveDeck with game', () => {
  let baseDir;

  beforeEach(async () => {
    baseDir = await makeTempDir();
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it('stores deck JSON in game-specific subdirectory', async () => {
    await saveDeck({
      baseDir,
      game: 'sorcery',
      deck: { name: 'My Sorcery Deck', cards: [MINIMAL_CARD] },
    });

    const files = await fs.readdir(path.join(baseDir, 'decks', 'sorcery'));
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/\.json$/);
  });

  it('records game in index.json entry', async () => {
    await saveDeck({
      baseDir,
      game: 'fab',
      deck: { name: 'My FAB Deck', cards: [MINIMAL_CARD] },
    });

    const index = JSON.parse(await fs.readFile(path.join(baseDir, 'index.json'), 'utf8'));
    expect(index[0].game).toBe('fab');
  });

  it('defaults to fab when no game is specified', async () => {
    await saveDeck({
      baseDir,
      deck: { name: 'Default Deck', cards: [MINIMAL_CARD] },
    });

    const index = JSON.parse(await fs.readFile(path.join(baseDir, 'index.json'), 'utf8'));
    expect(index[0].game).toBe('fab');
    const files = await fs.readdir(path.join(baseDir, 'decks', 'fab'));
    expect(files.length).toBe(1);
  });
});
