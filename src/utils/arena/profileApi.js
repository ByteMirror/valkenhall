import { api } from '../serverClient';

const MATCHMAKING_URL = 'https://valkenhall-server-production.up.railway.app';

function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

export async function loadArenaProfile(token) {
  if (!token) return null;

  const res = await fetch(`${MATCHMAKING_URL}/profile/me`, {
    headers: authHeaders(token),
  });
  if (!res.ok) return null;
  return res.json();
}

// Save mutable profile fields. The collection is intentionally NOT sent
// here — all collection mutations go through grantCards (or the auction
// and mail routes), which use the atomic INSERT … ON CONFLICT path on
// the server. Sending the collection on PUT /me used to corrupt the
// database when the client had multiple foiling variants of the same
// card; that path is now closed.
export async function saveArenaProfile(profile) {
  const token = profile?.serverToken;
  if (!token) throw new Error('No auth token in profile');

  const payload = {};
  if (profile.name && profile.name.trim().length >= 2) payload.name = profile.name;
  if (profile.coins != null) payload.coins = profile.coins;
  if (profile.xp != null) payload.xp = profile.xp;
  if (profile.arcanaShards != null) payload.arcanaShards = profile.arcanaShards;
  if (profile.starterDeck != null) payload.starterDeck = profile.starterDeck;
  if (profile.profileAvatar !== undefined) payload.profileAvatar = profile.profileAvatar;
  if (profile.rank) payload.rank = profile.rank;
  if (profile.matchHistory) payload.matchHistory = profile.matchHistory;
  if (profile.achievements) payload.achievements = profile.achievements;
  if (profile.seasonProgress !== undefined) payload.seasonProgress = profile.seasonProgress;

  const res = await fetch(`${MATCHMAKING_URL}/profile/me`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to save profile');
  return res.json();
}

// Bulk-grant cards to the current player. items is an array of
// { cardId, foiling, quantity }. Returns the updated collection so the
// caller can sync local state without an additional GET.
export async function grantCards(items) {
  if (!Array.isArray(items) || items.length === 0) return { collection: [] };
  return api.post('/profile/me/cards/grant', { items });
}
