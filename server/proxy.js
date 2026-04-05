/**
 * Simple proxy server for Valkenhall API
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

import path from 'path';
import fs from 'fs/promises';
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

      console.log(`Valkenhall proxy server running on http://${resolvedHost}:${resolvedPort}`);
      resolve(server);
    });

    server.on('error', reject);
  });
}

const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectExecution) {
  startProxyServer().catch((error) => {
    console.error('Failed to start Valkenhall proxy server:', error);
    process.exitCode = 1;
  });
}
