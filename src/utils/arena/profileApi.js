const MATCHMAKING_URL = 'https://fab-matchmaking.vercel.app';

function getToken() {
  try { return localStorage.getItem('valkenhall-token'); } catch { return null; }
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`,
  };
}

export async function loadArenaProfile() {
  const token = getToken();
  if (!token) return null;

  const res = await fetch(`${MATCHMAKING_URL}/api/profile/me`, {
    headers: authHeaders(),
  });
  if (!res.ok) return null;
  return res.json();
}

export async function saveArenaProfile(profile) {
  const res = await fetch(`${MATCHMAKING_URL}/api/profile/save`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error('Failed to save profile');
  return res.json();
}
