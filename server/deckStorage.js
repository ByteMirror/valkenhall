import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Sharp is optional — deck preview generation is skipped if it can't load
let sharp = null;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.warn('Sharp not available — deck preview images will not be generated');
}

const APP_STORAGE_DIR_NAME = 'fab-builder';
const DECKS_DIR_NAME = 'decks';
const PREVIEWS_DIR_NAME = 'previews';
const INDEX_FILE_NAME = 'index.json';
const VALID_GAMES = new Set(['fab', 'sorcery']);

function normalizeGame(game) {
  const normalized = String(game || 'fab').trim().toLowerCase();
  return VALID_GAMES.has(normalized) ? normalized : 'fab';
}

function entryGame(entry) {
  return entry.game || 'fab';
}
const MAX_PREVIEW_CARDS = 10;
const PREVIEW_SCHEMA_VERSION = 4;
const PREVIEW_RENDER_SCALE = 2;
const PREVIEW_WIDTH = 356 * PREVIEW_RENDER_SCALE;
const PREVIEW_HEIGHT = 128 * PREVIEW_RENDER_SCALE;
const PREVIEW_CARD_WIDTH = 116 * PREVIEW_RENDER_SCALE;
const PREVIEW_CARD_HEIGHT = Math.round((PREVIEW_CARD_WIDTH * 88.9) / 63.5);
const PREVIEW_CARD_LEFT_OFFSET = 26 * PREVIEW_RENDER_SCALE;
const PREVIEW_CARD_TOP_OFFSET = 0;
const PREVIEW_VISIBLE_CARD_HEIGHT = PREVIEW_HEIGHT - PREVIEW_CARD_TOP_OFFSET;
const SUPPORTED_DECK_FORMATS = new Set(['classic-constructed', 'silver-age']);

function defaultBaseDirForPlatform(platform = process.platform, homeDir = os.homedir()) {
  if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', APP_STORAGE_DIR_NAME);
  }

  if (platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'), APP_STORAGE_DIR_NAME);
  }

  return path.join(process.env.XDG_DATA_HOME || path.join(homeDir, '.local', 'share'), APP_STORAGE_DIR_NAME);
}

export function getDeckStoragePaths({ baseDir = process.env.FAB_BUILDER_DATA_DIR || defaultBaseDirForPlatform(), game } = {}) {
  const normalizedGame = normalizeGame(game);
  return {
    baseDir,
    game: normalizedGame,
    decksDir: path.join(baseDir, DECKS_DIR_NAME, normalizedGame),
    previewsDir: path.join(baseDir, PREVIEWS_DIR_NAME, normalizedGame),
    indexPath: path.join(baseDir, INDEX_FILE_NAME),
  };
}

async function ensureStorageDirs(paths) {
  await fs.mkdir(paths.decksDir, { recursive: true });
  await fs.mkdir(paths.previewsDir, { recursive: true });
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return fallbackValue;
    }

    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  const tempPath = `${filePath}.tmp-${crypto.randomBytes(6).toString('hex')}`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tempPath, filePath);
}

function createDeckId() {
  return `deck-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeDeckFormat(format) {
  const normalizedFormat = String(format || '').trim().toLowerCase();
  return SUPPORTED_DECK_FORMATS.has(normalizedFormat) ? normalizedFormat : '';
}

function normalizeDeckCards(cards) {
  return Array.isArray(cards)
    ? cards
        .map((card) => ({
          cardId: card?.cardId || '',
          cardName: card?.cardName || '',
          printingId: card?.printingId || '',
          isSideboard: Boolean(card?.isSideboard),
        }))
        .filter((card) => card.cardId && card.printingId)
    : [];
}

function normalizePreviewCards(previewCards) {
  return Array.isArray(previewCards)
    ? previewCards
        .slice(0, MAX_PREVIEW_CARDS)
        .map((card) => ({
          name: card?.name || '',
          imageUrl: card?.imageUrl || '',
        }))
        .filter((card) => card.imageUrl)
    : [];
}

function buildPreviewVersion(savedAt) {
  return `v${PREVIEW_SCHEMA_VERSION}-${savedAt}`;
}

function isCurrentPreviewVersion(previewVersion) {
  return typeof previewVersion === 'string' && previewVersion.startsWith(`v${PREVIEW_SCHEMA_VERSION}-`);
}

function buildPreviewUrl(deckId, previewVersion, previewBaseUrl = '', game = 'fab') {
  const normalizedBase = String(previewBaseUrl || '').replace(/\/+$/, '');
  const pathName = `/api/decks/${deckId}/preview?v=${encodeURIComponent(previewVersion)}&game=${encodeURIComponent(game)}`;
  return normalizedBase ? `${normalizedBase}${pathName}` : pathName;
}

function buildDeckSummary(deckRecord, previewBaseUrl = '', game = 'fab') {
  const previewVersion = deckRecord.previewVersion || deckRecord.savedAt;

  return {
    id: deckRecord.id,
    name: deckRecord.name,
    format: normalizeDeckFormat(deckRecord.format),
    savedAt: deckRecord.savedAt,
    cardCount: Array.isArray(deckRecord.cards) ? deckRecord.cards.length : 0,
    previewUrl: previewVersion ? buildPreviewUrl(deckRecord.id, previewVersion, previewBaseUrl, game) : null,
  };
}

async function readIndex(paths) {
  const index = await readJson(paths.indexPath, []);
  return Array.isArray(index) ? index : [];
}

export async function migrateToGameSubdirectories({ baseDir = process.env.FAB_BUILDER_DATA_DIR || defaultBaseDirForPlatform() } = {}) {
  const fabDecksDir = path.join(baseDir, DECKS_DIR_NAME, 'fab');

  try {
    await fs.mkdir(fabDecksDir);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      return;
    }

    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  const games = [...VALID_GAMES];
  await Promise.all(
    games.flatMap((game) => [
      fs.mkdir(path.join(baseDir, DECKS_DIR_NAME, game), { recursive: true }),
      fs.mkdir(path.join(baseDir, PREVIEWS_DIR_NAME, game), { recursive: true }),
    ])
  );

  const legacyDecksDir = path.join(baseDir, DECKS_DIR_NAME);
  const legacyPreviewsDir = path.join(baseDir, PREVIEWS_DIR_NAME);

  for (const [srcDir, destDir, ext] of [
    [legacyDecksDir, fabDecksDir, '.json'],
    [legacyPreviewsDir, path.join(baseDir, PREVIEWS_DIR_NAME, 'fab'), '.webp'],
  ]) {
    let entries;
    try {
      entries = await fs.readdir(srcDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(ext)) {
        continue;
      }

      await fs.rename(path.join(srcDir, entry.name), path.join(destDir, entry.name));
    }
  }

  const indexPath = path.join(baseDir, INDEX_FILE_NAME);
  const currentIndex = await readJson(indexPath, []);
  if (currentIndex.length > 0) {
    await writeJsonAtomic(indexPath, currentIndex.map((entry) => ({ ...entry, game: entryGame(entry) })));
  }
}

function parseDataUrl(url) {
  const match = /^data:(.+?);base64,(.+)$/.exec(url || '');
  if (!match) {
    return null;
  }

  return Buffer.from(match[2], 'base64');
}

async function readPreviewImageBuffer(imageUrl) {
  if (!imageUrl) {
    throw new Error('Missing preview image URL');
  }

  if (imageUrl.startsWith('data:')) {
    const dataUrlBuffer = parseDataUrl(imageUrl);

    if (!dataUrlBuffer) {
      throw new Error('Unsupported preview data URL');
    }

    return dataUrlBuffer;
  }

  const response = await fetch(imageUrl, { redirect: 'follow' });

  if (!response.ok) {
    throw new Error(`Failed to fetch preview image (${response.status} ${response.statusText})`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function previewFileExists(previewPath) {
  try {
    await fs.stat(previewPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

async function generateDeckPreview(previewPath, previewCards) {
  if (!sharp) return null; // Sharp not available — skip preview generation

  const cardsToRender = normalizePreviewCards(previewCards);

  if (cardsToRender.length === 0) {
    await fs.rm(previewPath, { force: true }).catch(() => {});
    return null;
  }

  const preparedCards = await Promise.all(
    cardsToRender.map(async (previewCard) => {
      const input = await readPreviewImageBuffer(previewCard.imageUrl);
      const buffer = await sharp(input)
        .resize({
          width: PREVIEW_CARD_WIDTH,
          height: PREVIEW_CARD_HEIGHT,
          fit: 'cover',
          position: 'attention',
        })
        .extract({
          left: 0,
          top: 0,
          width: PREVIEW_CARD_WIDTH,
          height: PREVIEW_VISIBLE_CARD_HEIGHT,
        })
        .png()
        .toBuffer();

      return buffer;
    })
  );

  const previewStackWidth =
    PREVIEW_CARD_WIDTH + Math.max(0, (cardsToRender.length - 1) * PREVIEW_CARD_LEFT_OFFSET);
  const previewStackLeft = Math.max(0, PREVIEW_WIDTH - previewStackWidth);

  const composites = preparedCards
    .map((buffer, index) => ({
      input: buffer,
      left: previewStackLeft + index * PREVIEW_CARD_LEFT_OFFSET,
      top: PREVIEW_CARD_TOP_OFFSET,
      zIndex: cardsToRender.length - index,
    }))
    .sort((a, b) => a.zIndex - b.zIndex)
    .map(({ zIndex: _zIndex, ...composite }) => composite);

  const tempPath = `${previewPath}.tmp-${crypto.randomBytes(6).toString('hex')}`;

  await fs.mkdir(path.dirname(previewPath), { recursive: true });
  await sharp({
    create: {
      width: PREVIEW_WIDTH,
      height: PREVIEW_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .webp({ quality: 90, effort: 6, alphaQuality: 100 })
    .toFile(tempPath);

  await fs.rename(tempPath, previewPath);
  return previewPath;
}

async function upgradeDeckPreviewIfNeeded(paths, indexEntry) {
  const previewPath = path.join(paths.previewsDir, `${indexEntry.id}.webp`);
  const hasCurrentPreview = isCurrentPreviewVersion(indexEntry.previewVersion) && (await previewFileExists(previewPath));

  if (hasCurrentPreview) {
    return indexEntry;
  }

  const deckPath = path.join(paths.decksDir, `${indexEntry.id}.json`);
  const deckRecord = await readJson(deckPath, null);

  if (!deckRecord) {
    return indexEntry;
  }

  const previewCards = normalizePreviewCards(deckRecord.previewCards);
  const cardCount = Array.isArray(deckRecord.cards) ? deckRecord.cards.length : indexEntry.cardCount || 0;

  if (previewCards.length === 0) {
    const nextDeckRecord = {
      ...deckRecord,
      previewVersion: null,
    };

    await fs.rm(previewPath, { force: true }).catch(() => {});
    await writeJsonAtomic(deckPath, nextDeckRecord);

    return {
      id: indexEntry.id,
      name: nextDeckRecord.name || indexEntry.name,
      format: normalizeDeckFormat(nextDeckRecord.format || indexEntry.format),
      savedAt: nextDeckRecord.savedAt || indexEntry.savedAt,
      cardCount,
      previewVersion: null,
    };
  }

  try {
    await generateDeckPreview(previewPath, previewCards);
  } catch (error) {
    console.warn(`Failed to upgrade preview for deck ${indexEntry.id}:`, error);
    return indexEntry;
  }

  const savedAt = deckRecord.savedAt || indexEntry.savedAt || new Date().toISOString();
  const nextDeckRecord = {
    ...deckRecord,
    previewCards,
    previewVersion: buildPreviewVersion(savedAt),
  };

  await writeJsonAtomic(deckPath, nextDeckRecord);

  return {
    id: indexEntry.id,
    name: nextDeckRecord.name || indexEntry.name,
    format: normalizeDeckFormat(nextDeckRecord.format || indexEntry.format),
    savedAt,
    cardCount,
    previewVersion: nextDeckRecord.previewVersion,
  };
}

export async function listDecks({ baseDir, game, previewBaseUrl = '' } = {}) {
  const paths = getDeckStoragePaths({ baseDir, game });
  await ensureStorageDirs(paths);
  const currentIndex = await readIndex(paths);
  const gameFilteredIndex = currentIndex.filter((entry) => entryGame(entry) === paths.game);
  const nextIndex = [];
  let didChangeIndex = false;

  for (const entry of gameFilteredIndex) {
    const nextEntry = await upgradeDeckPreviewIfNeeded(paths, entry);
    nextIndex.push(nextEntry);

    if (
      nextEntry.name !== entry.name ||
      nextEntry.format !== entry.format ||
      nextEntry.savedAt !== entry.savedAt ||
      nextEntry.cardCount !== entry.cardCount ||
      nextEntry.previewVersion !== entry.previewVersion
    ) {
      didChangeIndex = true;
    }
  }

  if (didChangeIndex) {
    const otherGamesEntries = currentIndex.filter((entry) => entryGame(entry) !== paths.game);
    await writeJsonAtomic(paths.indexPath, [...nextIndex, ...otherGamesEntries]);
  }

  return nextIndex
    .slice()
    .sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || '')))
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      format: normalizeDeckFormat(entry.format),
      savedAt: entry.savedAt,
      cardCount: entry.cardCount || 0,
      previewUrl: entry.previewVersion ? buildPreviewUrl(entry.id, entry.previewVersion, previewBaseUrl, paths.game) : null,
    }));
}

export async function loadDeck({ baseDir, game, deckId } = {}) {
  if (!deckId) {
    throw new Error('Missing deck ID');
  }

  const paths = getDeckStoragePaths({ baseDir, game });
  return readJson(path.join(paths.decksDir, `${deckId}.json`), null);
}

export async function saveDeck({ baseDir, game, deck, previewBaseUrl = '' } = {}) {
  if (!deck?.name?.trim()) {
    throw new Error('Deck name is required');
  }

  const cards = normalizeDeckCards(deck.cards);

  if (cards.length === 0) {
    throw new Error('Deck must contain at least one card');
  }

  const paths = getDeckStoragePaths({ baseDir, game });
  await ensureStorageDirs(paths);
  const currentIndex = await readIndex(paths);
  const existingDeck = currentIndex.find((entry) => entry.id === deck.id || entry.name === deck.name.trim());

  const deckId = existingDeck?.id || deck.id || createDeckId();
  const savedAt = new Date().toISOString();
  const previewCards = normalizePreviewCards(deck.previewCards);
  const previewPath = path.join(paths.previewsDir, `${deckId}.webp`);

  let previewVersion = null;

  try {
    if (previewCards.length > 0) {
      await generateDeckPreview(previewPath, previewCards);
      previewVersion = buildPreviewVersion(savedAt);
    } else {
      await fs.rm(previewPath, { force: true }).catch(() => {});
    }
  } catch (error) {
    console.warn(`Failed to generate preview for deck ${deckId}:`, error);
    previewVersion = null;
  }

  const deckRecord = {
    id: deckId,
    name: deck.name.trim(),
    format: normalizeDeckFormat(deck.format),
    savedAt,
    cards,
    previewCards,
    previewVersion,
  };

  await writeJsonAtomic(path.join(paths.decksDir, `${deckId}.json`), deckRecord);

  const nextSummary = buildDeckSummary(deckRecord, previewBaseUrl, paths.game);
  const filteredIndex = currentIndex.filter((entry) => entry.id !== deckId && entry.name !== deckRecord.name);
  const nextIndex = [
    {
      id: deckId,
      name: deckRecord.name,
      format: deckRecord.format,
      game: paths.game,
      savedAt,
      cardCount: cards.length,
      previewVersion,
    },
    ...filteredIndex,
  ];

  await writeJsonAtomic(paths.indexPath, nextIndex);
  return nextSummary;
}

export async function deleteDeck({ baseDir, game, deckId } = {}) {
  if (!deckId) {
    throw new Error('Missing deck ID');
  }

  const paths = getDeckStoragePaths({ baseDir, game });
  const currentIndex = await readIndex(paths);
  const nextIndex = currentIndex.filter((entry) => entry.id !== deckId);

  await fs.rm(path.join(paths.decksDir, `${deckId}.json`), { force: true }).catch(() => {});
  await fs.rm(path.join(paths.previewsDir, `${deckId}.webp`), { force: true }).catch(() => {});
  await ensureStorageDirs(paths);
  await writeJsonAtomic(paths.indexPath, nextIndex);
}
