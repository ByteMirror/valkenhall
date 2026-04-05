import { describe, expect, it, vi } from 'bun:test';

import { createSavedDeckCardIndex, restoreSavedDeckCards } from './savedDeckRestore';

const cards = [
  {
    unique_id: 'card-1',
    name: 'Café Racer',
    printings: [
      { unique_id: 'printing-1' },
      { unique_id: 'printing-2' },
    ],
  },
  {
    unique_id: 'card-2',
    name: 'Bravo, Showstopper',
    printings: [{ unique_id: 'printing-3' }],
  },
];

describe('savedDeckRestore', () => {
  it('restores saved deck entries via indexed card lookups and caches preferred printings per card', async () => {
    const cardIndex = createSavedDeckCardIndex(cards);
    const resolvePreferredPrinting = vi.fn(async (card) => card.printings[card.printings.length - 1] || null);

    const restoredCards = await restoreSavedDeckCards({
      savedEntries: [
        { cardId: 'card-1', cardName: 'Cafe Racer', printingId: 'printing-1' },
        { cardId: 'missing-card-id', cardName: 'Cafe Racer', printingId: 'missing-printing' },
        { cardId: 'still-missing', cardName: 'Cafe Racer', printingId: 'still-missing', isSideboard: true },
        { cardId: 'card-2', cardName: 'Bravo, Showstopper', printingId: 'printing-3' },
        { cardId: 'missing', cardName: 'Unknown Card', printingId: 'missing' },
      ],
      cardIndex,
      resolvePreferredPrinting,
    });

    expect(restoredCards).toEqual([
      {
        card: cards[0],
        printing: cards[0].printings[0],
        isSideboard: false,
      },
      {
        card: cards[0],
        printing: cards[0].printings[1],
        isSideboard: false,
      },
      {
        card: cards[0],
        printing: cards[0].printings[1],
        isSideboard: true,
      },
      {
        card: cards[1],
        printing: cards[1].printings[0],
        isSideboard: false,
      },
    ]);
    expect(resolvePreferredPrinting).toHaveBeenCalledTimes(1);
    expect(resolvePreferredPrinting).toHaveBeenCalledWith(cards[0]);
  });
});
