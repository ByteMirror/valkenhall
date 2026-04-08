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

// Legacy match-history endpoint — the match claim flow in
// /profile/me/match/claim now writes match_history as part of its
// atomic transaction, so this function is effectively obsolete. Kept
// as a thin wrapper in case any non-ranked code path still calls it.
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

// Claim a time-gated match reward. The client only declares whether it
// won; the server computes the amount from the authoritative room
// duration. Returns { coinsEarned, xpEarned, seasonXpEarned,
// arcanaShardsEarned, durationMinutes, won, newTotals } on success, or
// throws on failure.
export async function claimMatchReward(won) {
  return api.post('/profile/me/match/claim', { won: !!won });
}

// Purchase a single copy of a card with Arcana Shards. The client only
// declares which card; the server looks up the rarity, charges the
// correct price, and atomically deducts shards + adds to the collection.
// Returns { cardId, rarity, shardsSpent, newTotals } on success.
export async function purchaseCardWithShards({ cardId }) {
  return api.post('/profile/me/cards/purchase', { cardId });
}

export async function getLeaderboard() {
  try {
    return await api.get('/leaderboard');
  } catch (err) {
    console.error('[matchmakingApi] getLeaderboard failed:', err);
    return [];
  }
}

// Account deletion is not yet implemented on the new server.
// No-op for backwards compat.
export async function deleteAccount(_token) {
  return { ok: true };
}
