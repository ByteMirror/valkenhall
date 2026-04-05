const MATCHMAKING_URL = 'https://fab-matchmaking.vercel.app';

function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

async function postAction(token, endpoint, body, fallbackError) {
  const res = await fetch(`${MATCHMAKING_URL}/api/auction/${endpoint}`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || fallbackError);
  }
  return res.json();
}

export async function fetchListings({ cardId, search, sortBy, sortOrder, limit, offset } = {}) {
  const params = new URLSearchParams();
  if (cardId) params.set('cardId', cardId);
  if (search) params.set('search', search);
  if (sortBy) params.set('sortBy', sortBy);
  if (sortOrder) params.set('sortOrder', sortOrder);
  if (limit != null) params.set('limit', limit);
  if (offset != null) params.set('offset', offset);
  const query = params.toString();
  const res = await fetch(`${MATCHMAKING_URL}/api/auction/listings${query ? `?${query}` : ''}`);
  if (!res.ok) throw new Error('Failed to fetch listings');
  return res.json();
}

export async function fetchMyListings(token) {
  const res = await fetch(`${MATCHMAKING_URL}/api/auction/mine`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to fetch your listings');
  return res.json();
}

export async function createListing(token, cardId, cardName, price) {
  return postAction(token, 'list', { cardId, cardName, price }, 'Failed to create listing');
}

export async function buyListing(token, listingId) {
  return postAction(token, 'buy', { listingId }, 'Failed to buy listing');
}

export async function cancelListing(token, listingId) {
  return postAction(token, 'cancel', { listingId }, 'Failed to cancel listing');
}

export async function syncCoins(token, coins) {
  return postAction(token, 'sync', { coins }, 'Failed to sync coins');
}
