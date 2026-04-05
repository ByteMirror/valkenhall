// Tracker type definitions — single source of truth for labels, structure, and limits

export const TRACKER_DEFS = {
  life: { label: 'Life Total', rows: ['ones', 'tens'], max: 99, positionsPerRow: 10 },
  mana: { label: 'Mana', rows: ['ones', 'tens'], max: 99, positionsPerRow: 10 },
  earth: { label: 'Earth', rows: null, max: 12, positionsPerRow: 14, integratedButton: true },
  water: { label: 'Water', rows: null, max: 12, positionsPerRow: 14, integratedButton: true },
  fire: { label: 'Fire', rows: null, max: 12, positionsPerRow: 14, integratedButton: true },
  wind: { label: 'Wind', rows: null, max: 12, positionsPerRow: 14, integratedButton: true },
};

export const PLAYERS = ['p1', 'p2'];
export const PLAYER_LABELS = { p1: 'P1', p2: 'P2' };

export function getTotalPositions(trackerKey) {
  const def = TRACKER_DEFS[trackerKey];
  if (def.rows) return def.positionsPerRow * def.rows.length;
  return def.positionsPerRow;
}

export function indexToRowPosition(trackerKey, flatIndex) {
  const def = TRACKER_DEFS[trackerKey];
  if (!def.rows) return { row: null, index: flatIndex };
  const perRow = def.positionsPerRow;
  if (flatIndex < perRow) return { row: 'ones', index: flatIndex };
  return { row: 'tens', index: flatIndex - perRow };
}

export function getTrackerProgressLabel(trackerKey, player, flatIndex) {
  const def = TRACKER_DEFS[trackerKey];
  const total = getTotalPositions(trackerKey);
  const { row, index } = indexToRowPosition(trackerKey, flatIndex);
  const playerLabel = PLAYER_LABELS[player];
  let rowSuffix;
  if (def.integratedButton && flatIndex === 0) {
    rowSuffix = ' (button position)';
  } else {
    rowSuffix = row ? ` (${row} row: ${index})` : ` (position ${index})`;
  }
  return `${def.label} ${playerLabel}: Set position ${flatIndex + 1} of ${total}${rowSuffix}`;
}

export function valueToPositions(trackerKey, value) {
  const def = TRACKER_DEFS[trackerKey];
  if (!def.rows) {
    // For integrated-button trackers, index 0 is the button — values start at index 1
    const offset = def.integratedButton ? 1 : 0;
    return [{ row: null, posIndex: value + offset }];
  }
  return [
    { row: 'ones', posIndex: value % 10 },
    { row: 'tens', posIndex: Math.floor(value / 10) },
  ];
}

export function trackerSpawnKey(trackerKey, player) {
  return `tracker_${trackerKey}_${player}`;
}

export function getTrackerSpawnEntries() {
  const entries = [];
  for (const [key, def] of Object.entries(TRACKER_DEFS)) {
    for (const player of PLAYERS) {
      entries.push({
        spawnKey: trackerSpawnKey(key, player),
        label: `${def.label} (${PLAYER_LABELS[player]})`,
        trackerKey: key,
        player,
        color: '#f97316',
      });
    }
  }
  return entries;
}
