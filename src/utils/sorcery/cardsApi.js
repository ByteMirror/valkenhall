import { getLocalApiOrigin } from '../localApi';
import { normalizeSorceryCards } from './normalizeCards';

export const SORCERY_CARDS_ASSET_PATH = '/sorcery-cards.json';

export function getSorceryCardsApiEndpoint(locationLike = globalThis.location) {
  return `${getLocalApiOrigin(locationLike)}/api/sorcery/cards`;
}

async function fetchCardsFrom(fetchImpl, url) {
  const response = await fetchImpl(url);

  if (!response?.ok) {
    throw new Error(`Failed to load Sorcery cards from ${url}`);
  }

  return response.json();
}

export async function loadSorceryCardsWithSource(fetchImpl = globalThis.fetch, locationLike = globalThis.location) {
  let lastError = null;

  for (const [source, url] of [
    ['api', getSorceryCardsApiEndpoint(locationLike)],
    ['asset', SORCERY_CARDS_ASSET_PATH],
  ]) {
    try {
      const cards = await fetchCardsFrom(fetchImpl, url);
      return { cards: normalizeSorceryCards(cards, getLocalApiOrigin(locationLike)), source };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Failed to load Sorcery cards');
}
