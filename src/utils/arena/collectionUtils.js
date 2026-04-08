// Total copies a player owns of a given card, summed across all foilings.
// Used for "do I own at least one copy of this card?" checks where the
// foil distinction does not matter (e.g. deck legality, base ownership
// filter for the deck builder).
export function buildOwnedMap(collection) {
  const owned = new Map();
  if (!Array.isArray(collection)) return owned;
  for (const entry of collection) {
    if (!entry?.cardId) continue;
    owned.set(entry.cardId, (owned.get(entry.cardId) || 0) + (entry.quantity || 0));
  }
  return owned;
}

// Per-foiling ownership map: cardId -> Map<foiling, qty>. Used by the
// deck builder and auction house to render each foiling variant as its
// own tile.
export function buildFoilingOwnedMap(collection) {
  const map = new Map();
  if (!Array.isArray(collection)) return map;
  for (const entry of collection) {
    if (!entry?.cardId) continue;
    const foiling = entry.foiling || 'S';
    let inner = map.get(entry.cardId);
    if (!inner) {
      inner = new Map();
      map.set(entry.cardId, inner);
    }
    inner.set(foiling, (inner.get(foiling) || 0) + (entry.quantity || 0));
  }
  return map;
}

export function getOwnedQty(foilingMap, cardId, foiling = 'S') {
  return foilingMap.get(cardId)?.get(foiling) || 0;
}

// Cards used in saved decks. Aggregated by (cardId, foiling) so the
// auction house can tell that listing a foil copy is allowed even when
// the standard copy is in a deck. Falls back to foiling 'S' for legacy
// deck entries that pre-date the foiling field.
export function buildUsedMap(decks, excludeDeckId) {
  const used = new Map();
  if (!Array.isArray(decks)) return used;
  for (const deck of decks) {
    if (deck.id === excludeDeckId) continue;
    if (!Array.isArray(deck.cards)) continue;
    for (const card of deck.cards) {
      if (!card?.cardId) continue;
      used.set(card.cardId, (used.get(card.cardId) || 0) + 1);
    }
  }
  return used;
}

// Per-(cardId, foiling) used map. Foiling on deck entries is derived from
// the printing if present. Used by the sell tab so foil copies can be
// listed even when the standard copy is in use (and vice versa).
export function buildUsedFoilingMap(decks, excludeDeckId) {
  const used = new Map();
  if (!Array.isArray(decks)) return used;
  for (const deck of decks) {
    if (deck.id === excludeDeckId) continue;
    if (!Array.isArray(deck.cards)) continue;
    for (const card of deck.cards) {
      if (!card?.cardId) continue;
      const foiling = card.foiling || 'S';
      let inner = used.get(card.cardId);
      if (!inner) {
        inner = new Map();
        used.set(card.cardId, inner);
      }
      inner.set(foiling, (inner.get(foiling) || 0) + 1);
    }
  }
  return used;
}

export function getUsedQty(usedFoilingMap, cardId, foiling = 'S') {
  return usedFoilingMap.get(cardId)?.get(foiling) || 0;
}

export function getAvailableQuantity(cardId, ownedMap, usedMap) {
  const owned = ownedMap.get(cardId) || 0;
  const used = usedMap.get(cardId) || 0;
  return Math.max(0, owned - used);
}

export function getAvailableQtyForFoiling(cardId, foiling, foilingOwnedMap, usedFoilingMap) {
  const owned = getOwnedQty(foilingOwnedMap, cardId, foiling);
  const used = getUsedQty(usedFoilingMap, cardId, foiling);
  return Math.max(0, owned - used);
}

export function filterCollectionCards(sorceryCards, ownedMap) {
  return sorceryCards.filter((card) => (ownedMap.get(card.unique_id) || 0) > 0);
}

export function countInDeck(cardId, deckCards) {
  return deckCards.filter((c) => c.cardId === cardId).length;
}
