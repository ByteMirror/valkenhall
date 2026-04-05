import { getLocalApiOrigin } from './localApi';

function getDeckStorageEndpoint(locationLike = globalThis.location) {
  return `${getLocalApiOrigin(locationLike)}/api/decks`;
}

async function parseJsonResponse(response, fallbackMessage) {
  if (response.ok) {
    return response.status === 204 ? null : response.json();
  }

  let details = fallbackMessage;

  try {
    const payload = await response.json();
    details = payload?.details || payload?.error || fallbackMessage;
  } catch {
    details = fallbackMessage;
  }

  throw new Error(details);
}

export async function listSavedDecks(game = 'fab') {
  const response = await fetch(`${getDeckStorageEndpoint()}?game=${encodeURIComponent(game)}`);
  const decks = await parseJsonResponse(response, 'Failed to load saved decks');
  return Array.isArray(decks) ? decks : [];
}

export async function saveSavedDeck(deck, game = 'fab') {
  const response = await fetch(getDeckStorageEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...deck, game }),
  });

  return parseJsonResponse(response, 'Failed to save deck');
}

export async function loadSavedDeckById(deckId, game = 'fab') {
  const response = await fetch(`${getDeckStorageEndpoint()}/${encodeURIComponent(deckId)}?game=${encodeURIComponent(game)}`);
  return parseJsonResponse(response, 'Failed to load saved deck');
}

export async function deleteSavedDeckById(deckId, game = 'fab') {
  const response = await fetch(`${getDeckStorageEndpoint()}/${encodeURIComponent(deckId)}?game=${encodeURIComponent(game)}`, {
    method: 'DELETE',
  });

  await parseJsonResponse(response, 'Failed to delete saved deck');
}
