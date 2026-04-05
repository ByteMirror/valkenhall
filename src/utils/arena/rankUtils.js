export const TIERS = ['apprentice', 'adept', 'mage', 'archon', 'sovereign'];
export const TIER_LABELS = { apprentice: 'Apprentice', adept: 'Adept', mage: 'Mage', archon: 'Archon', sovereign: 'Sovereign' };
export const TIER_COLORS = {
  apprentice: 'text-stone-400',
  adept: 'text-sky-400',
  mage: 'text-violet-400',
  archon: 'text-amber-400',
  sovereign: 'text-red-400',
};
export const DIVISION_LABELS = { 4: 'IV', 3: 'III', 2: 'II', 1: 'I' };

export function formatRank(tier, division) {
  const label = TIER_LABELS[tier] || tier;
  if (tier === 'sovereign') return label;
  return `${label} ${DIVISION_LABELS[division] || division}`;
}
