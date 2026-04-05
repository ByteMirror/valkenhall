const ELEMENT_ORDER = ['Water', 'Earth', 'Fire', 'Air'];
const TYPE_ORDER = ['Minion', 'Magic', 'Aura', 'Artifact'];
const RARITY_ORDER = ['Ordinary', 'Exceptional', 'Elite', 'Unique'];

export const ELEMENT_FILLS = {
  Water: 'var(--color-blue-chart)',
  Earth: 'var(--color-chart-3)',
  Fire: 'var(--color-red-chart)',
  Air: 'var(--color-yellow-chart)',
};

const CHART_PALETTE = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-red-chart)',
];

const THRESHOLD_FIELDS = {
  Water: 'waterThreshold',
  Earth: 'earthThreshold',
  Fire: 'fireThreshold',
  Air: 'airThreshold',
};

export function getCardZone(entry) {
  if (entry?.zone) return entry.zone;
  const category = entry?.card?._sorceryCategory;
  if (category === 'Site') return 'atlas';
  if (category === 'Avatar') return 'avatar';
  if (category === 'Spell') return 'spellbook';
  return '';
}

export function getCardElements(card) {
  const elements = card?.elements;
  if (!Array.isArray(elements)) return [];
  return elements.map((el) => (typeof el === 'string' ? { id: el.toLowerCase(), name: el } : el));
}

export function getSorceryRarityLabel(rarity) {
  return String(rarity || '').trim() || 'Ordinary';
}

function incrementCount(map, label, value = 1) {
  if (!label) return;
  map.set(label, (map.get(label) || 0) + value);
}

function formatAverage(total, count) {
  return count === 0 ? '0.00' : (total / count).toFixed(2);
}

function buildBarChartData(sourceMap, fillSelector, sortFn) {
  return [...sourceMap.entries()]
    .sort(sortFn)
    .map(([label, value], index) => ({ label, value, fill: fillSelector(label, index) }));
}

function orderIndexOf(array, label) {
  const idx = array.indexOf(label);
  return idx === -1 ? array.length : idx;
}

export function buildSorceryDeckMetrics(chosenCards) {
  const entries = Array.isArray(chosenCards) ? chosenCards : [];
  const spellbookEntries = entries.filter((e) => getCardZone(e) === 'spellbook');
  const atlasEntries = entries.filter((e) => getCardZone(e) === 'atlas');

  const elementCounts = new Map();
  const costCounts = new Map();
  const typeCounts = new Map();
  const rarityCounts = new Map();

  const thresholdDemand = {};
  const thresholdSupply = {};

  let totalCost = 0;
  let costCount = 0;

  for (const entry of spellbookEntries) {
    const card = entry?.card;
    if (!card) continue;

    for (const el of getCardElements(card)) {
      const name = el?.name;
      if (name) incrementCount(elementCounts, name);
    }

    const cost = Number(card.cost);
    if (Number.isFinite(cost)) {
      totalCost += cost;
      costCount += 1;
      incrementCount(costCounts, String(cost));
    }

    const type = card.type;
    if (type) incrementCount(typeCounts, type);

    const rarity = getSorceryRarityLabel(card.rarity);
    incrementCount(rarityCounts, rarity);

    for (const [element, field] of Object.entries(THRESHOLD_FIELDS)) {
      const demand = Number(card[field] || 0);
      if (demand > 0) {
        thresholdDemand[element] = Math.max(thresholdDemand[element] || 0, demand);
      }
    }
  }

  for (const entry of atlasEntries) {
    const card = entry?.card;
    if (!card) continue;

    for (const el of getCardElements(card)) {
      const name = el?.name;
      if (name) {
        thresholdSupply[name] = (thresholdSupply[name] || 0) + 1;
      }
    }
  }

  return {
    totals: {
      spellbookSize: spellbookEntries.length,
      atlasSize: atlasEntries.length,
    },
    averages: {
      cost: formatAverage(totalCost, costCount),
    },
    thresholds: {
      demand: thresholdDemand,
      supply: thresholdSupply,
    },
    charts: {
      elements: buildBarChartData(
        elementCounts,
        (label) => ELEMENT_FILLS[label] || CHART_PALETTE[0],
        (a, b) => orderIndexOf(ELEMENT_ORDER, a[0]) - orderIndexOf(ELEMENT_ORDER, b[0])
      ),
      cost: buildBarChartData(
        costCounts,
        (_label, index) => CHART_PALETTE[index % CHART_PALETTE.length],
        (a, b) => Number(a[0]) - Number(b[0])
      ),
      types: buildBarChartData(
        typeCounts,
        (_label, index) => CHART_PALETTE[index % CHART_PALETTE.length],
        (a, b) => orderIndexOf(TYPE_ORDER, a[0]) - orderIndexOf(TYPE_ORDER, b[0])
      ).filter((e) => e.value > 0),
      rarity: buildBarChartData(
        rarityCounts,
        (_label, index) => CHART_PALETTE[index % CHART_PALETTE.length],
        (a, b) => orderIndexOf(RARITY_ORDER, a[0]) - orderIndexOf(RARITY_ORDER, b[0])
      ),
    },
  };
}
