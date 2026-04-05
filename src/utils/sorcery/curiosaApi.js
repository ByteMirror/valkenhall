import { getLocalApiOrigin } from '../localApi';
import { extractCuriosaDeckId } from './importInput';

export async function importFromCuriosaUrl(url, { signal } = {}) {
  const deckId = extractCuriosaDeckId(url);

  if (!deckId) {
    throw new Error('Invalid Curiosa URL. Expected format: https://curiosa.io/decks/DECKID');
  }

  const proxyUrl = `${getLocalApiOrigin()}/api/curiosa/deck/${deckId}`;

  const response = await fetch(proxyUrl, { signal });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Failed to fetch Curiosa deck: ${response.status}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error('Invalid response from Curiosa proxy');
  }

  return data;
}
