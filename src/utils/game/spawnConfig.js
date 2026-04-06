const SPAWN_CONFIG = {"spellbook":{"x":87,"z":24.8},"atlas":{"x":87.3,"z":4.7},"avatar":{"x":-0.1,"z":40.4},"cemetery":{"x":87.1,"z":48.2},"spellbook2":{"x":-86.8,"z":-24.8},"atlas2":{"x":-87,"z":-5},"avatar2":{"x":0.2,"z":-41.3},"cemetery2":{"x":-86.4,"z":-47.3},"trackers":{"p1":{"life":{"ones":[{"x":10.6,"z":65.4},{"x":14.9,"z":65.5},{"x":18.9,"z":65.2},{"x":23.3,"z":65.5},{"x":27.5,"z":65.3},{"x":31.7,"z":65.4},{"x":36,"z":65.4},{"x":40.2,"z":65.4},{"x":44.3,"z":65.4},{"x":48.6,"z":65.4}],"tens":[{"x":10.7,"z":61.1},{"x":14.9,"z":61.2},{"x":19,"z":61.2},{"x":23.3,"z":61.3},{"x":27.6,"z":61.2},{"x":31.7,"z":61.2},{"x":36.1,"z":61.1},{"x":40.2,"z":61.2},{"x":44.4,"z":61.2},{"x":48.5,"z":61.1}]},"mana":{"ones":[{"x":-48.1,"z":65.3},{"x":-43.9,"z":65.3},{"x":-39.7,"z":65.3},{"x":-35.5,"z":65.3},{"x":-31.3,"z":65.3},{"x":-27.1,"z":65.3},{"x":-22.8,"z":65.3},{"x":-18.6,"z":65.3},{"x":-14.3,"z":65.3},{"x":-10.2,"z":65.3}],"tens":[{"x":-48.1,"z":61.1},{"x":-43.9,"z":61.1},{"x":-39.7,"z":61.2},{"x":-35.5,"z":61.1},{"x":-31.3,"z":61.1},{"x":-27,"z":61.1},{"x":-22.9,"z":61.1},{"x":-18.6,"z":61.1},{"x":-14.4,"z":61.1},{"x":-10.1,"z":61.1}]},"earth":[{"x":-95.1,"z":64.5},{"x":-95.1,"z":60.6},{"x":-95,"z":56.7},{"x":-95.1,"z":52.9},{"x":-95,"z":48.9},{"x":-95.1,"z":45},{"x":-95,"z":41.2},{"x":-95.1,"z":37.3},{"x":-95.1,"z":33.5},{"x":-95.1,"z":29.5},{"x":-95,"z":25.7},{"x":-95,"z":21.7},{"x":-95,"z":17.8},{"x":-95,"z":13.9}],"water":[{"x":-83.6,"z":64.5},{"x":-83.6,"z":60.7},{"x":-83.5,"z":56.8},{"x":-83.6,"z":52.8},{"x":-83.6,"z":49},{"x":-83.6,"z":45.1},{"x":-83.6,"z":41.1},{"x":-83.6,"z":37.3},{"x":-83.6,"z":33.4},{"x":-83.6,"z":29.3},{"x":-83.6,"z":25.5},{"x":-83.6,"z":21.6},{"x":-83.6,"z":17.8},{"x":-83.6,"z":13.9}],"fire":[{"x":-89.4,"z":64.5},{"x":-89.3,"z":60.6},{"x":-89.4,"z":56.8},{"x":-89.3,"z":52.8},{"x":-89.3,"z":49.1},{"x":-89.4,"z":45.1},{"x":-89.3,"z":41.2},{"x":-89.4,"z":37.3},{"x":-89.3,"z":33.4},{"x":-89.3,"z":29.5},{"x":-89.3,"z":25.5},{"x":-89.4,"z":21.6},{"x":-89.3,"z":17.6},{"x":-89.3,"z":13.8}],"wind":[{"x":-77.8,"z":64.6},{"x":-77.8,"z":60.8},{"x":-77.8,"z":56.8},{"x":-77.8,"z":52.9},{"x":-77.8,"z":49},{"x":-77.8,"z":45.1},{"x":-77.9,"z":41.2},{"x":-77.9,"z":37.3},{"x":-77.9,"z":33.3},{"x":-77.9,"z":29.5},{"x":-77.8,"z":25.6},{"x":-77.8,"z":21.6},{"x":-77.8,"z":17.9},{"x":-77.7,"z":13.9}]},"p2":{"life":{"ones":[{"x":-10.6,"z":-65.3},{"x":-14.8,"z":-65.1},{"x":-19.1,"z":-65.2},{"x":-23.3,"z":-65.1},{"x":-27.5,"z":-65.2},{"x":-31.7,"z":-65.1},{"x":-36,"z":-65.1},{"x":-40.2,"z":-65.1},{"x":-44.4,"z":-65.1},{"x":-48.5,"z":-65.1}],"tens":[{"x":-10.5,"z":-60.9},{"x":-14.9,"z":-61},{"x":-19.1,"z":-61},{"x":-23.3,"z":-60.9},{"x":-27.5,"z":-61},{"x":-31.7,"z":-61},{"x":-36,"z":-60.9},{"x":-40.1,"z":-60.8},{"x":-44.4,"z":-60.9},{"x":-48.6,"z":-60.9}]},"mana":{"ones":[{"x":48.1,"z":-64.9},{"x":43.9,"z":-64.9},{"x":39.7,"z":-64.8},{"x":35.4,"z":-64.8},{"x":31.3,"z":-64.9},{"x":27.1,"z":-64.8},{"x":22.9,"z":-64.8},{"x":18.5,"z":-64.9},{"x":14.4,"z":-64.8},{"x":10.2,"z":-64.8}],"tens":[{"x":48.1,"z":-60.8},{"x":44,"z":-60.7},{"x":39.8,"z":-60.7},{"x":35.5,"z":-60.7},{"x":31.3,"z":-60.7},{"x":27.1,"z":-60.7},{"x":22.8,"z":-60.7},{"x":18.6,"z":-60.7},{"x":14.3,"z":-60.7},{"x":10.3,"z":-60.7}]},"earth":[{"x":95.2,"z":-64.2},{"x":95.2,"z":-60.3},{"x":95.2,"z":-56.4},{"x":95.2,"z":-52.5},{"x":95.1,"z":-48.6},{"x":95.2,"z":-44.8},{"x":95.2,"z":-40.8},{"x":95.2,"z":-37},{"x":95.2,"z":-33.1},{"x":95.2,"z":-29.1},{"x":95.2,"z":-25.2},{"x":95.2,"z":-21.3},{"x":95.2,"z":-17.4},{"x":95.2,"z":-13.6}],"water":[{"x":83.7,"z":-64.1},{"x":83.7,"z":-60.3},{"x":83.7,"z":-56.3},{"x":83.7,"z":-52.5},{"x":83.7,"z":-48.6},{"x":83.7,"z":-44.7},{"x":83.7,"z":-40.8},{"x":83.7,"z":-36.9},{"x":83.7,"z":-33.1},{"x":83.7,"z":-29.2},{"x":83.7,"z":-25.2},{"x":83.7,"z":-21.3},{"x":83.7,"z":-17.4},{"x":83.7,"z":-13.6}],"fire":[{"x":89.4,"z":-64.2},{"x":89.4,"z":-60.3},{"x":89.4,"z":-56.4},{"x":89.4,"z":-52.5},{"x":89.5,"z":-48.6},{"x":89.4,"z":-44.7},{"x":89.4,"z":-40.8},{"x":89.4,"z":-36.9},{"x":89.5,"z":-33.1},{"x":89.5,"z":-29.2},{"x":89.4,"z":-25.3},{"x":89.5,"z":-21.4},{"x":89.4,"z":-17.5},{"x":89.4,"z":-13.6}],"wind":[{"x":78,"z":-64.2},{"x":78,"z":-60.3},{"x":78,"z":-56.4},{"x":78,"z":-52.5},{"x":78,"z":-48.6},{"x":78,"z":-44.7},{"x":78,"z":-40.8},{"x":77.9,"z":-36.9},{"x":78,"z":-33},{"x":78,"z":-29.1},{"x":77.9,"z":-25.2},{"x":78,"z":-21.3},{"x":78,"z":-17.5},{"x":77.9,"z":-13.5}]}},"collection":{"x":113.3,"z":24.5},"collection2":{"x":-115.1,"z":-25.1},"gameGrid":{"topLeft":{"x":-72.7438650891987,"z":-58.09901112994292},"topRight":{"x":72.65404066326956,"z":-58.09901112994292},"bottomLeft":{"x":-72.7438650891987,"z":58.00108564307199},"bottomRight":{"x":72.65404066326956,"z":58.00108564307199},"cols":5,"rows":4,"colDividers":[0.2,0.4,0.6,0.8],"rowDividers":[0.25,0.5,0.75]}};

const DEFAULT_SPAWN_POINTS = {
  spellbook: { x: 70, z: 45 },
  atlas: { x: 70, z: 15 },
  avatar: { x: 70, z: -15 },
  cemetery: { x: 70, z: -45 },
  collection: { x: 85, z: 0 },
  spellbook2: { x: -70, z: -45 },
  atlas2: { x: -70, z: -15 },
  avatar2: { x: -70, z: 15 },
  cemetery2: { x: -70, z: 45 },
  collection2: { x: -85, z: 0 },
};

const SPAWN_LABELS = {
  spellbook: 'Spellbook (P1)',
  atlas: 'Atlas (P1)',
  avatar: 'Avatar (P1)',
  cemetery: 'Cemetery (P1)',
  collection: 'Collection (P1)',
  spellbook2: 'Spellbook (P2)',
  atlas2: 'Atlas (P2)',
  avatar2: 'Avatar (P2)',
  cemetery2: 'Cemetery (P2)',
  collection2: 'Collection (P2)',
};

const SPAWN_COLORS = {
  spellbook: '#a855f7',
  atlas: '#22c55e',
  avatar: '#eab308',
  cemetery: '#ef4444',
  collection: '#3b82f6',
  spellbook2: '#a855f7',
  atlas2: '#22c55e',
  avatar2: '#eab308',
  cemetery2: '#ef4444',
  collection2: '#3b82f6',
};

export async function loadSpawnConfig() {
  return { ...SPAWN_CONFIG };
}

export function getSpawnPoint(config, key) {
  return config?.[key] || DEFAULT_SPAWN_POINTS[key] || { x: 0, z: 0 };
}

export function getTrackerPositions(config, player, trackerKey) {
  return config?.trackers?.[player]?.[trackerKey] || null;
}

export function setTrackerPosition(config, player, trackerKey, row, index, point) {
  if (!config.trackers) config.trackers = {};
  if (!config.trackers[player]) config.trackers[player] = {};

  if (row) {
    if (!config.trackers[player][trackerKey]) config.trackers[player][trackerKey] = {};
    if (!config.trackers[player][trackerKey][row]) config.trackers[player][trackerKey][row] = [];
    config.trackers[player][trackerKey][row][index] = point;
  } else {
    if (!Array.isArray(config.trackers[player][trackerKey])) config.trackers[player][trackerKey] = [];
    config.trackers[player][trackerKey][index] = point;
  }
}

export function isTrackerConfigured(config, player, trackerKey, def) {
  const data = getTrackerPositions(config, player, trackerKey);
  if (!data) return false;
  if (def.rows) {
    return def.rows.every((row) => Array.isArray(data[row]) && data[row].length === def.positionsPerRow);
  }
  return Array.isArray(data) && data.length === def.positionsPerRow;
}

export function getTrackerTokenPosition(config, player, trackerKey, row, posIndex) {
  const data = getTrackerPositions(config, player, trackerKey);
  if (!data) return null;
  if (row) return data[row]?.[posIndex] || null;
  return data[posIndex] || null;
}

export function getGameGrid(config) {
  return config?.gameGrid || null;
}

export function setGameGrid(config, grid) {
  if (grid) {
    config.gameGrid = grid;
  } else {
    delete config.gameGrid;
  }
}

export { DEFAULT_SPAWN_POINTS, SPAWN_LABELS, SPAWN_COLORS };
