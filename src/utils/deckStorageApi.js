import { api } from './serverClient';

export async function listSavedDecks(_game = 'sorcery') {
  try {
    const decks = await api.get('/decks');
    return Array.isArray(decks) ? decks : [];
  } catch (err) {
    console.error('[deckStorageApi] listSavedDecks failed:', err);
    return [];
  }
}

export async function loadSavedDeckById(deckId, _game = 'sorcery') {
  try {
    return await api.get(`/decks/${encodeURIComponent(deckId)}`);
  } catch (err) {
    if (err.message?.includes('404')) return null;
    console.error('[deckStorageApi] loadSavedDeckById failed:', err);
    return null;
  }
}

export async function saveSavedDeck(deck, _game = 'sorcery') {
  return await api.post('/decks', deck);
}

export async function deleteSavedDeckById(deckId, _game = 'sorcery') {
  return await api.delete(`/decks/${encodeURIComponent(deckId)}`);
}
