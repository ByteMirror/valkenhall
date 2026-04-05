/**
 * Simple proxy server for Fabrary API
 * Handles AWS Cognito authentication and GraphQL requests
 */

import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'url';
import { CognitoIdentityClient, GetIdCommand, GetCredentialsForIdentityCommand } from '@aws-sdk/client-cognito-identity';
import { SignatureV4 } from '@aws-sdk/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
import { HttpRequest } from '@smithy/protocol-http';

// Added for upscaling endpoint
import multer from 'multer';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { execFile, spawn } from 'child_process';
import crypto from 'crypto';
import sharp from 'sharp';
import { getCardSetDownloadStatuses, startCardSetDownload } from './cardSetDownloads.js';
import { deleteDeck, getDeckStoragePaths, listDecks, loadDeck, migrateToGameSubdirectories, saveDeck } from './deckStorage.js';
import { listSessions, saveSession, loadSession, deleteSession } from './sessionStorage.js';

const PORT = 3001;
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolvePublicFile(relativePath, { runtimeDir = __dirname, cwd = process.cwd() } = {}) {
  const candidates = [
    path.resolve(runtimeDir, '../public', relativePath),
    path.resolve(runtimeDir, '../dist/public', relativePath),
    path.resolve(cwd, 'public', relativePath),
    path.resolve(cwd, 'dist/public', relativePath),
  ];
  return candidates.find((candidate) => existsSync(candidate)) || candidates[0];
}

export function resolveCardsJsonPath(opts) {
  return resolvePublicFile('cards.json', opts);
}

const CARDS_JSON_PATH = resolveCardsJsonPath();

export function resolveSorceryCardsJsonPath(opts) {
  return resolvePublicFile('sorcery-cards.json', opts);
}

const SORCERY_CARDS_JSON_PATH = resolveSorceryCardsJsonPath();

// Enable CORS for local development
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const GRAPHQL_ENDPOINT = 'https://42xrd23ihbd47fjvsrt27ufpfe.appsync-api.us-east-2.amazonaws.com/graphql';
const REGION = 'us-east-2';
const COGNITO_IDENTITY_POOL_ID = 'us-east-2:845208739518';

// GraphQL query to fetch deck data
const GET_DECK_QUERY = `
query getDeck($deckId: ID!) {
  getDeck(deckId: $deckId) {
    name
    hero {
      name
      pitch
    }
    deckCards {
      quantity
      card {
        name
        pitch
        types
      }
    }
  }
}
`;

/**
 * Get temporary AWS credentials from Cognito
 */
async function getCognitoCredentials() {
  const client = new CognitoIdentityClient({ region: REGION });

  try {
    // Step 1: Get Identity ID
    const getIdCommand = new GetIdCommand({
      IdentityPoolId: COGNITO_IDENTITY_POOL_ID
    });

    const identityResponse = await client.send(getIdCommand);
    const identityId = identityResponse.IdentityId;

    console.log('Got Identity ID:', identityId);

    // Step 2: Get credentials for the identity
    const getCredsCommand = new GetCredentialsForIdentityCommand({
      IdentityId: identityId
    });

    const credsResponse = await client.send(getCredsCommand);
    const credentials = credsResponse.Credentials;

    return {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretKey,
      sessionToken: credentials.SessionToken,
      expiration: credentials.Expiration
    };
  } catch (error) {
    console.error('Error getting Cognito credentials:', error);
    throw error;
  }
}

/**
 * Make authenticated GraphQL request using AWS Signature V4
 */
async function makeAuthenticatedGraphQLRequest(deckId, credentials) {
  const requestBody = JSON.stringify({
    query: GET_DECK_QUERY,
    variables: { deckId }
  });

  const url = new URL(GRAPHQL_ENDPOINT);

  // Create HTTP request object
  const request = new HttpRequest({
    method: 'POST',
    protocol: url.protocol,
    hostname: url.hostname,
    path: url.pathname,
    headers: {
      'Content-Type': 'application/json',
      'host': url.hostname
    },
    body: requestBody
  });

  // Sign the request
  const signer = new SignatureV4({
    service: 'appsync',
    region: REGION,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken
    },
    sha256: Sha256
  });

  const signedRequest = await signer.sign(request);

  // Make the actual HTTP request
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: signedRequest.method,
    headers: signedRequest.headers,
    body: requestBody
  });

  return response;
}

/**
 * Convert deck data to text format
 */
function convertDeckToText(deckData) {
  if (!deckData) {
    return '';
  }

  const lines = [];

  // Add hero
  if (deckData.hero && deckData.hero.name) {
    lines.push(`Hero: ${deckData.hero.name}`);
  }

  // Add deck cards with counts
  if (deckData.deckCards && deckData.deckCards.length > 0) {
    // Group cards by name and pitch
    const cardCounts = {};

    deckData.deckCards.forEach(deckCard => {
      if (!deckCard.card || !deckCard.card.name) return;

      const name = deckCard.card.name;
      const pitch = deckCard.card.pitch;
      const quantity = deckCard.quantity || 1;
      const types = deckCard.card.types || [];

      // Create key with pitch if present (and not a token/hero)
      let key = name;
      const isToken = types.includes('Token');

      if (pitch && !isToken) {
        const pitchMap = { '1': 'red', '2': 'yellow', '3': 'blue' };
        const pitchName = pitchMap[pitch] || pitch;
        key = `${name} (${pitchName})`;
      }

      cardCounts[key] = (cardCounts[key] || 0) + quantity;
    });

    // Convert to lines
    Object.entries(cardCounts).forEach(([name, count]) => {
      lines.push(`${count}x ${name}`);
    });
  }

  return lines.join('\n');
}

function getRequestBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

/**
 * API endpoint to fetch deck from Fabrary
 */
app.get('/api/fabrary/deck/:deckId', async (req, res) => {
  const { deckId } = req.params;

  console.log(`Fetching deck: ${deckId}`);

  try {
    // Get Cognito credentials
    console.log('Getting Cognito credentials...');
    const credentials = await getCognitoCredentials();

    // Make authenticated GraphQL request
    console.log('Making authenticated GraphQL request...');
    const response = await makeAuthenticatedGraphQLRequest(deckId, credentials);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GraphQL request failed:', response.status, errorText);
      return res.status(response.status).json({
        error: `GraphQL request failed: ${response.status} ${response.statusText}`,
        details: errorText
      });
    }

    const result = await response.json();

    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
      return res.status(400).json({
        error: 'GraphQL errors',
        details: result.errors
      });
    }

    if (!result.data || !result.data.getDeck) {
      return res.status(404).json({
        error: 'Deck not found'
      });
    }

    // Convert deck data to text format
    const deckText = convertDeckToText(result.data.getDeck);

    console.log(`Successfully fetched deck: ${result.data.getDeck.name}`);

    res.json({
      success: true,
      deckText,
      deckData: result.data.getDeck
    });

  } catch (error) {
    console.error('Error fetching deck:', error);
    res.status(500).json({
      error: 'Failed to fetch deck',
      details: error.message
    });
  }
});

const CURIOSA_TRPC_BASE_URL = 'https://curiosa.io/api/trpc';
const CURIOSA_HEADERS = {
  'Referer': 'https://curiosa.io/',
  'Content-Type': 'application/json',
};

function buildCuriosaTrpcUrl(procedure, input) {
  const encoded = encodeURIComponent(JSON.stringify({ '0': { json: input } }));
  return `${CURIOSA_TRPC_BASE_URL}/${procedure}?batch=1&input=${encoded}`;
}

function mapCuriosaDeckEntry(entry) {
  const card = entry?.card;
  if (!card) return null;
  return {
    name: card.name,
    slug: card.slug,
    quantity: entry.quantity || 1,
    type: card.type,
    category: card.category,
  };
}

app.get('/api/curiosa/deck/:deckId', async (req, res) => {
  const { deckId } = req.params;
  console.log(`Fetching Curiosa deck: ${deckId}`);

  try {
    const [deckRes, decklistRes, avatarRes, sideboardRes] = await Promise.all([
      fetch(buildCuriosaTrpcUrl('deck.getById', { id: deckId }), { headers: CURIOSA_HEADERS }),
      fetch(buildCuriosaTrpcUrl('deck.getDecklistById', { id: deckId, tracking: false }), { headers: CURIOSA_HEADERS }),
      fetch(buildCuriosaTrpcUrl('deck.getAvatarById', { id: deckId }), { headers: CURIOSA_HEADERS }),
      fetch(buildCuriosaTrpcUrl('deck.getSideboardById', { id: deckId }), { headers: CURIOSA_HEADERS }),
    ]);

    if (!deckRes.ok) {
      return res.status(deckRes.status).json({
        error: `Curiosa API error: ${deckRes.status} ${deckRes.statusText}`,
      });
    }

    const [deckData, decklistData, avatarData, sideboardData] = await Promise.all([
      deckRes.json(),
      decklistRes.json(),
      avatarRes.json(),
      sideboardRes.json(),
    ]);

    const deck = deckData?.[0]?.result?.data?.json;
    const decklist = decklistData?.[0]?.result?.data?.json || [];
    const avatarEntry = avatarData?.[0]?.result?.data?.json || null;
    const sideboard = sideboardData?.[0]?.result?.data?.json || [];

    if (!deck) {
      return res.status(404).json({ error: 'Deck not found on Curiosa' });
    }

    const spellbook = [];
    const atlas = [];

    for (const entry of decklist) {
      const item = mapCuriosaDeckEntry(entry);
      if (!item) continue;

      if (item.category === 'Site' || item.type === 'Site') {
        atlas.push(item);
      } else {
        spellbook.push(item);
      }
    }

    res.json({
      success: true,
      name: deck.name || '',
      format: deck.format || 'constructed',
      avatar: avatarEntry?.card
        ? { name: avatarEntry.card.name, slug: avatarEntry.card.slug }
        : null,
      spellbook,
      atlas,
      collection: sideboard.map(mapCuriosaDeckEntry).filter(Boolean),
    });
  } catch (error) {
    console.error('Error fetching Curiosa deck:', error);
    res.status(500).json({
      error: 'Failed to fetch Curiosa deck',
      details: error.message,
    });
  }
});

app.get('/api/decks', async (req, res) => {
  try {
    const game = req.query.game || 'fab';
    const decks = await listDecks({ game, previewBaseUrl: getRequestBaseUrl(req) });
    res.json(decks);
  } catch (error) {
    console.error('Failed to list saved decks:', error);
    res.status(500).json({
      error: 'Failed to list saved decks',
      details: error.message,
    });
  }
});

app.get('/api/cards', (_req, res) => {
  res.sendFile(CARDS_JSON_PATH, (error) => {
    if (!error) {
      return;
    }

    console.error('Failed to load cards json:', error);
    res.status(error.statusCode || 500).json({
      error: 'Failed to load cards',
      details: error.message,
    });
  });
});

app.get('/api/sorcery/cards', (_req, res) => {
  res.sendFile(SORCERY_CARDS_JSON_PATH, (error) => {
    if (!error) {
      return;
    }

    console.error('Failed to load Sorcery cards json:', error);
    res.status(error.statusCode || 500).json({
      error: 'Failed to load Sorcery cards',
      details: error.message,
    });
  });
});

app.post('/api/card-sets/status', async (req, res) => {
  try {
    const setIds = Array.isArray(req.body?.setIds) ? req.body.setIds : [];
    const sets = await getCardSetDownloadStatuses({
      cardsJsonPath: CARDS_JSON_PATH,
      setIds,
    });

    res.json({ sets });
  } catch (error) {
    console.error('Failed to load card set download statuses:', error);
    res.status(500).json({
      error: 'Failed to load card set download statuses',
      details: error.message,
    });
  }
});

app.post('/api/card-sets/:setId/download', async (req, res) => {
  try {
    const normalizedSetId = String(req.params.setId || '').trim().toUpperCase();
    const status = await startCardSetDownload({
      cardsJsonPath: CARDS_JSON_PATH,
      setId: normalizedSetId,
    });

    res.status(status.downloaded ? 200 : 202).json({
      setId: normalizedSetId,
      ...status,
    });
  } catch (error) {
    console.error(`Failed to download card set ${req.params.setId}:`, error);
    res.status(error?.code === 'CARD_SET_NOT_FOUND' ? 404 : 500).json({
      error: 'Failed to download card set',
      details: error.message,
    });
  }
});

app.get('/api/decks/:deckId', async (req, res) => {
  try {
    const game = req.query.game || 'fab';
    const deck = await loadDeck({ game, deckId: req.params.deckId });

    if (!deck) {
      return res.status(404).json({ error: 'Deck not found' });
    }

    return res.json(deck);
  } catch (error) {
    console.error('Failed to load saved deck:', error);
    return res.status(500).json({
      error: 'Failed to load saved deck',
      details: error.message,
    });
  }
});

app.post('/api/decks', async (req, res) => {
  try {
    const game = req.body?.game || 'fab';
    const summary = await saveDeck({
      game,
      deck: req.body,
      previewBaseUrl: getRequestBaseUrl(req),
    });

    res.json(summary);
  } catch (error) {
    console.error('Failed to save deck:', error);
    res.status(400).json({
      error: 'Failed to save deck',
      details: error.message,
    });
  }
});

app.delete('/api/decks/:deckId', async (req, res) => {
  try {
    const game = req.query.game || 'fab';
    await deleteDeck({ game, deckId: req.params.deckId });
    res.status(204).end();
  } catch (error) {
    console.error('Failed to delete deck:', error);
    res.status(500).json({
      error: 'Failed to delete deck',
      details: error.message,
    });
  }
});

app.get('/api/decks/:deckId/preview', async (req, res) => {
  try {
    const game = req.query.game || 'fab';
    const paths = getDeckStoragePaths({ game });
    const previewPath = path.join(paths.previewsDir, `${req.params.deckId}.webp`);
    const previewBuffer = await fs.readFile(previewPath);

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(previewBuffer);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return res.status(404).json({ error: 'Preview not found' });
    }

    console.error('Failed to load deck preview:', error);
    return res.status(500).json({
      error: 'Failed to load deck preview',
      details: error.message,
    });
  }
});

// -------------------- PDF save endpoint --------------------
function getPdfExportDir() {
  return path.join(os.homedir(), 'Documents', 'fab-builder');
}

function openFileInDefaultViewer(filePath) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd'
    : 'xdg-open';
  const args = process.platform === 'win32'
    ? ['/c', 'start', '""', filePath]
    : [filePath];
  execFile(cmd, args, (err) => {
    if (err) console.error('Failed to open PDF:', err.message);
  });
}

app.post('/api/save-pdf', express.raw({ type: 'application/octet-stream', limit: '100mb' }), async (req, res) => {
  try {
    const filename = req.headers['x-filename'] || 'proxies.pdf';
    const safeName = filename.replace(/[^a-zA-Z0-9._\- ]/g, '_');
    const exportsDir = getPdfExportDir();
    console.log('[save-pdf] exportsDir:', exportsDir);
    await fs.mkdir(exportsDir, { recursive: true });
    const filePath = path.join(exportsDir, safeName);
    await fs.writeFile(filePath, req.body);
    console.log('[save-pdf] wrote %d bytes to %s', req.body.length, filePath);
    openFileInDefaultViewer(filePath);
    res.json({ path: filePath });
  } catch (error) {
    console.error('Failed to save PDF:', error);
    res.status(500).json({ error: 'Failed to save PDF', details: error.message });
  }
});

// -------------------- Image proxy (for PDF export CORS) --------------------
app.get('/api/image-proxy', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) {
    return res.status(400).json({ error: 'Missing ?url= parameter' });
  }

  try {
    const upstream = await fetch(imageUrl);
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream ${upstream.status}` });
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  } catch (error) {
    console.error('Image proxy error:', error.message);
    res.status(502).json({ error: 'Failed to fetch image', details: error.message });
  }
});

// -------------------- Upscale endpoint --------------------
// We keep uploads on disk to avoid large in-memory buffers.
const upload = multer({
  dest: path.join(os.tmpdir(), 'fab-builder-uploads'),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB
});

// Resolve paths relative to this file (server/proxy.js)
function getUpscaylExecutableName(platform = process.platform) {
  return platform === 'win32' ? 'upscayl-bin.exe' : 'upscayl-bin';
}

function allowsLegacyUpscaylFallback(platform = process.platform) {
  return platform === 'linux';
}

export function resolveUpscalingAssetPaths({
  runtimeDir = __dirname,
  platform = process.platform,
  arch = process.arch,
  env = process.env,
} = {}) {
  const bundledUpscalingDir = path.resolve(runtimeDir, '../server/upscaling');
  const sourceUpscalingDir = path.resolve(runtimeDir, 'upscaling');
  const upscalingDir = runtimeDir.endsWith('/bun') || runtimeDir.endsWith('\\bun') ? bundledUpscalingDir : sourceUpscalingDir;
  const executableName = getUpscaylExecutableName(platform);
  const explicitBinPath = env.FAB_BUILDER_UPSCAYL_BIN ? path.resolve(env.FAB_BUILDER_UPSCAYL_BIN) : '';
  const explicitModelsDir = env.FAB_BUILDER_UPSCAYL_MODELS_DIR ? path.resolve(env.FAB_BUILDER_UPSCAYL_MODELS_DIR) : '';
  const platformBinPath = path.join(upscalingDir, 'bin', `${platform}-${arch}`, executableName);
  const legacyBinPath = path.join(upscalingDir, executableName);

  return {
    upscalingDir,
    modelsDir: explicitModelsDir || path.join(upscalingDir, 'models'),
    binPath: explicitBinPath || platformBinPath,
    platformBinPath,
    legacyBinPath,
  };
}

const UPSCALING_ASSET_PATHS = resolveUpscalingAssetPaths();
const UPSCALING_DIR = UPSCALING_ASSET_PATHS.upscalingDir;
const UPSCAYL_BIN = UPSCALING_ASSET_PATHS.binPath;
const UPSCAYL_MODELS_DIR = UPSCALING_ASSET_PATHS.modelsDir;
const UPSCAYL_MODEL_NAME = 'ultramix-balanced-4x';
const UPSCAYL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const MAX_OUTPUT_HEIGHT_PX = 2100;

// Prefer WebP for newly generated/cached outputs.
const OUTPUT_FORMAT = 'webp';

// Persisted cache directory for upscaled outputs (safe to delete).
// Keep it under server/ so it’s colocated with backend assets.
const UPSCALE_CACHE_DIR = path.resolve(__dirname, '.cache', 'upscaled');

function cacheKeyForUpscale({ imageUrl, modelName, modelsDir }) {
  // Stable key: url + model settings. Using sha256 keeps path safe.
  const h = crypto.createHash('sha256');
  h.update(String(modelName || ''));
  h.update('\n');
  h.update(String(modelsDir || ''));
  h.update('\n');
  h.update(String(imageUrl || ''));
  return h.digest('hex');
}

const UPSCALE_REGISTRY_PATH = path.join(UPSCALE_CACHE_DIR, 'registry.json');

async function readUpscaleRegistry() {
  try {
    const raw = await fs.readFile(UPSCALE_REGISTRY_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

async function writeUpscaleRegistry(registry) {
  await fs.mkdir(path.dirname(UPSCALE_REGISTRY_PATH), { recursive: true });
  const tempPath = `${UPSCALE_REGISTRY_PATH}.tmp-${crypto.randomBytes(6).toString('hex')}`;
  await fs.writeFile(tempPath, JSON.stringify(registry, null, 2), 'utf8');
  await fs.rename(tempPath, UPSCALE_REGISTRY_PATH);
}

async function registerUpscaledImage(sourceUrl, cacheKey, cachePath) {
  try {
    const meta = await sharp(cachePath, { failOn: 'none' }).metadata();
    const registry = await readUpscaleRegistry();
    registry[sourceUrl] = {
      cacheUrl: `/api/upscale/cached/${cacheKey}.webp`,
      cacheKey,
      width: meta?.width || 0,
      height: meta?.height || 0,
      createdAt: new Date().toISOString(),
    };
    await writeUpscaleRegistry(registry);
  } catch (error) {
    console.warn('[upscale] Failed to update registry:', error);
  }
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function sha256File(filePath) {
  const h = crypto.createHash('sha256');
  const buf = await fs.readFile(filePath);
  h.update(buf);
  return h.digest('hex');
}

function guessContentTypeFromPath(p) {
  const ext = (path.extname(p) || '').toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

function logUpscale(jobId, ...args) {
  console.log(`[upscale:${jobId}]`, ...args);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeFetchResponseToFile(resp, outPath) {
  await ensureDir(path.dirname(outPath));
  const buffer = Buffer.from(await resp.arrayBuffer());
  await fs.writeFile(outPath, buffer);
}

async function downloadToFile(url, outPath, jobId) {
  logUpscale(jobId, 'Downloading image', url, '->', outPath);

  const resp = await fetch(url, { redirect: 'follow' });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Failed to download image: ${resp.status} ${resp.statusText} ${text}`);
  }

  logUpscale(jobId, 'Download response headers:', {
    contentType: resp.headers.get('content-type'),
    contentLength: resp.headers.get('content-length')
  });

  await writeFetchResponseToFile(resp, outPath);
}

function runUpscayl(inputPath, outputPath, jobId, upscaylBinPath) {
  return new Promise((resolve, reject) => {
    // -f webp makes upscayl write WebP output.
    const args = ['-i', inputPath, '-o', outputPath, '-m', UPSCAYL_MODELS_DIR, '-n', UPSCAYL_MODEL_NAME, '-f', OUTPUT_FORMAT];
    logUpscale(jobId, 'Spawning:', upscaylBinPath, args.join(' '));

    const child = spawn(upscaylBinPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    const t = setTimeout(() => {
      logUpscale(jobId, `Timeout after ${UPSCAYL_TIMEOUT_MS}ms; killing upscayl process`);
      child.kill('SIGKILL');
    }, UPSCAYL_TIMEOUT_MS);

    child.on('error', (err) => {
      clearTimeout(t);
      reject(err);
    });

    child.on('close', (code, signal) => {
      clearTimeout(t);
      logUpscale(jobId, 'upscayl closed', { code, signal });
      if (stdout) logUpscale(jobId, 'stdout:', stdout.slice(0, 2000));
      if (stderr) logUpscale(jobId, 'stderr:', stderr.slice(0, 2000));

      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`upscayl-bin exited with code ${code}. stderr: ${stderr || '(empty)'} stdout: ${stdout || '(empty)'}`));
    });
  });
}

export async function resolveAvailableUpscaylBin({
  assetPaths = UPSCALING_ASSET_PATHS,
  platform = process.platform,
  access = fs.access,
} = {}) {
  if (assetPaths.binPath) {
    try {
      await access(assetPaths.binPath);
      return assetPaths.binPath;
    } catch {
      // Prefer the legacy path only when the platform-specific path is absent.
    }
  }

  if (
    allowsLegacyUpscaylFallback(platform) &&
    assetPaths.legacyBinPath &&
    assetPaths.legacyBinPath !== assetPaths.binPath
  ) {
    try {
      await access(assetPaths.legacyBinPath);
      return assetPaths.legacyBinPath;
    } catch {
      // Handled below.
    }
  }

  if (!allowsLegacyUpscaylFallback(platform)) {
    throw new Error(
      `Missing platform-specific upscayl binary for ${platform} at ${assetPaths.platformBinPath || assetPaths.binPath}. ` +
        `Legacy fallback is disabled on ${platform} because the bundled root binary is Linux-only.`
    );
  }

  throw new Error(`No upscayl binary found. Checked ${assetPaths.binPath} and ${assetPaths.legacyBinPath}.`);
}

async function downscaleIfNeeded(inPath, outPath, jobId) {
  const img = sharp(inPath, { failOn: 'none' });
  const meta = await img.metadata();
  const height = meta?.height || 0;
  const width = meta?.width || 0;

  if (!height || !width) {
    logUpscale(jobId, 'WARN: could not read image dimensions for downscale; skipping');
    if (inPath !== outPath) {
      await fs.copyFile(inPath, outPath);
    }
    return { width, height, resized: false };
  }

  if (height <= MAX_OUTPUT_HEIGHT_PX) {
    logUpscale(jobId, 'Downscale not needed', { width, height, maxHeight: MAX_OUTPUT_HEIGHT_PX });
    if (inPath !== outPath) {
      await fs.copyFile(inPath, outPath);
    }
    return { width, height, resized: false };
  }

  const newHeight = MAX_OUTPUT_HEIGHT_PX;
  const newWidth = Math.round((width * newHeight) / height);

  logUpscale(jobId, 'Downscaling output', { from: { width, height }, to: { width: newWidth, height: newHeight } });

  const pipeline = sharp(inPath, { failOn: 'none' }).resize({
    width: newWidth,
    height: newHeight,
    fit: 'fill',
    kernel: sharp.kernel.lanczos3,
  });

  if (path.extname(outPath).toLowerCase() === '.webp') {
    // High-quality WebP. (Lossy but visually excellent; much smaller.)
    await pipeline.webp({ quality: 92, smartSubsample: true, effort: 6 }).toFile(outPath);
  } else {
    // Legacy path: keep PNG lossless.
    await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(outPath);
  }

  return { width: newWidth, height: newHeight, resized: true };
}

async function ensureCacheCapped(cachePath, jobId) {
  try {
    const meta = await sharp(cachePath, { failOn: 'none' }).metadata();
    const h = meta?.height || 0;
    const w = meta?.width || 0;

    if (!h || !w) {
      logUpscale(jobId, 'Cache metadata unreadable; leaving as-is', { cachePath });
      return { wasTooLarge: false, resized: false, width: w, height: h };
    }

    if (h <= MAX_OUTPUT_HEIGHT_PX) {
      return { wasTooLarge: false, resized: false, width: w, height: h };
    }

    logUpscale(jobId, 'Cache entry exceeds max height; downscaling cache', { cachePath, width: w, height: h });

    const tmpPath = `${cachePath}.tmp-${jobId}`;
    await downscaleIfNeeded(cachePath, tmpPath, jobId);
    await fs.rename(tmpPath, cachePath);

    const meta2 = await sharp(cachePath, { failOn: 'none' }).metadata();
    return {
      wasTooLarge: true,
      resized: true,
      width: meta2?.width || 0,
      height: meta2?.height || 0,
    };
  } catch (err) {
    logUpscale(jobId, 'WARN: ensureCacheCapped failed; serving cached file as-is', err);
    return { wasTooLarge: false, resized: false, width: 0, height: 0 };
  }
}

async function migratePngCacheHitToWebp(pngPath, webpPath, jobId) {
  try {
    // If target already exists, just delete png.
    if (await fileExists(webpPath)) {
      logUpscale(jobId, 'PNG cache hit but WebP exists; deleting PNG', { pngPath, webpPath });
      await fs.rm(pngPath, { force: true });
      return webpPath;
    }

    logUpscale(jobId, 'Migrating PNG cache to WebP', { pngPath, webpPath });
    await ensureDir(path.dirname(webpPath));

    // Step 1: cap PNG if too large (in-place)
    await ensureCacheCapped(pngPath, jobId);

    // Step 2: convert to WebP (high quality)
    const tmpWebp = `${webpPath}.tmp-${jobId}`;
    await sharp(pngPath, { failOn: 'none' })
      .webp({ quality: 92, smartSubsample: true, effort: 6 })
      .toFile(tmpWebp);

    await fs.rename(tmpWebp, webpPath);

    // Step 3: remove PNG
    await fs.rm(pngPath, { force: true });

    return webpPath;
  } catch (err) {
    logUpscale(jobId, 'WARN: PNG->WebP migration failed; serving PNG', err);
    return pngPath;
  }
}

app.get('/api/upscale/registry', async (_req, res) => {
  try {
    const registry = await readUpscaleRegistry();
    res.json(registry);
  } catch (error) {
    console.error('Failed to read upscale registry:', error);
    res.status(500).json({ error: 'Failed to read upscale registry' });
  }
});

app.get('/api/upscale/cached/:filename', async (req, res) => {
  const filename = req.params.filename;
  if (!/^[a-f0-9]+\.webp$/i.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const cachePath = path.join(UPSCALE_CACHE_DIR, filename);
  try {
    const buffer = await fs.readFile(cachePath);
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buffer);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return res.status(404).json({ error: 'Cached upscale not found' });
    }
    res.status(500).json({ error: 'Failed to serve cached upscale' });
  }
});

app.post('/api/upscale', upload.single('image'), async (req, res) => {
  const requestStart = Date.now();
  const jobId = crypto.randomBytes(8).toString('hex');

  // Accept either multipart file field "image" OR JSON { imageUrl }
  // Note: express.json() won't run for multipart requests, but multer parsed it.
  const imageUrl = req.body?.imageUrl;

  logUpscale(jobId, 'Incoming request', {
    method: req.method,
    path: req.path,
    contentType: req.headers['content-type'],
    hasFile: !!req.file,
    imageUrl: imageUrl ? String(imageUrl).slice(0, 200) : null,
  });

  // Reject blob: URLs (server can't fetch them). Frontend should upload the bytes instead.
  if (!req.file && typeof imageUrl === 'string' && imageUrl.startsWith('blob:')) {
    logUpscale(jobId, 'Bad request: blob: URL not supported without upload');
    return res.status(400).json({
      error: 'blob: URLs are not supported. Upload the image bytes using multipart/form-data field "image".'
    });
  }

  // Cache key:
  // - If JSON imageUrl is provided -> stable sha(url+model)
  // - If file upload -> sha(file bytes + model)
  let cacheKey = null;
  let cachePath = null;
  let cachePathPng = null;
  let cachePathWebp = null;

  try {
    if (req.file?.path) {
      const fileHash = await sha256File(req.file.path);
      cacheKey = cacheKeyForUpscale({
        imageUrl: `upload:${fileHash}`,
        modelName: UPSCAYL_MODEL_NAME,
        modelsDir: UPSCAYL_MODELS_DIR
      });
    } else if (imageUrl) {
      cacheKey = cacheKeyForUpscale({ imageUrl, modelName: UPSCAYL_MODEL_NAME, modelsDir: UPSCAYL_MODELS_DIR });
    }

    cachePathWebp = cacheKey ? path.join(UPSCALE_CACHE_DIR, `${cacheKey}.webp`) : null;
    cachePathPng = cacheKey ? path.join(UPSCALE_CACHE_DIR, `${cacheKey}.png`) : null;

    // Prefer WebP cache, but allow legacy PNG cache hits.
    cachePath = (cachePathWebp && (await fileExists(cachePathWebp)))
      ? cachePathWebp
      : (cachePathPng && (await fileExists(cachePathPng)))
        ? cachePathPng
        : null;

    if (cachePath) {
      const stat = await fs.stat(cachePath);
      logUpscale(jobId, 'Cache HIT', { cachePath, size: stat.size });

      // If this is a legacy PNG hit, migrate it to WebP and serve WebP.
      if (cachePath === cachePathPng && cachePathWebp) {
        cachePath = await migratePngCacheHitToWebp(cachePathPng, cachePathWebp, jobId);
      }

      // Ensure cached entries also respect MAX_OUTPUT_HEIGHT_PX
      await ensureCacheCapped(cachePath, jobId);

      const buf = await fs.readFile(cachePath);
      res.setHeader('Content-Type', guessContentTypeFromPath(cachePath));
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Upscale-Job', jobId);
      res.setHeader('X-Upscale-Cache', 'HIT');
      if (cacheKey) res.setHeader('X-Upscale-Cache-Url', `/api/upscale/cached/${cacheKey}.webp`);
      if (imageUrl && cacheKey && cachePath) registerUpscaledImage(imageUrl, cacheKey, cachePath);
      return res.status(200).send(buf);
    } else if (cacheKey) {
      logUpscale(jobId, 'Cache MISS', { cacheKey });
      // Set the path we'll write to (webp)
      cachePath = cachePathWebp;
    }
  } catch (err) {
    // Cache errors should never fail the request.
    logUpscale(jobId, 'WARN: cache precheck failed, continuing without cache', err);
    cacheKey = null;
    cachePath = null;
  }

  const tmpRoot = path.join(os.tmpdir(), 'fab-builder-upscale');
  const jobDir = path.join(tmpRoot, jobId);

  let inputPath = null;
  let outputPath = null;
  let resolvedUpscaylBin = '';

  try {
    await ensureDir(jobDir);
    if (cachePath) await ensureDir(UPSCALE_CACHE_DIR);

    resolvedUpscaylBin = await resolveAvailableUpscaylBin();
    logUpscale(jobId, 'Using upscayl binary', resolvedUpscaylBin);

    if (req.file?.path) {
      inputPath = req.file.path;
      logUpscale(jobId, 'Using uploaded file:', inputPath);
    } else if (imageUrl) {
      const inferredExt = (() => {
        try {
          const u = new URL(imageUrl);
          const ext = path.extname(u.pathname);
          return ext || '.png';
        } catch {
          return '.png';
        }
      })();
      inputPath = path.join(jobDir, `input${inferredExt}`);
      await downloadToFile(imageUrl, inputPath, jobId);
    } else {
      logUpscale(jobId, 'Bad request: missing image');
      return res.status(400).json({ error: 'Missing image. Provide multipart field "image" or JSON field "imageUrl".' });
    }

    // Choose output extension based on desired format.
    outputPath = path.join(jobDir, `output.${OUTPUT_FORMAT}`);

    logUpscale(jobId, 'Running upscayl', { inputPath, outputPath });
    await runUpscayl(inputPath, outputPath, jobId, resolvedUpscaylBin);

    // Downscale the upscaled output before caching/return.
    const resizedPath = path.join(jobDir, `output_scaled.${OUTPUT_FORMAT}`);
    await downscaleIfNeeded(outputPath, resizedPath, jobId);
    outputPath = resizedPath;

    const stat = await fs.stat(outputPath);
    logUpscale(jobId, 'Upscale complete, output size:', stat.size);

    // Store in cache (best-effort)
    if (cachePath) {
      try {
        await fs.copyFile(outputPath, cachePath);
        logUpscale(jobId, 'Cached output', { cachePath });
      } catch (err) {
        logUpscale(jobId, 'WARN: failed to write cache', err);
      }
    }

    const buf = await fs.readFile(outputPath);
    res.setHeader('Content-Type', guessContentTypeFromPath(outputPath));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Upscale-Job', jobId);
    res.setHeader('X-Upscale-Cache', cachePath ? 'MISS' : 'BYPASS');
    if (cacheKey) res.setHeader('X-Upscale-Cache-Url', `/api/upscale/cached/${cacheKey}.webp`);
    if (imageUrl && cacheKey && cachePath) registerUpscaledImage(imageUrl, cacheKey, cachePath);
    return res.status(200).send(buf);
  } catch (err) {
    logUpscale(jobId, 'ERROR:', err);
    return res.status(500).json({ error: 'Upscale failed', jobId, details: err?.message || String(err) });
  } finally {
    logUpscale(jobId, 'Cleaning up, duration(ms):', Date.now() - requestStart);

    const cleanupPaths = [];
    if (outputPath) cleanupPaths.push(outputPath);
    if (inputPath && inputPath.startsWith(jobDir)) cleanupPaths.push(inputPath);

    await Promise.allSettled(cleanupPaths.map((p) => fs.rm(p, { force: true })));
    await fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});

    if (req.file?.path) {
      await fs.rm(req.file.path, { force: true }).catch(() => {});
    }
  }
});

const SORCERY_CDN_BASE = 'https://d27a44hjr9gen3.cloudfront.net/cards';

// --- Session storage ---

app.get('/api/sessions', async (_req, res) => {
  try {
    const sessions = await listSessions();
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list sessions', details: error.message });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const summary = await saveSession({ session: req.body });
    res.json(summary);
  } catch (error) {
    res.status(400).json({ error: 'Failed to save session', details: error.message });
  }
});

app.get('/api/sessions/:sessionId', async (req, res) => {
  try {
    const session = await loadSession({ sessionId: req.params.sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load session', details: error.message });
  }
});

app.delete('/api/sessions/:sessionId', async (req, res) => {
  try {
    await deleteSession({ sessionId: req.params.sessionId });
    res.status(204).end();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete session', details: error.message });
  }
});

const SPAWN_CONFIG_PATH = path.resolve(__dirname, '..', 'public', 'spawn-config.json');

app.get('/api/game/spawn-config', async (_req, res) => {
  try {
    const raw = await fs.readFile(SPAWN_CONFIG_PATH, 'utf8');
    res.json(JSON.parse(raw));
  } catch (error) {
    if (error?.code === 'ENOENT') return res.json({});
    res.status(500).json({ error: 'Failed to read spawn config' });
  }
});

app.post('/api/game/spawn-config', async (req, res) => {
  try {
    await fs.writeFile(SPAWN_CONFIG_PATH, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save spawn config' });
  }
});

app.get('/game-assets/:filename', (req, res) => {
  const filename = req.params.filename;
  if (!/^[a-z0-9_-]+\.(webp|png|jpg|ogg|mp3|wav)$/i.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const localPath = resolvePublicFile(filename);
  if (localPath) return res.sendFile(localPath);
  res.status(404).json({ error: 'Asset not found' });
});

app.get('/sorcery-images/:filename', async (req, res) => {
  const { filename } = req.params;
  if (!/^[a-z0-9_-]+\.png$/i.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const localPath = resolvePublicFile(`sorcery-images/${filename}`);

  if (existsSync(localPath)) {
    return res.sendFile(localPath);
  }

  const slug = filename.replace(/\.png$/i, '');
  const cdnUrl = `${SORCERY_CDN_BASE}/${slug}.png`;

  try {
    const cdnResponse = await fetch(cdnUrl, { redirect: 'follow' });
    if (!cdnResponse.ok) {
      return res.status(cdnResponse.status).json({ error: 'Image not found' });
    }
    const buffer = Buffer.from(await cdnResponse.arrayBuffer());
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buffer);
  } catch (error) {
    res.status(502).json({ error: 'Failed to fetch image', details: error.message });
  }
});

export function createProxyApp() {
  return app;
}

export async function startProxyServer({ port = PORT, host } = {}) {
  await migrateToGameSubdirectories().catch((error) => {
    console.warn('Deck migration to game subdirectories failed (non-fatal):', error);
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const address = server.address();
      const resolvedHost =
        typeof address === 'object' && address?.address && address.address !== '::'
          ? address.address
          : host || 'localhost';
      const resolvedPort = typeof address === 'object' && address?.port ? address.port : port;

      console.log(`Fabrary proxy server running on http://${resolvedHost}:${resolvedPort}`);
      resolve(server);
    });

    server.on('error', reject);
  });
}

const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectExecution) {
  startProxyServer().catch((error) => {
    console.error('Failed to start Fabrary proxy server:', error);
    process.exitCode = 1;
  });
}
