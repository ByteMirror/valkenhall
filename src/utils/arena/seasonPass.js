const CYCLE_DAYS = 14;
const CYCLE_EPOCH = new Date('2026-01-05T00:00:00Z').getTime();
const SETS = ['gothic', 'arthurian', 'beta'];

const TIER_TABLE = [
  { level: 1,  xpRequired: 200,   reward: { coins: 50 } },
  { level: 2,  xpRequired: 500,   reward: { coins: 100 } },
  { level: 3,  xpRequired: 900,   reward: { foilRarity: 'Elite', foilIndex: 0 } },
  { level: 4,  xpRequired: 1400,  reward: { coins: 75 } },
  { level: 5,  xpRequired: 2000,  reward: { coins: 150 } },
  { level: 6,  xpRequired: 2800,  reward: { foilRarity: 'Elite', foilIndex: 1 } },
  { level: 7,  xpRequired: 3800,  reward: { coins: 100 } },
  { level: 8,  xpRequired: 5000,  reward: { coins: 200 } },
  { level: 9,  xpRequired: 6500,  reward: { foilRarity: 'Unique', foilIndex: 0 } },
  { level: 10, xpRequired: 8500,  reward: { coins: 500, foilRarity: 'Unique', foilIndex: 1 } },
];

const QUEST_TEMPLATES = [
  { id: 'win_5', name: 'Victor', description: 'Win 5 matches', xpReward: 300, target: 5, type: 'wins' },
  { id: 'win_10', name: 'Warlord', description: 'Win 10 matches', xpReward: 400, target: 10, type: 'wins' },
  { id: 'win_streak_3', name: 'Momentum', description: 'Win 3 matches in a row', xpReward: 350, target: 3, type: 'win_streak' },
  { id: 'play_5', name: 'Engaged', description: 'Play 5 matches', xpReward: 200, target: 5, type: 'matches' },
  { id: 'play_10', name: 'Persistent', description: 'Play 10 matches', xpReward: 250, target: 10, type: 'matches' },
  { id: 'water_win', name: 'Tidebreaker', description: 'Win with a Water-only deck', xpReward: 250, target: 1, type: 'element_win', element: 'Water' },
  { id: 'earth_win', name: 'Earthshaker', description: 'Win with an Earth-only deck', xpReward: 250, target: 1, type: 'element_win', element: 'Earth' },
  { id: 'fire_win', name: 'Flamecaller', description: 'Win with a Fire-only deck', xpReward: 250, target: 1, type: 'element_win', element: 'Fire' },
  { id: 'air_win', name: 'Windwalker', description: 'Win with an Air-only deck', xpReward: 250, target: 1, type: 'element_win', element: 'Air' },
  { id: '3_avatars', name: 'Versatile', description: 'Win with 3 different Avatars', xpReward: 300, target: 3, type: 'unique_avatars' },
  { id: 'rank_up', name: 'Climber', description: 'Gain a rank division', xpReward: 400, target: 1, type: 'rank_up' },
  { id: 'open_3_packs', name: 'Treasure Hunter', description: 'Open 3 booster packs', xpReward: 200, target: 3, type: 'packs_opened' },
  { id: 'build_deck', name: 'Architect', description: 'Create or modify a deck', xpReward: 150, target: 1, type: 'deck_saved' },
  { id: 'sell_auction', name: 'Merchant', description: 'List a card in the Auction House', xpReward: 200, target: 1, type: 'auction_listed' },
];

const SEASON_XP = { WIN: 100, LOSS: 40 };

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function getCycleNumber(now = Date.now()) {
  return Math.floor((now - CYCLE_EPOCH) / (CYCLE_DAYS * 24 * 60 * 60 * 1000));
}

function getCycleStartEnd(cycleNum) {
  const startMs = CYCLE_EPOCH + cycleNum * CYCLE_DAYS * 24 * 60 * 60 * 1000;
  const endMs = startMs + CYCLE_DAYS * 24 * 60 * 60 * 1000;
  return { startsAt: new Date(startMs).toISOString(), endsAt: new Date(endMs).toISOString() };
}

export function generateSeason(sorceryCards, now = Date.now()) {
  const cycleNum = getCycleNumber(now);
  const rng = seededRandom(cycleNum * 7919);
  const { startsAt, endsAt } = getCycleStartEnd(cycleNum);

  const setKey = SETS[cycleNum % SETS.length];
  const setNames = { gothic: 'Gothic', arthurian: 'Arthurian Legends', beta: 'Beta' };
  const setId = setNames[setKey];

  const eliteCards = [];
  const uniqueCards = [];
  for (const card of sorceryCards || []) {
    if (!card._sorcery) continue;
    const foilPrinting = card.printings?.find(p => p.set_id === setId && p.foiling === 'F');
    if (!foilPrinting) continue;
    if (card.rarity === 'Elite') eliteCards.push({ cardId: card.unique_id, printingId: foilPrinting.unique_id, name: card.name });
    if (card.rarity === 'Unique') uniqueCards.push({ cardId: card.unique_id, printingId: foilPrinting.unique_id, name: card.name });
  }

  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const pickedElite = shuffle(eliteCards).slice(0, 2);
  const pickedUnique = shuffle(uniqueCards).slice(0, 2);
  const foilPicks = { Elite: pickedElite, Unique: pickedUnique };

  const tiers = TIER_TABLE.map(tier => {
    const reward = { ...tier.reward };
    if (reward.foilRarity) {
      const picks = foilPicks[reward.foilRarity];
      const pick = picks[reward.foilIndex] || picks[0];
      if (pick) {
        reward.foilCardId = pick.cardId;
        reward.foilPrintingId = pick.printingId;
        reward.foilCardName = pick.name;
      }
      delete reward.foilIndex;
    }
    return { level: tier.level, xpRequired: tier.xpRequired, reward };
  });

  const questPool = shuffle(QUEST_TEMPLATES);

  return { seasonId: `cycle-${cycleNum}`, name: `Arcane Trials: ${setId}`, setKey, startsAt, endsAt, tiers, questPool };
}

export function createDefaultSeasonProgress(seasonId) {
  return { seasonId, seasonXp: 0, claimedTiers: [], activeQuests: [], completedQuestIds: [] };
}

export function initializeQuests(progress, season) {
  if (progress.activeQuests.length >= 3) return progress;
  const available = season.questPool.filter(
    q => !progress.completedQuestIds.includes(q.id) && !progress.activeQuests.some(aq => aq.questId === q.id)
  );
  const newQuests = [...progress.activeQuests];
  while (newQuests.length < 3 && available.length > 0) {
    const quest = available.shift();
    newQuests.push({ questId: quest.id, progress: 0 });
  }
  return { ...progress, activeQuests: newQuests };
}

export function getSeasonLevel(seasonXp, tiers) {
  let level = 0;
  for (const tier of tiers) {
    if (seasonXp >= tier.xpRequired) level = tier.level;
    else break;
  }
  return level;
}

export function getNextTierInfo(seasonXp, tiers) {
  for (const tier of tiers) {
    if (seasonXp < tier.xpRequired) {
      return { level: tier.level, xpRequired: tier.xpRequired, xpRemaining: tier.xpRequired - seasonXp, reward: tier.reward };
    }
  }
  return null;
}

export function canClaimTier(level, seasonXp, claimedTiers, tiers) {
  const tier = tiers.find(t => t.level === level);
  if (!tier) return false;
  return seasonXp >= tier.xpRequired && !claimedTiers.includes(level);
}

export function getTimeRemaining(endsAt) {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return { days: 0, hours: 0, expired: true };
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  return { days, hours, expired: false };
}

export function processMatchResult(progress, season, won) {
  const xpGain = won ? SEASON_XP.WIN : SEASON_XP.LOSS;
  let updated = { ...progress, seasonXp: progress.seasonXp + xpGain };

  const newActiveQuests = updated.activeQuests.map(aq => {
    const template = season.questPool.find(q => q.id === aq.questId);
    if (!template) return aq;
    if (template.type === 'wins' && won) return { ...aq, progress: aq.progress + 1 };
    if (template.type === 'matches') return { ...aq, progress: aq.progress + 1 };
    return aq;
  });

  const completedIds = [...updated.completedQuestIds];
  const stillActive = [];
  let bonusXp = 0;

  for (const aq of newActiveQuests) {
    const template = season.questPool.find(q => q.id === aq.questId);
    if (template && aq.progress >= template.target) {
      completedIds.push(aq.questId);
      bonusXp += template.xpReward;
    } else {
      stillActive.push(aq);
    }
  }

  updated = { ...updated, seasonXp: updated.seasonXp + bonusXp, activeQuests: stillActive, completedQuestIds: completedIds };
  updated = initializeQuests(updated, season);

  return { progress: updated, questXpEarned: bonusXp, matchXpEarned: xpGain };
}

export { SEASON_XP, TIER_TABLE };
