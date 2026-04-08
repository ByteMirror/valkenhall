// Resolve a player's chosen avatar (a sorcery card id) to an image URL.
//
// Field name history: the local profile, the `/profile/me` payload, and
// the matchmaking socket event all use `profileAvatar`. Some earlier
// friend-related code read a shorter `avatar` field instead, and the
// silent fallback to `null` caused remote players' avatars to vanish
// across the friends sidebar and the friend profile overlay. Reading
// both names here keeps the UI robust to either payload shape — if the
// server ever renames the field we won't break again.
export function getAvatarCardId(playerOrProfile) {
  if (!playerOrProfile) return null;
  return playerOrProfile.profileAvatar ?? playerOrProfile.avatar ?? null;
}

/**
 * Resolve a player object (friend, public profile, self profile) to a
 * card image URL via the loaded sorcery card database. Returns null if
 * the player has no avatar set or the card isn't in the index.
 */
export function resolveAvatarUrl(playerOrProfile, sorceryCards) {
  const cardId = getAvatarCardId(playerOrProfile);
  if (!cardId || !sorceryCards) return null;
  const card = sorceryCards.find((c) => c.unique_id === cardId);
  return card?.printings?.[0]?.image_url || null;
}
