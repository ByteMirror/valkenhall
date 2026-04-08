import { api } from '../serverClient';

// Fetch the active Arcane Trials season from the server. The server
// generates the season deterministically from the cycle epoch, so the
// result is identical for every player and stable for the lifetime of
// the cycle. Returned shape:
//   { season: { seasonId, name, setKey, startsAt, endsAt, tiers } }
export async function loadCurrentSeason() {
  return api.get('/profile/me/season');
}

// Claim a season tier reward. The server validates the tier against
// its own table and the player's stored season_progress, then atomically
// applies coins / shards / foil card grant.
//
// Returns { reward, newTotals: { coins, arcanaShards }, seasonProgress,
// collection } on success. Throws with the server's error message on
// validation failure (e.g. "Tier already claimed", "Tier not yet
// reached", "Season has rolled over — refresh required").
export async function claimSeasonTier(level) {
  return api.post('/profile/me/season/claim', { level });
}
