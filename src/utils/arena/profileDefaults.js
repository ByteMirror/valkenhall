export function isArenaDebugMode() {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('arena_debug') === 'fabdev';
  } catch {
    return false;
  }
}

export const CURRENCY = {
  WIN_REWARD: 400,
  LOSS_REWARD: 100,
  SELL_ORDINARY: 10,
  SELL_EXCEPTIONAL: 25,
  SELL_ELITE: 75,
  SELL_UNIQUE: 200,
  PACK_PRICE: 500,
};

export const XP = {
  PER_MINUTE: 10,
};

export const SET_UNLOCK_LEVELS = {
  gothic: 1,
  arthurian: 15,
  beta: 30,
};

export function xpForLevel(level) {
  return Math.floor(50 * level * (level + 1) / 2);
}

export function levelFromXp(xp) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export function xpProgressInLevel(xp) {
  const safeXp = Math.max(0, xp || 0);
  const level = levelFromXp(safeXp);
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const range = nextLevelXp - currentLevelXp;
  const current = Math.max(0, safeXp - currentLevelXp);
  return {
    level,
    current,
    needed: range,
    fraction: range > 0 ? current / range : 0,
  };
}

export function createDefaultProfile() {
  return {
    id: `arena-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: 'Player',
    coins: 0,
    xp: 0,
    starterDeck: null,
    profileAvatar: null,
    serverToken: null,
    serverRegistered: false,
    rank: { tier: 'apprentice', division: 4, lp: 0 },
    collection: [],
    decks: [],
    matchHistory: [],
    achievements: [],
  };
}
