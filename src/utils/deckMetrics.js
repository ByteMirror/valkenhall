const HERO_ARENA_TYPES = new Set(['Hero', 'Equipment', 'Weapon', 'Off-Hand', 'Ally', 'Aura', 'Item', 'Landmark']);
const RARITY_LABELS = {
  C: 'Common',
  R: 'Rare',
  M: 'Majestic',
  L: 'Legendary',
  F: 'Fabled',
  T: 'Token',
  P: 'Promo',
  S: 'Specialization',
  V: 'Marvel',
};

function hasType(card, value) {
  if (!Array.isArray(card?.types)) {
    return false;
  }

  const pattern = new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return card.types.some((type) => type === value || pattern.test(String(type)));
}

function isHeroArenaCard(card) {
  return Array.isArray(card?.types) && card.types.some((type) => HERO_ARENA_TYPES.has(type));
}

function isExplicitSideboardEntry(entry) {
  return Boolean(entry?.isSideboard);
}

export function isAttackActionCard(card) {
  return hasType(card, 'Action') && hasType(card, 'Attack');
}

export function isNonAttackActionCard(card) {
  return hasType(card, 'Action') && !hasType(card, 'Attack');
}

function parseStat(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function incrementCount(map, label, value = 1) {
  if (!label) {
    return;
  }

  map.set(label, (map.get(label) || 0) + value);
}

function formatAverage(total, count) {
  if (count === 0) {
    return '0.00';
  }

  return (total / count).toFixed(2);
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function combination(n, k) {
  if (k < 0 || k > n) {
    return 0;
  }

  if (k === 0 || k === n) {
    return 1;
  }

  const limit = Math.min(k, n - k);
  let result = 1;

  for (let index = 1; index <= limit; index += 1) {
    result = (result * (n - limit + index)) / index;
  }

  return result;
}

function hypergeometricProbability(totalCards, matchingCards, draws, matches) {
  if (
    totalCards <= 0 ||
    matchingCards < 0 ||
    matchingCards > totalCards ||
    draws < 0 ||
    draws > totalCards ||
    matches < 0 ||
    matches > draws ||
    matches > matchingCards
  ) {
    return 0;
  }

  const misses = draws - matches;
  const remainingCards = totalCards - matchingCards;

  if (misses > remainingCards) {
    return 0;
  }

  const numerator = combination(matchingCards, matches) * combination(remainingCards, misses);
  const denominator = combination(totalCards, draws);

  if (denominator === 0) {
    return 0;
  }

  return numerator / denominator;
}

function normalizeKeyword(keyword) {
  return String(keyword || '').trim().replace(/\s+/g, ' ');
}

export function extractKeywords(card) {
  const keywords = new Set();

  for (const keyword of card?.card_keywords || []) {
    const normalized = normalizeKeyword(keyword);
    if (normalized) {
      keywords.add(normalized);
    }
  }

  const text = String(card?.functional_text_plain || card?.functional_text || '');

  if (/go again/i.test(text)) {
    keywords.add('Go again');
  }

  if (/blood debt/i.test(text)) {
    keywords.add('Blood Debt');
  }

  const arcaneBarrierMatches = text.match(/arcane barrier\s*\d+/gi) || [];
  for (const match of arcaneBarrierMatches) {
    const normalized = normalizeKeyword(match).replace(/^arcane barrier/i, 'Arcane Barrier');
    keywords.add(normalized);
  }

  return [...keywords];
}

export function getRarityLabel(printing) {
  const code = String(printing?.rarity || '').trim().toUpperCase();
  return RARITY_LABELS[code] || (code ? code : 'Unknown');
}

export function getPitchLabel(card) {
  const pitch = String(card?.pitch || '').trim();

  if (pitch === '1') {
    return 'Red';
  }

  if (pitch === '2') {
    return 'Yellow';
  }

  if (pitch === '3') {
    return 'Blue';
  }

  return '';
}

function buildBarChartData(sourceMap, fillSelector, sortFn) {
  return [...sourceMap.entries()]
    .sort(sortFn)
    .map(([label, value], index) => ({
      label,
      value,
      fill: fillSelector(label, index),
    }));
}

function buildHandProbabilityRow(label, count, drawableDeckSize, handSize) {
  return {
    label,
    count,
    probabilities: Array.from({ length: 5 }, (_, matches) => {
      if (matches > handSize) {
        return '0%';
      }

      return formatPercent(hypergeometricProbability(drawableDeckSize, count, handSize, matches));
    }),
  };
}

export function buildDeckMetrics(chosenCards) {
  const entries = Array.isArray(chosenCards) ? chosenCards : [];
  const drawableEntries = entries.filter((entry) => !isHeroArenaCard(entry?.card) && !isExplicitSideboardEntry(entry));
  const handSize = Math.min(4, drawableEntries.length);

  let attackActions = 0;
  let nonAttackActions = 0;
  let defenseReactions = 0;
  let instants = 0;
  let heroArenaCards = 0;
  let sideboardCards = 0;
  let arcaneBarrierTotal = 0;

  let totalCost = 0;
  let totalPitch = 0;
  let totalPower = 0;
  let totalDefense = 0;
  let totalArcane = 0;

  let costCount = 0;
  let pitchCount = 0;
  let powerCount = 0;
  let defenseCount = 0;
  let arcaneCount = 0;

  const pitchCounts = new Map();
  const costCounts = new Map();
  const keywordCounts = new Map();
  const rarityCounts = new Map();
  const typeCounts = new Map([
    ['Action', 0],
    ['Attack', 0],
    ['Aura', 0],
    ['Defense Reaction', 0],
    ['Instant', 0],
    ['Non-Attack', 0],
  ]);

  for (const entry of entries) {
    const card = entry?.card;
    const printing = entry?.printing;

    if (!card) {
      continue;
    }

    if (isHeroArenaCard(card)) {
      heroArenaCards += 1;
    }

    if (isExplicitSideboardEntry(entry)) {
      sideboardCards += 1;
    }

    if (isAttackActionCard(card)) {
      attackActions += 1;
      incrementCount(typeCounts, 'Attack');
    }

    if (isNonAttackActionCard(card)) {
      nonAttackActions += 1;
      incrementCount(typeCounts, 'Non-Attack');
    }

    if (hasType(card, 'Action')) {
      incrementCount(typeCounts, 'Action');
    }

    if (hasType(card, 'Aura')) {
      incrementCount(typeCounts, 'Aura');
    }

    if (hasType(card, 'Defense Reaction')) {
      defenseReactions += 1;
      incrementCount(typeCounts, 'Defense Reaction');
    }

    if (hasType(card, 'Instant')) {
      instants += 1;
      incrementCount(typeCounts, 'Instant');
    }

    const cost = parseStat(card.cost);
    if (cost !== null) {
      totalCost += cost;
      costCount += 1;
      incrementCount(costCounts, String(cost));
    }

    const pitch = parseStat(card.pitch);
    if (pitch !== null) {
      totalPitch += pitch;
      pitchCount += 1;
      incrementCount(pitchCounts, getPitchLabel(card));
    }

    const power = parseStat(card.power);
    if (power !== null) {
      totalPower += power;
      powerCount += 1;
    }

    const defense = parseStat(card.defense);
    if (defense !== null) {
      totalDefense += defense;
      defenseCount += 1;
    }

    const arcane = parseStat(card.arcane);
    if (arcane !== null) {
      totalArcane += arcane;
      arcaneCount += 1;
    }

    for (const keyword of extractKeywords(card)) {
      incrementCount(keywordCounts, keyword);

      const barrierMatch = keyword.match(/^Arcane Barrier\s+(\d+)$/i);
      if (barrierMatch) {
        arcaneBarrierTotal += Number(barrierMatch[1]);
      }
    }

    incrementCount(rarityCounts, getRarityLabel(printing));
  }

  const probabilitySources = [
    { label: 'Red', count: drawableEntries.filter((entry) => getPitchLabel(entry.card) === 'Red').length },
    { label: 'Yellow', count: drawableEntries.filter((entry) => getPitchLabel(entry.card) === 'Yellow').length },
    { label: 'Blue', count: drawableEntries.filter((entry) => getPitchLabel(entry.card) === 'Blue').length },
    { label: 'Attack', count: drawableEntries.filter((entry) => isAttackActionCard(entry.card)).length },
    { label: 'Non-Attack', count: drawableEntries.filter((entry) => isNonAttackActionCard(entry.card)).length },
    { label: 'Defense Reaction', count: drawableEntries.filter((entry) => hasType(entry.card, 'Defense Reaction')).length },
    { label: 'Instant', count: drawableEntries.filter((entry) => hasType(entry.card, 'Instant')).length },
    { label: 'Go again', count: drawableEntries.filter((entry) => extractKeywords(entry.card).includes('Go again')).length },
    { label: 'Blood Debt', count: drawableEntries.filter((entry) => extractKeywords(entry.card).includes('Blood Debt')).length },
  ];

  return {
    totals: {
      deckSize: entries.length,
      drawableDeckSize: drawableEntries.length,
      attackActions,
      nonAttackActions,
      defenseReactions,
      instants,
      heroArenaCards,
      sideboardCards,
      keywordCount: keywordCounts.size,
      arcaneBarrierTotal,
    },
    averages: {
      cost: formatAverage(totalCost, costCount),
      pitch: formatAverage(totalPitch, pitchCount),
      power: formatAverage(totalPower, powerCount),
      defense: formatAverage(totalDefense, defenseCount),
      arcane: formatAverage(totalArcane, arcaneCount),
    },
    charts: {
      types: buildBarChartData(
        typeCounts,
        (_label, index) => ['var(--color-chart-1)', 'var(--color-chart-2)', 'var(--color-chart-3)', 'var(--color-chart-4)', 'var(--color-chart-5)', 'var(--color-red-chart)'][index % 6],
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
      ).filter((entry) => entry.value > 0),
      pitch: buildBarChartData(
        pitchCounts,
        (label) => {
          if (label === 'Red') {
            return 'var(--color-red-chart)';
          }

          if (label === 'Yellow') {
            return 'var(--color-yellow-chart)';
          }

          return 'var(--color-blue-chart)';
        },
        (left, right) => {
          const order = ['Red', 'Yellow', 'Blue'];
          return order.indexOf(left[0]) - order.indexOf(right[0]);
        }
      ),
      cost: buildBarChartData(
        costCounts,
        (label) => {
          const numeric = Number(label);
          const palette = ['var(--color-chart-3)', 'var(--color-chart-4)', 'var(--color-chart-5)', 'var(--color-red-chart)', 'var(--color-yellow-chart)', 'var(--color-blue-chart)'];
          return palette[Math.max(0, Math.min(numeric, palette.length - 1))];
        },
        (left, right) => Number(left[0]) - Number(right[0])
      ),
      keywords: buildBarChartData(
        keywordCounts,
        (_label, index) => ['var(--color-red-chart)', 'var(--color-yellow-chart)', 'var(--color-blue-chart)', 'var(--color-chart-2)', 'var(--color-chart-4)', 'var(--color-chart-5)'][index % 6],
        (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
      ).slice(0, 6),
      rarity: buildBarChartData(
        rarityCounts,
        (label) => {
          if (label === 'Common') {
            return 'var(--color-chart-1)';
          }

          if (label === 'Rare') {
            return 'var(--color-chart-3)';
          }

          if (label === 'Majestic') {
            return 'var(--color-chart-5)';
          }

          return 'var(--color-chart-2)';
        },
        (left, right) => {
          const order = ['Token', 'Common', 'Rare', 'Majestic', 'Legendary', 'Fabled', 'Marvel', 'Promo', 'Specialization', 'Unknown'];
          return order.indexOf(left[0]) - order.indexOf(right[0]);
        }
      ),
    },
    handSize,
    handProbabilities: probabilitySources
      .filter((entry) => entry.count > 0)
      .map((entry) => buildHandProbabilityRow(entry.label, entry.count, drawableEntries.length, handSize)),
  };
}
