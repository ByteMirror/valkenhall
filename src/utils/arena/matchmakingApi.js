import { connectWebSocket, send, api, SERVER_URL } from '../serverClient';

// Registration is automatic on first /auth/verify with the new server.
// Kept as a no-op stub returning a success response for backwards compat.
export async function registerPlayer(_profileId, _username) {
  return { ok: true };
}

// Queue state is managed server-side via the WebSocket connection.
// No state to clear from the client — kept as a no-op for backwards compat.
export async function clearQueueState(_token) {
  return { ok: true };
}

// Join the public matchmaking queue via WebSocket.
// The `token` argument is ignored (auth is handled by the WebSocket connection).
// The optional `deckId` is forwarded in the WebSocket payload.
export async function joinQueue(_token, deckId) {
  await connectWebSocket();
  send('matchmaking:join', { deckId });
  return { ok: true };
}

export async function leaveQueue(_token) {
  await connectWebSocket();
  send('matchmaking:leave', {});
  return { ok: true };
}

// Polling is obsolete — status arrives via WebSocket `matchmaking:status`
// and `matchmaking:matched` events (handled in presenceManager).
// This returns a stable "waiting" response so any legacy polling code
// continues to work as a no-op.
export async function pollQueueStatus(_token) {
  return { status: 'waiting' };
}

// Record a match in the server-side history.
// Rank changes are now computed client-side (see processMatchResult / applyLpChange)
// and sent via PUT /profile/me. This endpoint just appends to match_history.
export async function reportMatchResult(_token, _matchId, winner, extras = {}) {
  try {
    return await api.post('/profile/me/match', {
      opponentName: extras.opponentName || 'Opponent',
      won: winner === 'me',
      coinsEarned: extras.coinsEarned || 0,
      xpEarned: extras.xpEarned || 0,
    });
  } catch (err) {
    console.error('[matchmakingApi] reportMatchResult failed:', err);
    return { recorded: false };
  }
}

export async function getLeaderboard() {
  const res = await fetch(`${SERVER_URL}/api/leaderboard`);
  if (!res.ok) throw new Error('Failed to fetch leaderboard');
  return res.json();
}

// Account deletion is not yet implemented on the new server.
// No-op for backwards compat.
export async function deleteAccount(_token) {
  return { ok: true };
}
