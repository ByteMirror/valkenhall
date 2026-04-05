const MATCHMAKING_URL = 'https://fab-matchmaking.vercel.app';

function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

export async function registerPlayer(profileId, username) {
  const res = await fetch(`${MATCHMAKING_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileId, username }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Registration failed');
  }
  return res.json();
}

export async function clearQueueState(token) {
  const res = await fetch(`${MATCHMAKING_URL}/api/queue/clear`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to clear queue state');
  return res.json();
}

export async function joinQueue(token) {
  const res = await fetch(`${MATCHMAKING_URL}/api/queue/join`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to join queue');
  return res.json();
}

export async function leaveQueue(token) {
  const res = await fetch(`${MATCHMAKING_URL}/api/queue/leave`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to leave queue');
  return res.json();
}

export async function pollQueueStatus(token) {
  const res = await fetch(`${MATCHMAKING_URL}/api/queue/status`, {
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to check queue status');
  return res.json();
}

export async function reportMatchResult(token, matchId, winner) {
  const res = await fetch(`${MATCHMAKING_URL}/api/match/report`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ matchId, winner }),
  });
  if (!res.ok) throw new Error('Failed to report match result');
  return res.json();
}

export async function getLeaderboard() {
  const res = await fetch(`${MATCHMAKING_URL}/api/leaderboard`);
  if (!res.ok) throw new Error('Failed to fetch leaderboard');
  return res.json();
}

export async function deleteAccount(token) {
  const res = await fetch(`${MATCHMAKING_URL}/api/account/delete`, {
    method: 'POST',
    headers: authHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to delete account');
  return res.json();
}
