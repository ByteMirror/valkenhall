import { getStoredToken } from './authApi';

const MATCHMAKING_URL = 'https://fab-matchmaking.vercel.app';

async function authHeaders() {
  const token = await getStoredToken();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

export async function searchPlayers(query) {
  const res = await fetch(`${MATCHMAKING_URL}/api/social/friends-search?q=${encodeURIComponent(query)}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    console.warn(`Friends search failed: ${res.status} ${res.statusText}`);
    return [];
  }
  return res.json();
}

export async function getFriendList() {
  const res = await fetch(`${MATCHMAKING_URL}/api/social/friends-list`, {
    headers: await authHeaders(),
  });
  if (!res.ok) return { friends: [], pendingRequests: [], pendingCount: 0, pendingInvites: [], pendingSpectate: [], acceptedNotifications: [] };
  return res.json();
}

export async function sendFriendRequest(targetId) {
  const res = await fetch(`${MATCHMAKING_URL}/api/social/friends-request`, {
    method: 'POST', headers: await authHeaders(),
    body: JSON.stringify({ targetId }),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Failed to send request'); }
  return res.json();
}

export async function acceptFriendRequest(senderId) {
  const res = await fetch(`${MATCHMAKING_URL}/api/social/friends-accept`, {
    method: 'POST', headers: await authHeaders(),
    body: JSON.stringify({ senderId }),
  });
  if (!res.ok) throw new Error('Failed to accept request');
  return res.json();
}

export async function declineFriendRequest(senderId) {
  const res = await fetch(`${MATCHMAKING_URL}/api/social/friends-decline`, {
    method: 'POST', headers: await authHeaders(),
    body: JSON.stringify({ senderId }),
  });
  if (!res.ok) throw new Error('Failed to decline request');
  return res.json();
}

export async function removeFriend(friendId) {
  const res = await fetch(`${MATCHMAKING_URL}/api/social/friends-remove`, {
    method: 'POST', headers: await authHeaders(),
    body: JSON.stringify({ friendId }),
  });
  if (!res.ok) throw new Error('Failed to remove friend');
  return res.json();
}

export async function sendPresence(activity) {
  const res = await fetch(`${MATCHMAKING_URL}/api/presence`, {
    method: 'POST', headers: await authHeaders(),
    body: JSON.stringify({ activity }),
  });
  return res.ok;
}

export async function sendMatchInvite(targetId) {
  const res = await fetch(`${MATCHMAKING_URL}/api/social/invite-send`, {
    method: 'POST', headers: await authHeaders(),
    body: JSON.stringify({ targetId }),
  });
  if (!res.ok) throw new Error('Failed to send invite');
  return res.json();
}

export async function acceptMatchInvite(senderId) {
  const res = await fetch(`${MATCHMAKING_URL}/api/social/invite-accept`, {
    method: 'POST', headers: await authHeaders(),
    body: JSON.stringify({ senderId }),
  });
  if (!res.ok) throw new Error('Failed to accept invite');
  return res.json();
}

export async function declineMatchInvite(senderId) {
  const res = await fetch(`${MATCHMAKING_URL}/api/social/invite-decline`, {
    method: 'POST', headers: await authHeaders(),
    body: JSON.stringify({ senderId }),
  });
  if (!res.ok) throw new Error('Failed to decline invite');
  return res.json();
}

export async function requestSpectate(playerId) {
  const res = await fetch(`${MATCHMAKING_URL}/api/social/spectate-request`, {
    method: 'POST', headers: await authHeaders(),
    body: JSON.stringify({ playerId }),
  });
  if (!res.ok) throw new Error('Failed to request spectate');
  return res.json();
}

export async function allowSpectator(spectatorId) {
  const res = await fetch(`${MATCHMAKING_URL}/api/social/spectate-allow`, {
    method: 'POST', headers: await authHeaders(),
    body: JSON.stringify({ spectatorId }),
  });
  if (!res.ok) throw new Error('Failed to allow spectator');
  return res.json();
}

export async function denySpectator(spectatorId) {
  const res = await fetch(`${MATCHMAKING_URL}/api/social/spectate-deny`, {
    method: 'POST', headers: await authHeaders(),
    body: JSON.stringify({ spectatorId }),
  });
  if (!res.ok) throw new Error('Failed to deny spectator');
  return res.json();
}

export async function requestTrade(targetId) {
  const res = await fetch(`${MATCHMAKING_URL}/api/social/trade-request`, {
    method: 'POST', headers: await authHeaders(),
    body: JSON.stringify({ targetId }),
  });
  if (!res.ok) throw new Error('Failed to request trade');
  return res.json();
}

export async function acceptTrade(senderId) {
  const res = await fetch(`${MATCHMAKING_URL}/api/social/trade-accept`, {
    method: 'POST', headers: await authHeaders(),
    body: JSON.stringify({ senderId }),
  });
  if (!res.ok) throw new Error('Failed to accept trade');
  return res.json();
}

export async function declineTrade(senderId) {
  const res = await fetch(`${MATCHMAKING_URL}/api/social/trade-decline`, {
    method: 'POST', headers: await authHeaders(),
    body: JSON.stringify({ senderId }),
  });
  if (!res.ok) throw new Error('Failed to decline trade');
  return res.json();
}

export async function executeTrade(partnerId, myOffer, theirOffer) {
  const res = await fetch(`${MATCHMAKING_URL}/api/social/trade-execute`, {
    method: 'POST', headers: await authHeaders(),
    body: JSON.stringify({ partnerId, myOffer, theirOffer }),
  });
  if (!res.ok) throw new Error('Failed to execute trade');
  return res.json();
}

export async function getPublicProfile(profileId) {
  const res = await fetch(`${MATCHMAKING_URL}/api/profile/${profileId}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to load profile');
  return res.json();
}
