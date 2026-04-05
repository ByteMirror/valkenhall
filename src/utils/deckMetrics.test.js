import { describe, expect, it } from 'bun:test';
import { buildDeckMetrics } from './deckMetrics';

function createEntry({
  name,
  color = '',
  pitch = '',
  cost = '',
  power = '',
  defense = '',
  arcane = '',
  types = [],
  cardKeywords = [],
  rarity = 'C',
}) {
  return {
    card: {
      unique_id: `${name}-card`,
      name,
      color,
      pitch,
      cost,
      power,
      defense,
      arcane,
      types,
      card_keywords: cardKeywords,
    },
    printing: {
      unique_id: `${name}-printing`,
      rarity,
    },
  };
}

describe('buildDeckMetrics', () => {
  it('derives reliable summary stats, chart data, and hand probabilities from chosen cards', () => {
    const chosenCards = [
      createEntry({
        name: 'Scar for a Scar',
        color: 'Red',
        pitch: '1',
        cost: '1',
        power: '3',
        defense: '2',
        types: ['Ninja', 'Action', 'Attack'],
        cardKeywords: ['Go again'],
        rarity: 'C',
      }),
      createEntry({
        name: 'Ravenous Rabble',
        color: 'Red',
        pitch: '1',
        cost: '2',
        power: '4',
        defense: '3',
        types: ['Brute', 'Action', 'Attack'],
        rarity: 'R',
      }),
      createEntry({
        name: 'Seeds of Agony',
        color: 'Yellow',
        pitch: '2',
        cost: '0',
        defense: '3',
        types: ['Shadow', 'Action'],
        cardKeywords: ['Blood Debt'],
        rarity: 'C',
      }),
      createEntry({
        name: 'Sink Below',
        color: 'Blue',
        pitch: '3',
        cost: '2',
        defense: '4',
        types: ['Generic', 'Defense Reaction'],
        rarity: 'M',
      }),
      createEntry({
        name: 'Aether Quickening',
        color: 'Red',
        pitch: '1',
        cost: '0',
        arcane: '2',
        types: ['Wizard', 'Instant'],
        rarity: 'R',
      }),
      createEntry({
        name: 'Nullrune Hood',
        defense: '1',
        types: ['Equipment', 'Head'],
        cardKeywords: ['Arcane Barrier 1'],
        rarity: 'C',
      }),
    ];

    const metrics = buildDeckMetrics(chosenCards);

    expect(metrics.totals).toEqual(expect.objectContaining({
      deckSize: 6,
      drawableDeckSize: 5,
      attackActions: 2,
      nonAttackActions: 1,
      defenseReactions: 1,
      instants: 1,
      heroArenaCards: 1,
      sideboardCards: 0,
    }));

    expect(metrics.averages).toEqual(expect.objectContaining({
      cost: '1.00',
      pitch: '1.60',
      power: '3.50',
      defense: '2.60',
      arcane: '2.00',
    }));

    expect(metrics.charts.pitch).toEqual([
      { label: 'Red', value: 3, fill: 'var(--color-red-chart)' },
      { label: 'Yellow', value: 1, fill: 'var(--color-yellow-chart)' },
      { label: 'Blue', value: 1, fill: 'var(--color-blue-chart)' },
    ]);

    expect(metrics.charts.cost).toEqual([
      { label: '0', value: 2, fill: 'var(--color-chart-3)' },
      { label: '1', value: 1, fill: 'var(--color-chart-4)' },
      { label: '2', value: 2, fill: 'var(--color-chart-5)' },
    ]);

    expect(metrics.charts.keywords).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'Go again', value: 1 }),
      expect.objectContaining({ label: 'Blood Debt', value: 1 }),
      expect.objectContaining({ label: 'Arcane Barrier 1', value: 1 }),
    ]));

    expect(metrics.charts.rarity).toEqual([
      { label: 'Common', value: 3, fill: 'var(--color-chart-1)' },
      { label: 'Rare', value: 2, fill: 'var(--color-chart-3)' },
      { label: 'Majestic', value: 1, fill: 'var(--color-chart-5)' },
    ]);

    expect(metrics.handProbabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'Red',
        count: 3,
        probabilities: ['0%', '0%', '60%', '40%', '0%'],
      }),
      expect.objectContaining({
        label: 'Attack',
        count: 2,
        probabilities: ['0%', '40%', '60%', '0%', '0%'],
      }),
    ]));
  });

  it('tracks explicit sideboard entries separately from the drawable deck', () => {
    const metrics = buildDeckMetrics([
      createEntry({
        name: 'Main Deck Red',
        pitch: '1',
        cost: '1',
        power: '3',
        defense: '2',
        types: ['Action', 'Attack'],
      }),
      {
        ...createEntry({
          name: 'Sideboard Blue',
          pitch: '3',
          cost: '0',
          defense: '3',
          types: ['Action'],
        }),
        isSideboard: true,
      },
    ]);

    expect(metrics.totals).toEqual(expect.objectContaining({
      deckSize: 2,
      drawableDeckSize: 1,
      sideboardCards: 1,
    }));
  });
});
