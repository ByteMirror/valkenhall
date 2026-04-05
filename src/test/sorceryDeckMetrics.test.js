import { describe, expect, it } from 'bun:test';
import { buildSorceryDeckMetrics } from '../utils/sorcery/deckMetrics';

function makeCard({ name, type, category, cost, elements, rarity, waterThreshold, earthThreshold, fireThreshold, airThreshold }) {
  return {
    name, slug: name.toLowerCase().replace(/\s+/g, '_'),
    type: type || 'Minion', category: category || 'Spell', rarity: rarity || 'Ordinary',
    cost: cost ?? 0, attack: 0, defense: 0, life: 0,
    waterThreshold: waterThreshold || 0, earthThreshold: earthThreshold || 0,
    fireThreshold: fireThreshold || 0, airThreshold: airThreshold || 0,
    elements: elements || [], rulesText: '', sets: [],
  };
}

function makeEntry(card, zone = 'spellbook') {
  return { card, zone, variant: null };
}

describe('Sorcery Deck Metrics', () => {
  it('computes spellbook size and atlas size', () => {
    const entries = [
      makeEntry(makeCard({ name: 'A', type: 'Minion', category: 'Spell', cost: 2 }), 'spellbook'),
      makeEntry(makeCard({ name: 'B', type: 'Minion', category: 'Spell', cost: 3 }), 'spellbook'),
      makeEntry(makeCard({ name: 'C', type: 'Site', category: 'Site', cost: 0 }), 'atlas'),
    ];
    const metrics = buildSorceryDeckMetrics(entries);
    expect(metrics.totals.spellbookSize).toBe(2);
    expect(metrics.totals.atlasSize).toBe(1);
  });

  it('computes element distribution', () => {
    const entries = [
      makeEntry(makeCard({ name: 'A', elements: [{ id: 'water', name: 'Water' }] })),
      makeEntry(makeCard({ name: 'B', elements: [{ id: 'water', name: 'Water' }] })),
      makeEntry(makeCard({ name: 'C', elements: [{ id: 'fire', name: 'Fire' }] })),
    ];
    const metrics = buildSorceryDeckMetrics(entries);
    const waterEntry = metrics.charts.elements.find((e) => e.label === 'Water');
    const fireEntry = metrics.charts.elements.find((e) => e.label === 'Fire');
    expect(waterEntry.value).toBe(2);
    expect(fireEntry.value).toBe(1);
  });

  it('computes cost curve', () => {
    const entries = [
      makeEntry(makeCard({ name: 'A', cost: 1 })),
      makeEntry(makeCard({ name: 'B', cost: 1 })),
      makeEntry(makeCard({ name: 'C', cost: 3 })),
    ];
    const metrics = buildSorceryDeckMetrics(entries);
    const cost1 = metrics.charts.cost.find((e) => e.label === '1');
    const cost3 = metrics.charts.cost.find((e) => e.label === '3');
    expect(cost1.value).toBe(2);
    expect(cost3.value).toBe(1);
  });

  it('computes card type breakdown', () => {
    const entries = [
      makeEntry(makeCard({ name: 'A', type: 'Minion' })),
      makeEntry(makeCard({ name: 'B', type: 'Magic' })),
      makeEntry(makeCard({ name: 'C', type: 'Minion' })),
    ];
    const metrics = buildSorceryDeckMetrics(entries);
    const minionEntry = metrics.charts.types.find((e) => e.label === 'Minion');
    const magicEntry = metrics.charts.types.find((e) => e.label === 'Magic');
    expect(minionEntry.value).toBe(2);
    expect(magicEntry.value).toBe(1);
  });

  it('computes threshold demand and supply', () => {
    const entries = [
      makeEntry(makeCard({ name: 'A', waterThreshold: 2, fireThreshold: 1 }), 'spellbook'),
      makeEntry(makeCard({ name: 'B', waterThreshold: 3 }), 'spellbook'),
      makeEntry(makeCard({ name: 'Site1', type: 'Site', category: 'Site', elements: [{ id: 'water', name: 'Water' }] }), 'atlas'),
      makeEntry(makeCard({ name: 'Site2', type: 'Site', category: 'Site', elements: [{ id: 'water', name: 'Water' }] }), 'atlas'),
      makeEntry(makeCard({ name: 'Site3', type: 'Site', category: 'Site', elements: [{ id: 'fire', name: 'Fire' }] }), 'atlas'),
    ];
    const metrics = buildSorceryDeckMetrics(entries);
    expect(metrics.thresholds.demand.Water).toBe(3);
    expect(metrics.thresholds.demand.Fire).toBe(1);
    expect(metrics.thresholds.supply.Water).toBe(2);
    expect(metrics.thresholds.supply.Fire).toBe(1);
  });

  it('returns empty metrics for empty input', () => {
    const metrics = buildSorceryDeckMetrics([]);
    expect(metrics.totals.spellbookSize).toBe(0);
    expect(metrics.totals.atlasSize).toBe(0);
    expect(metrics.charts.elements).toHaveLength(0);
  });
});
