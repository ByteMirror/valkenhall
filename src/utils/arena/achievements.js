import { levelFromXp } from './profileDefaults';

// Every achievement awards the same flat coin reward. Achievements are
// meant to mark progression milestones, not act as the player's primary
// income — match rewards and the season pass cover that. Keeping the
// payout uniform also makes balancing trivial: tweak this constant when
// the economy needs adjusting and every achievement scales with it.
const ACHIEVEMENT_COIN_REWARD = 10;

export const ACHIEVEMENTS = [
  // First steps
  { id: 'first_match', name: 'Trial by Fire', description: 'Play your first match', icon: '⚔️', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'first_win', name: 'Victorious', description: 'Win your first match', icon: '🏆', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'first_pack', name: 'Collector', description: 'Open your first booster pack', icon: '📦', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'first_deck', name: 'Decksmith', description: 'Build your first custom deck', icon: '🃏', coins: ACHIEVEMENT_COIN_REWARD },

  // Win streaks
  { id: 'win_3_streak', name: 'On a Roll', description: 'Win 3 matches in a row', icon: '🔥', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'win_5_streak', name: 'Unstoppable', description: 'Win 5 matches in a row', icon: '💥', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'win_10_streak', name: 'Legendary Streak', description: 'Win 10 matches in a row', icon: '👑', coins: ACHIEVEMENT_COIN_REWARD },

  // Win milestones
  { id: 'win_10', name: 'Seasoned Fighter', description: 'Win 10 matches', icon: '🗡️', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'win_25', name: 'Veteran', description: 'Win 25 matches', icon: '🛡️', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'win_50', name: 'Champion', description: 'Win 50 matches', icon: '⭐', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'win_100', name: 'Legend', description: 'Win 100 matches', icon: '🌟', coins: ACHIEVEMENT_COIN_REWARD },

  // Match milestones
  { id: 'play_10', name: 'Regular', description: 'Play 10 matches', icon: '📊', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'play_50', name: 'Dedicated', description: 'Play 50 matches', icon: '📈', coins: ACHIEVEMENT_COIN_REWARD },

  // Level milestones
  { id: 'level_5', name: 'Rising Star', description: 'Reach level 5', icon: '✨', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'level_10', name: 'Experienced', description: 'Reach level 10', icon: '🔶', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'level_20', name: 'Master', description: 'Reach level 20', icon: '💎', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'level_30', name: 'Grandmaster', description: 'Reach level 30', icon: '🏅', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'level_50', name: 'Ascendant', description: 'Reach level 50', icon: '🌠', coins: ACHIEVEMENT_COIN_REWARD },

  // Pack milestones
  { id: 'open_5_packs', name: 'Pack Rat', description: 'Open 5 booster packs', icon: '🎁', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'open_20_packs', name: 'Hoarder', description: 'Open 20 booster packs', icon: '💰', coins: ACHIEVEMENT_COIN_REWARD },

  // Set-specific packs
  { id: 'open_gothic', name: 'Gothic Explorer', description: 'Open a Gothic booster pack', icon: '🦇', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'open_arthurian', name: 'Knight Errant', description: 'Open an Arthurian Legends pack', icon: '🏰', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'open_beta', name: 'Beta Tester', description: 'Open a Beta booster pack', icon: '🧪', coins: ACHIEVEMENT_COIN_REWARD },

  // Avatar variety
  { id: 'avatar_water', name: 'Tidewalker', description: 'Play a match with a Water avatar', icon: '🌊', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'avatar_fire', name: 'Flamecaller', description: 'Play a match with a Fire avatar', icon: '🔥', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'avatar_earth', name: 'Earthshaper', description: 'Play a match with an Earth avatar', icon: '🌿', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'avatar_air', name: 'Windwalker', description: 'Play a match with an Air avatar', icon: '💨', coins: ACHIEVEMENT_COIN_REWARD },

  // Rank achievements
  { id: 'rank_adept', name: 'Adept', description: 'Reach Adept rank', icon: '🔵', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'rank_mage', name: 'Mage', description: 'Reach Mage rank', icon: '🟣', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'rank_archon', name: 'Archon', description: 'Reach Archon rank', icon: '🔴', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'rank_sovereign', name: 'Sovereign', description: 'Reach Sovereign rank', icon: '🟡', coins: ACHIEVEMENT_COIN_REWARD },

  // Collection milestones
  { id: 'collect_50', name: 'Archivist', description: 'Collect 50 unique cards', icon: '📚', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'collect_100', name: 'Curator', description: 'Collect 100 unique cards', icon: '🏛️', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'collect_200', name: 'Grand Curator', description: 'Collect 200 unique cards', icon: '🏛️', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'collect_500', name: 'Lorekeeper', description: 'Collect 500 unique cards', icon: '📜', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'collect_1000', name: 'Omniscient', description: 'Collect 1000 unique cards', icon: '🌌', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'collect_all', name: 'The Completionist', description: 'Collect every card in the game', icon: '✦', coins: ACHIEVEMENT_COIN_REWARD },

  // Complete a set
  { id: 'complete_gothic', name: 'Gothic Complete', description: 'Collect every Gothic card', icon: '🦇', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'complete_arthurian', name: 'Arthurian Complete', description: 'Collect every Arthurian Legends card', icon: '🏰', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'complete_beta', name: 'Beta Complete', description: 'Collect every Beta card', icon: '🧪', coins: ACHIEVEMENT_COIN_REWARD },
  { id: 'complete_alpha', name: 'Alpha Complete', description: 'Collect every Alpha card', icon: '⚡', coins: ACHIEVEMENT_COIN_REWARD },
];

const ACHIEVEMENT_MAP = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function getAchievement(id) {
  return ACHIEVEMENT_MAP.get(id) || null;
}

export function getAchievementProgress(id, profile, sorceryCards = null) {
  const history = profile.matchHistory || [];
  const totalMatches = history.length;
  const totalWins = history.filter((m) => m.won).length;
  const level = levelFromXp(profile.xp || 0);
  const uniqueCards = (profile.collection || []).length;
  const packsOpened = profile.packsOpened || 0;

  // Current win streak
  let currentStreak = 0;
  for (const match of history) {
    if (match.won) currentStreak++;
    else break;
  }

  const ownedCardIds = new Set((profile.collection || []).map((c) => c.cardId));

  function setProgress(setName) {
    if (!sorceryCards) return null;
    const setNameMap = { 'gothic': 'Gothic', 'arthurian': 'Arthurian Legends', 'beta': 'Beta', 'alpha': 'Alpha' };
    const fullName = setNameMap[setName];
    if (!fullName) return null;
    const setCards = sorceryCards.filter((c) => (c.printings || []).some((p) => p.set_id === fullName));
    const owned = setCards.filter((c) => ownedCardIds.has(c.unique_id)).length;
    return { current: owned, target: setCards.length };
  }

  const progressMap = {
    first_match: { current: Math.min(totalMatches, 1), target: 1 },
    first_win: { current: Math.min(totalWins, 1), target: 1 },
    first_pack: { current: Math.min(packsOpened, 1), target: 1 },
    first_deck: { current: Math.min((profile.decks || []).length, 2), target: 2 },
    win_3_streak: { current: Math.min(currentStreak, 3), target: 3 },
    win_5_streak: { current: Math.min(currentStreak, 5), target: 5 },
    win_10_streak: { current: Math.min(currentStreak, 10), target: 10 },
    win_10: { current: Math.min(totalWins, 10), target: 10 },
    win_25: { current: Math.min(totalWins, 25), target: 25 },
    win_50: { current: Math.min(totalWins, 50), target: 50 },
    win_100: { current: Math.min(totalWins, 100), target: 100 },
    play_10: { current: Math.min(totalMatches, 10), target: 10 },
    play_50: { current: Math.min(totalMatches, 50), target: 50 },
    level_5: { current: Math.min(level, 5), target: 5 },
    level_10: { current: Math.min(level, 10), target: 10 },
    level_20: { current: Math.min(level, 20), target: 20 },
    level_30: { current: Math.min(level, 30), target: 30 },
    level_50: { current: Math.min(level, 50), target: 50 },
    open_5_packs: { current: Math.min(packsOpened, 5), target: 5 },
    open_20_packs: { current: Math.min(packsOpened, 20), target: 20 },
    collect_50: { current: Math.min(uniqueCards, 50), target: 50 },
    collect_100: { current: Math.min(uniqueCards, 100), target: 100 },
    collect_200: { current: Math.min(uniqueCards, 200), target: 200 },
    collect_500: { current: Math.min(uniqueCards, 500), target: 500 },
    collect_1000: { current: Math.min(uniqueCards, 1000), target: 1000 },
    collect_all: { current: uniqueCards, target: sorceryCards?.length || 1104 },
    complete_gothic: setProgress('gothic'),
    complete_arthurian: setProgress('arthurian'),
    complete_beta: setProgress('beta'),
    complete_alpha: setProgress('alpha'),
  };

  return progressMap[id] || null;
}

export function checkAchievements(profile, sorceryCards = null) {
  const unlocked = new Set(profile.achievements || []);
  const newlyUnlocked = [];

  function tryUnlock(id) {
    if (!unlocked.has(id) && ACHIEVEMENT_MAP.has(id)) {
      newlyUnlocked.push(id);
      unlocked.add(id);
    }
  }

  const history = profile.matchHistory || [];
  const totalMatches = history.length;
  const totalWins = history.filter((m) => m.won).length;
  const level = levelFromXp(profile.xp || 0);
  const uniqueCards = (profile.collection || []).length;
  const packsOpened = profile.packsOpened || 0;

  // First steps
  if (totalMatches >= 1) tryUnlock('first_match');
  if (totalWins >= 1) tryUnlock('first_win');
  if (packsOpened >= 1) tryUnlock('first_pack');
  if ((profile.decks || []).length >= 2) tryUnlock('first_deck'); // 2 because starter deck counts as 1

  // Win milestones
  if (totalWins >= 10) tryUnlock('win_10');
  if (totalWins >= 25) tryUnlock('win_25');
  if (totalWins >= 50) tryUnlock('win_50');
  if (totalWins >= 100) tryUnlock('win_100');

  // Match milestones
  if (totalMatches >= 10) tryUnlock('play_10');
  if (totalMatches >= 50) tryUnlock('play_50');

  // Win streaks — check from most recent
  let currentStreak = 0;
  for (const match of history) {
    if (match.won) {
      currentStreak++;
    } else {
      break;
    }
  }
  if (currentStreak >= 3) tryUnlock('win_3_streak');
  if (currentStreak >= 5) tryUnlock('win_5_streak');
  if (currentStreak >= 10) tryUnlock('win_10_streak');

  // Level milestones
  if (level >= 5) tryUnlock('level_5');
  if (level >= 10) tryUnlock('level_10');
  if (level >= 20) tryUnlock('level_20');
  if (level >= 30) tryUnlock('level_30');
  if (level >= 50) tryUnlock('level_50');

  // Pack milestones
  if (packsOpened >= 5) tryUnlock('open_5_packs');
  if (packsOpened >= 20) tryUnlock('open_20_packs');

  // Set-specific packs
  if (profile.packsOpenedBySet?.gothic >= 1) tryUnlock('open_gothic');
  if (profile.packsOpenedBySet?.arthurian >= 1) tryUnlock('open_arthurian');
  if (profile.packsOpenedBySet?.beta >= 1) tryUnlock('open_beta');

  // Rank achievements
  const tier = profile.rank?.tier;
  const tierOrder = ['apprentice', 'adept', 'mage', 'archon', 'sovereign'];
  const tierIndex = tierOrder.indexOf(tier);
  if (tierIndex >= 1) tryUnlock('rank_adept');
  if (tierIndex >= 2) tryUnlock('rank_mage');
  if (tierIndex >= 3) tryUnlock('rank_archon');
  if (tierIndex >= 4) tryUnlock('rank_sovereign');

  // Avatar variety — check match history for avatar types
  const avatarsPlayed = new Set(history.map((m) => m.avatarElement).filter(Boolean));
  if (avatarsPlayed.has('Water')) tryUnlock('avatar_water');
  if (avatarsPlayed.has('Fire')) tryUnlock('avatar_fire');
  if (avatarsPlayed.has('Earth')) tryUnlock('avatar_earth');
  if (avatarsPlayed.has('Air')) tryUnlock('avatar_air');

  // Collection milestones
  if (uniqueCards >= 50) tryUnlock('collect_50');
  if (uniqueCards >= 100) tryUnlock('collect_100');
  if (uniqueCards >= 200) tryUnlock('collect_200');
  if (uniqueCards >= 500) tryUnlock('collect_500');
  if (uniqueCards >= 1000) tryUnlock('collect_1000');

  // Set completion — check if player owns at least one of every card in a set
  if (sorceryCards && sorceryCards.length > 0) {
    const ownedCardIds = new Set((profile.collection || []).map((c) => c.cardId));
    const totalUniqueInGame = sorceryCards.length;

    if (ownedCardIds.size >= totalUniqueInGame) tryUnlock('collect_all');

    const setCardIds = { gothic: [], arthurian: [], beta: [], alpha: [] };
    const setNameMap = { 'Gothic': 'gothic', 'Arthurian Legends': 'arthurian', 'Beta': 'beta', 'Alpha': 'alpha' };

    for (const card of sorceryCards) {
      const cardSets = new Set((card.printings || []).map((p) => p.set_id));
      for (const setName of cardSets) {
        const key = setNameMap[setName];
        if (key) setCardIds[key].push(card.unique_id);
      }
    }

    for (const [setKey, cardIds] of Object.entries(setCardIds)) {
      if (cardIds.length > 0 && cardIds.every((id) => ownedCardIds.has(id))) {
        tryUnlock(`complete_${setKey}`);
      }
    }
  }

  return newlyUnlocked;
}
