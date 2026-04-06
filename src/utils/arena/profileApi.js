const MATCHMAKING_URL = 'https://fab-matchmaking.vercel.app';

function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

export async function loadArenaProfile(token) {
  if (!token) return null;

  const res = await fetch(`${MATCHMAKING_URL}/api/profile/me`, {
    headers: authHeaders(token),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function saveArenaProfile(profile) {
  const token = profile?.serverToken;
  if (!token) throw new Error('No auth token in profile');

  const res = await fetch(`${MATCHMAKING_URL}/api/profile/save`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error('Failed to save profile');
  return res.json();
}
