import { describe, expect, it } from 'bun:test';
import { getCardsApiEndpoint, getCardsAssetUrl } from './cardsApi';

describe('cardsApi', () => {
  it('uses the local desktop api for cards', () => {
    expect(getCardsApiEndpoint({ hostname: 'localhost' })).toBe('http://localhost:3001/api/cards');
    expect(getCardsApiEndpoint({ hostname: '127.0.0.1' })).toBe('http://127.0.0.1:3001/api/cards');
  });

  it('resolves the Bun renderer cards asset under the app base path', () => {
    expect(getCardsAssetUrl({ pathname: '/flesh-and-blood-proxies' })).toBe('/flesh-and-blood-proxies/cards.json');
    expect(getCardsAssetUrl({ pathname: '/flesh-and-blood-proxies/metrics' })).toBe('/flesh-and-blood-proxies/cards.json');
  });

  it('resolves the plain web cards asset at the root path', () => {
    expect(getCardsAssetUrl({ pathname: '/' })).toBe('/cards.json');
  });
});
