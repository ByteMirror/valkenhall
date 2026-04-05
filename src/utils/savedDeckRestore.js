function normalizeSavedDeckText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getPersistentPrintingId(printing) {
  return printing?._source_printing_id || printing?.unique_id || null;
}

function replacePrintingInCard(card, sourcePrintingId, nextPrinting) {
  if (!card || !sourcePrintingId || !nextPrinting) {
    return card;
  }

  const currentPrintings = Array.isArray(card.printings) ? card.printings : [];
  let didReplace = false;
  const nextPrintings = currentPrintings.map((printing) => {
    if (getPersistentPrintingId(printing) !== sourcePrintingId) {
      return printing;
    }

    didReplace = true;
    return nextPrinting;
  });

  return {
    ...card,
    printings: didReplace ? nextPrintings : [...nextPrintings, nextPrinting],
  };
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

function restoreUpscaledPrinting(card, savedEntry) {
  const upscaledVersion = savedEntry?.upscaledVersion;

  if (!card || !upscaledVersion?.imageUrl) {
    return null;
  }

  const sourcePrinting =
    findSavedDeckPrinting(card, { printingId: savedEntry.printingId }) ||
    card.printings?.find((printing) => printing.unique_id === savedEntry.printingId) ||
    null;

  if (!sourcePrinting) {
    return null;
  }

  const sourcePrintingId = getPersistentPrintingId(sourcePrinting) || savedEntry.printingId;

  const cachedUpscale = {
    sourceImageUrl: upscaledVersion.sourceImageUrl || sourcePrinting.image_url,
  };

  return {
    ...sourcePrinting,
    unique_id: `${sourcePrintingId}-upscaled-restored`,
    image_url: upscaledVersion.imageUrl,
    image_width: upscaledVersion.imageWidth || sourcePrinting.image_width,
    image_height: upscaledVersion.imageHeight || sourcePrinting.image_height,
    _source_image_url: upscaledVersion.sourceImageUrl || sourcePrinting.image_url,
    _source_printing_id: sourcePrintingId,
    _source_printing: { ...sourcePrinting, _cachedUpscale: cachedUpscale },
    _persisted_image_url: upscaledVersion.imageUrl,
    _upscaled: true,
  };
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

  const restoredUpscaledCards = new Map();

  const restoredCards = await Promise.all(
    savedEntries.map(async (savedEntry) => {
      const baseCard = findSavedDeckCard(cardIndex, savedEntry);

      if (!baseCard) {
        return null;
      }

      if (savedEntry?.cachedUpscale && !savedEntry?.upscaledVersion?.imageUrl) {
        const basePrinting =
          findSavedDeckPrinting(baseCard, savedEntry) ||
          (await getPreferredPrinting(cardIndex, baseCard, resolvePreferredPrinting));

        if (basePrinting) {
          return {
            card: baseCard,
            printing: { ...basePrinting, _cachedUpscale: savedEntry.cachedUpscale },
            isSideboard: Boolean(savedEntry?.isSideboard),
          };
        }
      }

      if (savedEntry?.upscaledVersion?.imageUrl) {
        const cacheKey = `${baseCard.unique_id}:${savedEntry.printingId}:${savedEntry.upscaledVersion.imageUrl}`;

        if (!restoredUpscaledCards.has(cacheKey)) {
          const upscaledPrinting = restoreUpscaledPrinting(baseCard, savedEntry);

          if (upscaledPrinting) {
            restoredUpscaledCards.set(cacheKey, {
              card: replacePrintingInCard(baseCard, savedEntry.printingId, upscaledPrinting),
              printing: upscaledPrinting,
            });
          }
        }

        const restoredUpscaledEntry = restoredUpscaledCards.get(cacheKey);

        if (restoredUpscaledEntry) {
          return {
            card: restoredUpscaledEntry.card,
            printing: restoredUpscaledEntry.printing,
            isSideboard: Boolean(savedEntry?.isSideboard),
            zone: savedEntry?.isSideboard ? 'collection' : undefined,
          };
        }
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
