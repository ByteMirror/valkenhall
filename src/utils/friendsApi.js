import { getStoredToken } from './authApi';
import { send } from './serverClient';

const MATCHMAKING_URL = 'https://valkenhall-server-production.up.railway.app';

async function authHeaders() {
  const token = await getStoredToken();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

export async function searchPlayers(query) {
  const res = await fetch(`${MATCHMAKING_URL}/friends/search?q=${encodeURIComponent(query)}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    console.warn(`Friends search failed: ${res.status} ${res.statusText}`);
    return [];
  }
  return res.json();
}

export async function getFriendList() {
  const res = await fetch(`${MATCHMAKING_URL}/friends`, {
    headers: await authHeaders(),
  });
  if (!res.ok) return { friends: [], pendingRequests: [], pendingCount: 0, pendingInvites: [], pendingSpectate: [], acceptedNotifications: [] };
  return res.json();
}

export async function sendFriendRequest(targetId) {
  const res = await fetch(`${MATCHMAKING_URL}/friends/request`, {
    method: 'POST', headers: await authHeaders(),
    body: JSON.stringify({ targetId }),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Failed to send request'); }
  return res.json();
}

export async function acceptFriendRequest(senderId) {
  const res = await fetch(`${MATCHMAKING_URL}/friends/accept`, {
    method: 'POST', headers: await authHeaders(),
    body: JSON.stringify({ senderId }),
  });
  if (!res.ok) throw new Error('Failed to accept request');
  return res.json();
}

export async function declineFriendRequest(senderId) {
  const res = await fetch(`${MATCHMAKING_URL}/friends/decline`, {
    method: 'POST', headers: await authHeaders(),
    body: JSON.stringify({ senderId }),
  });
  if (!res.ok) throw new Error('Failed to decline request');
  return res.json();
}

export async function removeFriend(friendId) {
  const res = await fetch(`${MATCHMAKING_URL}/friends/${encodeURIComponent(friendId)}`, {
    method: 'DELETE', headers: await authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to remove friend');
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

// Match invite flow — now delivered via WebSocket. The new server requires a
// deckId on send/accept; call sites in app.jsx will be updated in the
// matchmaking-flow stage to surface a deck picker before dispatching these.
export function sendMatchInvite(targetId, deckId) {
  return send('invite:send', { targetId, deckId });
}

export function acceptMatchInvite(senderId, deckId) {
  return send('invite:accept', { senderId, deckId });
}

export function declineMatchInvite(senderId) {
  return send('invite:decline', { senderId });
}

// Spectate and trade endpoints are not implemented on the new server yet.
// Their call sites have been replaced with no-op stubs so the UI keeps
// compiling; they will be reintroduced once the server-side protocol exists.

export async function getPublicProfile(profileId) {
  const res = await fetch(`${MATCHMAKING_URL}/profile/${profileId}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to load profile');
  return res.json();
}
