export function buildOwnedMap(collection) {
  const owned = new Map();
  for (const entry of collection) {
    owned.set(entry.cardId, (owned.get(entry.cardId) || 0) + entry.quantity);
  }
  return owned;
}

export function buildUsedMap(decks, excludeDeckId) {
  const used = new Map();
  if (!Array.isArray(decks)) return used;
  for (const deck of decks) {
    if (deck.id === excludeDeckId) continue;
    if (!Array.isArray(deck.cards)) continue;
    for (const card of deck.cards) {
      used.set(card.cardId, (used.get(card.cardId) || 0) + 1);
    }
  }
  return used;
}

export function getAvailableQuantity(cardId, ownedMap, usedMap) {
  const owned = ownedMap.get(cardId) || 0;
  const used = usedMap.get(cardId) || 0;
  return Math.max(0, owned - used);
}

export function filterCollectionCards(sorceryCards, ownedMap) {
  return sorceryCards.filter((card) => (ownedMap.get(card.unique_id) || 0) > 0);
}

export function countInDeck(cardId, deckCards) {
  return deckCards.filter((c) => c.cardId === cardId).length;
}
