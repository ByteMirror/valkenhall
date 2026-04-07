import { describe, expect, it } from 'bun:test';
import { getCardsApiEndpoint, getCardsAssetUrl } from './cardsApi';

describe('cardsApi', () => {
  it('uses a same-origin relative path for the cards api', () => {
    expect(getCardsApiEndpoint({ hostname: 'localhost' })).toBe('/api/cards');
    expect(getCardsApiEndpoint({ hostname: '127.0.0.1' })).toBe('/api/cards');
  });

  it('resolves the Bun renderer cards asset under the app base path', () => {
    expect(getCardsAssetUrl({ pathname: '' })).toBe('/cards.json');
    expect(getCardsAssetUrl({ pathname: '/metrics' })).toBe('/cards.json');
  });

  it('resolves the plain web cards asset at the root path', () => {
    expect(getCardsAssetUrl({ pathname: '/' })).toBe('/cards.json');
  });
});
