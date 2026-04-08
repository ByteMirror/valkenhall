/**
 * Centralised deck-building rules for Sorcery.
 *
 * All deck-building constraints live here — max copies per rarity,
 * type restrictions, etc. Import from this file whenever you need
 * to validate or enforce deck rules anywhere in the app.
 */

/** Maximum copies of a card allowed in a single deck, by rarity. */
export const MAX_COPIES_BY_RARITY = {
  Ordinary: 4,
  Exceptional: 3,
  Elite: 2,
  Unique: 1,
};

/** Default max copies if rarity is unknown or missing. */
export const MAX_COPIES_DEFAULT = 4;

/** Card types that are limited to one per deck. */
export const SINGLETON_TYPES = new Set(['Avatar']);

/**
 * Returns the maximum number of copies of a card allowed in a single deck.
 * @param {object} card — card object with `rarity` and `type` fields
 * @returns {number}
 */
export function getMaxCopies(card) {
  if (!card) return MAX_COPIES_DEFAULT;
  if (SINGLETON_TYPES.has(card.type)) return 1;
  return MAX_COPIES_BY_RARITY[card.rarity] || MAX_COPIES_DEFAULT;
}

/**
 * Counts how many entries in the current deck contribute to the copy
 * limit of `card`. For singleton types (e.g. Avatar) the limit applies
 * to the whole type — a deck may contain exactly one Avatar total, not
 * one of each different Avatar card — so we count all chosen cards of
 * the same type. For everything else we count copies of the specific
 * card by `unique_id`.
 */
function countTowardLimit(card, chosenCards) {
  if (SINGLETON_TYPES.has(card.type)) {
    return chosenCards.filter((e) => e.card?.type === card.type).length;
  }
  return chosenCards.filter((e) => e.card?.unique_id === card.unique_id).length;
}

/**
 * Returns how many more copies of `card` can still be added to the
 * current deck without violating its copy limit. Handles both rarity-
 * based limits and singleton-type limits (see countTowardLimit).
 *
 * Use this in UI code that needs to know "can the player click this
 * tile right now?" — it's the single source of truth for the remaining
 * slot count so the deck builder and the rule validator agree.
 */
export function getRemainingCopies(card, chosenCards) {
  if (!card) return 0;
  return Math.max(0, getMaxCopies(card) - countTowardLimit(card, chosenCards || []));
}

/**
 * Validates whether a card can be added to the current deck.
 * Returns `{ allowed: true }` or `{ allowed: false, reason: string }`.
 *
 * @param {object} card — the card to add
 * @param {Array} chosenCards — current deck entries (each has `.card`)
 * @param {object} [options]
 * @param {Map} [options.ownedMap] — cardId -> total owned quantity
 * @param {Map} [options.usedElsewhereMap] — cardId -> qty used in other decks
 */
export function canAddCard(card, chosenCards, { ownedMap, usedElsewhereMap } = {}) {
  if (!card) return { allowed: false, reason: 'Invalid card' };

  const maxCopies = getMaxCopies(card);
  const countForLimit = countTowardLimit(card, chosenCards);

  // Rarity / singleton limit check
  if (countForLimit >= maxCopies) {
    if (SINGLETON_TYPES.has(card.type)) {
      return { allowed: false, reason: `Only one ${card.type} is allowed per deck` };
    }
    return {
      allowed: false,
      reason: `Maximum ${maxCopies} ${maxCopies === 1 ? 'copy' : 'copies'} of ${card.rarity || ''} cards allowed (${card.name})`,
    };
  }

  // Ownership check uses per-card counting — you can own several avatars
  // even though only one can be slotted at a time; the singleton check
  // above already prevents a second avatar of any kind, so here we only
  // need to know whether you still have a physical copy of THIS card
  // that isn't locked up in another deck or already placed in this one.
  if (ownedMap) {
    const owned = ownedMap.get(card.unique_id) || 0;
    const usedElsewhere = usedElsewhereMap?.get(card.unique_id) || 0;
    const sameCardInDeck = chosenCards.filter((e) => e.card?.unique_id === card.unique_id).length;
    const available = owned - usedElsewhere - sameCardInDeck;
    if (available <= 0) {
      return {
        allowed: false,
        reason: `All ${owned} owned ${owned === 1 ? 'copy' : 'copies'} of ${card.name} already in use`,
      };
    }
  }

  return { allowed: true };
}

/**
 * Returns a human-readable label for the copy limit of a card.
 * Useful for tooltips or UI hints.
 * @param {object} card
 * @returns {string} e.g. "Max 4 copies" or "1 per deck (Avatar)"
 */
export function getCopyLimitLabel(card) {
  if (!card) return '';
  if (SINGLETON_TYPES.has(card.type)) return `1 per deck (${card.type})`;
  const max = MAX_COPIES_BY_RARITY[card.rarity] || MAX_COPIES_DEFAULT;
  return `Max ${max} ${max === 1 ? 'copy' : 'copies'} (${card.rarity || 'Standard'})`;
}
