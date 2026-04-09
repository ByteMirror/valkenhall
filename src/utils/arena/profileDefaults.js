export function isArenaDebugMode() {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('arena_debug') === 'fabdev';
  } catch {
    return false;
  }
}

export const CURRENCY = {
  WIN_REWARD: 100,
  LOSS_REWARD: 50,
  SELL_ORDINARY: 2,
  SELL_EXCEPTIONAL: 5,
  SELL_ELITE: 10,
  SELL_UNIQUE: 25,
  PACK_PRICE: 50,
};

// Arcana Shards: secondary currency for targeted, single-card purchases.
// Mirrors the server's authoritative price table in
// valkenhall-server/src/utils/shardPrices.js — the server always validates
// the price on a purchase request, this is display-only.
export const SHARD_PRICES = {
  Ordinary: 25,
  Exceptional: 75,
  Elite: 100,
  Unique: 300,
};

export function shardPriceForRarity(rarity) {
  return SHARD_PRICES[rarity] ?? null;
}

export const SET_UNLOCK_LEVELS = {
  gothic: 1,
  arthurian: 15,
  beta: 30,
};

// Player level curve. Designed against the per-match XP rates the server
// hands out (currently 100 win / 50 loss flat — see
// valkenhall-server/src/utils/rewards.js). The curve is linear from L1
// up to L60 and flat after that, mirroring how most TCG arena games pace
// long-tail account progression:
//
//   - L2  ≈ 1 win or 2 losses           (~100 XP)
//   - L5  ≈ 7-10 matches                 (~550 XP cumulative)
//   - L10 ≈ 25-30 matches                (~1700 XP cumulative)
//   - L60 ≈ many hours of dedicated play (~47,000 XP cumulative)
//   - L100 endgame grind                 (~108,000 XP cumulative)
//
// When tuning the per-match XP, keep these matches-per-level numbers in
// mind so the level-up cadence stays the goal of the curve.
export const MAX_LEVEL = 100;
const XP_CAP_LEVEL = 60;

const XP_BASE = 100;
const XP_CAP = 1500;
const XP_STEP = (XP_CAP - XP_BASE) / (XP_CAP_LEVEL - 1);

function xpToNextLevel(level) {
  if (level < 1) return XP_BASE;
  if (level >= XP_CAP_LEVEL) return XP_CAP;
  return Math.floor(XP_BASE + XP_STEP * (level - 1));
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
    name: null,
    coins: 0,
    xp: 0,
    arcanaShards: 0,
    starterDeck: null,
    profileAvatar: null,
    serverToken: null,
    serverRegistered: false,
    rank: { tier: 'apprentice', division: 4, lp: 0 },
    collection: [],
    matchHistory: [],
    achievements: [],
    seasonProgress: null,
  };
}
