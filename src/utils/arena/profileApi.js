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

export async function saveArenaProfile(profile) {
  const token = profile?.serverToken;
  if (!token) throw new Error('No auth token in profile');

  // Only send allowed fields; skip name if null/empty (set separately via username prompt)
  const payload = {};
  if (profile.name && profile.name.trim().length >= 2) payload.name = profile.name;
  if (profile.coins != null) payload.coins = profile.coins;
  if (profile.xp != null) payload.xp = profile.xp;
  if (profile.starterDeck != null) payload.starterDeck = profile.starterDeck;
  if (profile.profileAvatar !== undefined) payload.profileAvatar = profile.profileAvatar;
  if (profile.rank) payload.rank = profile.rank;
  if (profile.collection) payload.collection = profile.collection;
  if (profile.decks) payload.decks = profile.decks;
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
