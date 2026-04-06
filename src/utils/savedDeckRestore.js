function normalizeSavedDeckText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getPersistentPrintingId(printing) {
  return printing?._source_printing_id || printing?.unique_id || null;
}

export function createSavedDeckCardIndex(cards = []) {
  const cardsById = new Map();
  const cardsByNormalizedName = new Map();

  for (const card of cards) {
    if (!card?.unique_id) {
      continue;
    }

    cardsById.set(card.unique_id, card);

    const normalizedName = normalizeSavedDeckText(card.name);
    if (!cardsByNormalizedName.has(normalizedName)) {
      cardsByNormalizedName.set(normalizedName, []);
    }

    cardsByNormalizedName.get(normalizedName).push(card);
  }

  return {
    cardsById,
    cardsByNormalizedName,
    preferredPrintingByCardId: new Map(),
  };
}

export function findSavedDeckPrinting(card, savedEntry) {
  if (!card || !savedEntry) {
    return null;
  }

  return (
    card.printings?.find((printing) => getPersistentPrintingId(printing) === savedEntry.printingId) ||
    card.printings?.find((printing) => printing.unique_id === savedEntry.printingId) ||
    null
  );
}

function findSavedDeckCard(cardIndex, savedEntry) {
  if (!cardIndex || !savedEntry) {
    return null;
  }

  const cardById = cardIndex.cardsById.get(savedEntry.cardId);
  if (cardById) {
    return cardById;
  }

  const normalizedName = normalizeSavedDeckText(savedEntry.cardName);
  const matchingCards = cardIndex.cardsByNormalizedName.get(normalizedName);
  return matchingCards?.[0] || null;
}

async function getPreferredPrinting(cardIndex, card, resolvePreferredPrinting) {
  if (!card?.unique_id || typeof resolvePreferredPrinting !== 'function') {
    return null;
  }

  if (!cardIndex.preferredPrintingByCardId.has(card.unique_id)) {
    cardIndex.preferredPrintingByCardId.set(
      card.unique_id,
      Promise.resolve(resolvePreferredPrinting(card)).catch(() => null)
    );
  }

  return cardIndex.preferredPrintingByCardId.get(card.unique_id);
}

export async function restoreSavedDeckCards({ savedEntries = [], cardIndex, resolvePreferredPrinting } = {}) {
  if (!cardIndex || !Array.isArray(savedEntries) || savedEntries.length === 0) {
    return [];
  }

  const restoredCards = await Promise.all(
    savedEntries.map(async (savedEntry) => {
      const baseCard = findSavedDeckCard(cardIndex, savedEntry);

      if (!baseCard) {
        return null;
      }

      const restoredPrinting =
        findSavedDeckPrinting(baseCard, savedEntry) ||
        (await getPreferredPrinting(cardIndex, baseCard, resolvePreferredPrinting));

      if (!restoredPrinting) {
        return null;
      }

      return {
        card: baseCard,
        printing: restoredPrinting,
        isSideboard: Boolean(savedEntry?.isSideboard),
        zone: savedEntry?.isSideboard ? 'collection' : undefined,
      };
    })
  );

  return restoredCards.filter(Boolean);
}
