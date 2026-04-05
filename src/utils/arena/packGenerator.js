const BOOSTER_SETS = {
  gothic: { name: 'gothic', label: 'Gothic', setId: 'Gothic' },
  arthurian: { name: 'arthurian', label: 'Arthurian Legends', setId: 'Arthurian Legends' },
  beta: { name: 'beta', label: 'Beta', setId: 'Beta' },
};

const PACK_SIZE = 15;

// ~5 avatars in 30 packs = ~16.7% chance per pack
const AVATAR_CHANCE = 5 / 30;

export function buildCardPool(sorceryCards, setId) {
  const pool = {
    Ordinary: [],
    Exceptional: [],
    Elite: [],
    Unique: [],
    Site: [],
    Avatar: [],
  };

  for (const card of sorceryCards) {
    const printing = card.printings?.find((p) => p.set_id === setId);
    if (!printing) continue;

    const type = card.type || '';
    const rarity = card.rarity || '';

    if (type === 'Avatar') {
      pool.Avatar.push({ card, printing });
    } else if (type === 'Site') {
      pool.Site.push({ card, printing });
    } else if (pool[rarity]) {
      pool[rarity].push({ card, printing });
    }
  }

  return pool;
}

function pickRandom(array) {
  if (!array || array.length === 0) return null;
  return array[Math.floor(Math.random() * array.length)];
}

export function generatePack(sorceryCards, setKey) {
  const setDef = BOOSTER_SETS[setKey];
  if (!setDef) throw new Error(`Unknown set: ${setKey}`);

  const pool = buildCardPool(sorceryCards, setDef.setId);
  const cards = [];

  // Slots 1-10: Ordinary
  for (let i = 0; i < 10; i++) {
    const entry = pickRandom(pool.Ordinary);
    if (entry) cards.push({ ...entry, rarity: 'Ordinary' });
  }

  // Slots 11-13: Exceptional
  for (let i = 0; i < 3; i++) {
    const entry = pickRandom(pool.Exceptional);
    if (entry) cards.push({ ...entry, rarity: 'Exceptional' });
  }

  // Slot 14: Elite (20% chance Unique)
  const eliteOrUnique = Math.random() < 0.2 && pool.Unique.length > 0 ? 'Unique' : 'Elite';
  const rareEntry = pickRandom(pool[eliteOrUnique] || pool.Elite);
  if (rareEntry) cards.push({ ...rareEntry, rarity: eliteOrUnique });

  // Slot 15: Site, OR Avatar (~16.7% chance, replacing the Site)
  const isAvatar = Math.random() < AVATAR_CHANCE && pool.Avatar.length > 0;
  if (isAvatar) {
    const entry = pickRandom(pool.Avatar);
    if (entry) cards.push({ ...entry, rarity: 'Avatar' });
  } else {
    const entry = pickRandom(pool.Site);
    if (entry) cards.push({ ...entry, rarity: 'Ordinary' });
  }

  return { setKey, setLabel: setDef.label, cards };
}

export { BOOSTER_SETS, PACK_SIZE };
