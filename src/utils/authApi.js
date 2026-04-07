import { LOCAL_API_ORIGIN } from './localApi';

const MATCHMAKING_URL = 'https://valkenhall-server-production.up.railway.app';

export async function requestLoginCode(email) {
  const res = await fetch(`${MATCHMAKING_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to send login code');
  }
  return res.json();
}

export async function verifyLoginCode(email, code) {
  const res = await fetch(`${MATCHMAKING_URL}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Verification failed');
  }
  return res.json();
}

export async function validateToken(token) {
  const res = await fetch(`${MATCHMAKING_URL}/auth/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!res.ok) return { valid: false };
  return res.json();
}

export async function getStoredToken() {
  // Read localStorage first so browser and CEF dev instances stay isolated.
  // Falls back to the on-disk token (needed in production where CEF's port
  // changes per launch, which wipes localStorage).
  try {
    const localToken = localStorage.getItem('valkenhall-token');
    if (localToken) return localToken;
  } catch {}
  try {
    const res = await fetch(`${LOCAL_API_ORIGIN}/api/auth/token`);
    if (res.ok) {
      const { token } = await res.json();
      if (token) return token;
    }
  } catch {}
  return null;
}

export async function setStoredToken(token) {
  try { localStorage.setItem('valkenhall-token', token); } catch {}
  try {
    await fetch(`${LOCAL_API_ORIGIN}/api/auth/token`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch {}
}

export async function clearStoredToken() {
  try { localStorage.removeItem('valkenhall-token'); } catch {}
  try { await fetch(`${LOCAL_API_ORIGIN}/api/auth/token`, { method: 'DELETE' }); } catch {}
}
