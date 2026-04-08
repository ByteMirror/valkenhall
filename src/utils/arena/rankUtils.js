// Client-side mirror of the server's ladder tiers. The server is the
// source of truth for matchmaking scoring (see matchmaker.js) and LP
// math (see utils/ranking.js on the server); this file exists purely
// for display — labels, colors, formatted names.
//
// If you rename a tier, update both the server's TIERS constant and
// this array together.
export const TIERS = ['apprentice', 'journeyman', 'adept', 'expert', 'master', 'grandmaster'];
export const TIER_LABELS = {
  apprentice: 'Apprentice',
  journeyman: 'Journeyman',
  adept: 'Adept',
  expert: 'Expert',
  master: 'Master',
  grandmaster: 'Grandmaster',
};
export const TIER_COLORS = {
  apprentice: 'text-stone-400',
  journeyman: 'text-zinc-300',
  adept: 'text-sky-400',
  expert: 'text-violet-400',
  master: 'text-amber-400',
  grandmaster: 'text-red-400',
};
export const DIVISION_LABELS = { 4: 'IV', 3: 'III', 2: 'II', 1: 'I' };

export function formatRank(tier, division) {
  const label = TIER_LABELS[tier] || tier;
  // Grandmaster doesn't use divisions in the display — everyone above
  // apprentice I collapses to "Grandmaster" with only LP differentiating.
  if (tier === 'grandmaster') return label;
  return `${label} ${DIVISION_LABELS[division] || division}`;
}
