import { getLocalApiOrigin } from './localApi';
export const APP_BASE_PATH = '';

export function getCardsAssetUrl(locationLike = globalThis.location) {
  const pathname = locationLike?.pathname || '';
  const basePath = pathname.startsWith(APP_BASE_PATH) ? APP_BASE_PATH : '';
  return `${basePath}/cards.json`;
}

export function getCardsApiEndpoint(locationLike = globalThis.location) {
  return `${getLocalApiOrigin(locationLike)}/api/cards`;
}

async function fetchCardsFrom(fetchImpl, url) {
  const response = await fetchImpl(url);

  if (!response?.ok) {
    throw new Error(`Failed to load cards from ${url}`);
  }

  return response.json();
}

export async function loadCardsWithSource(fetchImpl = globalThis.fetch, locationLike = globalThis.location) {
  let lastError = null;

  for (const [source, url] of [
    ['api', getCardsApiEndpoint(locationLike)],
    ['asset', getCardsAssetUrl(locationLike)],
  ]) {
    try {
      const cards = await fetchCardsFrom(fetchImpl, url);
      return { cards, source };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Failed to load cards');
}

export async function loadCards(fetchImpl = globalThis.fetch, locationLike = globalThis.location) {
  const result = await loadCardsWithSource(fetchImpl, locationLike);
  return result.cards;
}
