import { LOCAL_API_ORIGIN } from './localApi';

const MATCHMAKING_URL = 'https://valkenhall-server-production.up.railway.app';

// In dev mode, the CEF app and the browser share the same origin
// (127.0.0.1:4173) and therefore the same localStorage. We namespace
// the token key so each environment has its own login session. The CEF
// renderer URL includes ?runtime=cef (set in package.json); browser
// sessions don't have that parameter.
const IS_CEF = typeof location !== 'undefined' && new URLSearchParams(location.search).get('runtime') === 'cef';
const TOKEN_KEY = IS_CEF ? 'valkenhall-token-cef' : 'valkenhall-token';

export async function requestLoginCode(email, { checkOnly = false } = {}) {
  const res = await fetch(`${MATCHMAKING_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, checkOnly }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to send login code');
  }
  return res.json();
}

export async function verifyLoginCode(email, code, inviteCode = null) {
  const body = { email, code };
  if (inviteCode) body.inviteCode = inviteCode;
  const res = await fetch(`${MATCHMAKING_URL}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Verification failed');
  }
  return res.json();
}

export async function validateInviteCode(code) {
  const res = await fetch(`${MATCHMAKING_URL}/invites/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) return { valid: false };
  return res.json();
}

export async function getMyInviteCode(token) {
  const res = await fetch(`${MATCHMAKING_URL}/invites/my-code`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.code || null;
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
  // localStorage is namespaced by TOKEN_KEY so browser and CEF dev
  // instances stay isolated even though they share the same origin.
  // Falls back to the on-disk token (needed in production where CEF's
  // port changes per launch, which wipes localStorage).
  try {
    const localToken = localStorage.getItem(TOKEN_KEY);
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
  try { localStorage.setItem(TOKEN_KEY, token); } catch {}
  try {
    await fetch(`${LOCAL_API_ORIGIN}/api/auth/token`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch {}
}

export async function clearStoredToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch {}
  try { await fetch(`${LOCAL_API_ORIGIN}/api/auth/token`, { method: 'DELETE' }); } catch {}
}
