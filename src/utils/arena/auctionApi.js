import { api } from '../serverClient';

export async function fetchListings({ cardId, search, sortBy, sortOrder, limit, offset } = {}) {
  const params = new URLSearchParams();
  if (cardId) params.set('cardId', cardId);
  if (search) params.set('search', search);
  if (sortBy) params.set('sortBy', sortBy);
  if (sortOrder) params.set('sortOrder', sortOrder);
  if (limit != null) params.set('limit', limit);
  if (offset != null) params.set('offset', offset);
  const query = params.toString();
  return api.get(`/auction/listings${query ? `?${query}` : ''}`);
}

export async function fetchMyListings() {
  return api.get('/auction/my-listings');
}

export async function createListing(_token, cardId, cardName, price, foiling) {
  return api.post('/auction/list', { cardId, cardName, price, foiling: foiling || 'S' });
}

export async function buyListing(_token, listingId) {
  return api.post('/auction/buy', { listingId });
}

export async function cancelListing(_token, listingId) {
  return api.post('/auction/cancel', { listingId });
}
