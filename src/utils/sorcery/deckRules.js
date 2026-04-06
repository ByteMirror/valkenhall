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
  const inDeck = chosenCards.filter((e) => e.card.unique_id === card.unique_id).length;

  // Check rarity / singleton limit
  if (inDeck >= maxCopies) {
    if (SINGLETON_TYPES.has(card.type)) {
      return { allowed: false, reason: `Only one ${card.type} is allowed per deck` };
    }
    return {
      allowed: false,
      reason: `Maximum ${maxCopies} ${maxCopies === 1 ? 'copy' : 'copies'} of ${card.rarity || ''} cards allowed (${card.name})`,
    };
  }

  // Check ownership if ownedMap is provided
  if (ownedMap) {
    const owned = ownedMap.get(card.unique_id) || 0;
    const usedElsewhere = usedElsewhereMap?.get(card.unique_id) || 0;
    const available = owned - usedElsewhere - inDeck;
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
