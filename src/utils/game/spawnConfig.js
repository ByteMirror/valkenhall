import { getLocalApiOrigin } from '../localApi';

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

let cachedConfig = null;

export async function loadSpawnConfig() {
  if (cachedConfig) return cachedConfig;

  try {
    const res = await fetch(`${getLocalApiOrigin()}/api/game/spawn-config`);
    if (res.ok) {
      cachedConfig = await res.json();
      return cachedConfig;
    }
  } catch {
    // fall through to defaults
  }

  cachedConfig = { ...DEFAULT_SPAWN_POINTS };
  return cachedConfig;
}

export async function saveSpawnConfig(config) {
  cachedConfig = config;
  await fetch(`${getLocalApiOrigin()}/api/game/spawn-config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
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
    // Two-row tracker (life, mana)
    if (!config.trackers[player][trackerKey]) config.trackers[player][trackerKey] = {};
    if (!config.trackers[player][trackerKey][row]) config.trackers[player][trackerKey][row] = [];
    config.trackers[player][trackerKey][row][index] = point;
  } else {
    // Single-row tracker (elements)
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
