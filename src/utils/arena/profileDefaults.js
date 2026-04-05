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

export const MAX_LEVEL = 100;
const XP_CAP_LEVEL = 60;

function xpToNextLevel(level) {
  if (level < 1) return 200;
  if (level >= XP_CAP_LEVEL) return 3500;
  // Starts at 200 XP (level 1→2, ~3 matches), scales up to 3500 at level 60
  return Math.floor(200 + 3300 * Math.pow((level - 1) / (XP_CAP_LEVEL - 1), 1.4));
}

const XP_TABLE = [];
(function buildXpTable() {
  let cumulative = 0;
  XP_TABLE[0] = 0;
  XP_TABLE[1] = 0;
  for (let lvl = 2; lvl <= MAX_LEVEL + 1; lvl++) {
    cumulative += xpToNextLevel(lvl - 1);
    XP_TABLE[lvl] = cumulative;
  }
})();

export function xpForLevel(level) {
  if (level <= 1) return 0;
  if (level > MAX_LEVEL + 1) return XP_TABLE[MAX_LEVEL + 1];
  return XP_TABLE[level];
}

export function levelFromXp(xp) {
  const safeXp = Math.max(0, xp || 0);
  for (let lvl = MAX_LEVEL; lvl >= 1; lvl--) {
    if (safeXp >= XP_TABLE[lvl]) return Math.min(lvl, MAX_LEVEL);
  }
  return 1;
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
