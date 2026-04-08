// Sorcery TCG starter decks — the four Gothic set precons published
// by Sorcery TCG Official on Curiosa. Each deck is a full Sorcery
// preconstructed deck with an Avatar, a Spellbook (main deck), an
// Atlas (sites), and a Collection (sideboard).
//
// Source (curiosa.io/decks/<curiosaDeckId>):
//   savior: cmip2v28500k6l204a5bxo5oh
//   necromancer: cmip2vh9y00kal204778yzvbd
//   persecutor: cmip2vwc100khl2043cgtpae7
//   harbinger: cmip2w8qa002mjl04intv339z
//
// Regenerate with `bun run scripts/fetch-starter-decks.js` if the
// upstream decks change. `name`, `elements`, and `description` are
// hand-curated for the starter-picker UI and preserved across runs.

export const STARTER_DECKS = [
  {
    id: "savior",
    name: "Savior",
    elements: ["Earth","Water"],
    description: "A defensive deck focused on faith and protection. Summon angels, heal the wounded, and outlast your enemies.",
    curiosaDeckId: "cmip2v28500k6l204a5bxo5oh",
    avatar: "Savior",
    spellbook: [
      { name: "Angel Ascendant", qty: 1 },
      { name: "Baptize", qty: 1 },
      { name: "Divine Lance", qty: 1 },
      { name: "Eltham Townsfolk", qty: 1 },
      { name: "Enduring Faith", qty: 1 },
      { name: "Faith Incarnate", qty: 1 },
      { name: "Flame of the First Ones", qty: 1 },
      { name: "Golden Dawn", qty: 1 },
      { name: "Guardian Angel", qty: 1 },
      { name: "Holy Nova", qty: 1 },
      { name: "Makeshift Barricade", qty: 1 },
      { name: "Malakhim", qty: 1 },
      { name: "Mayor of Milborne", qty: 1 },
      { name: "Monks of Kobalsa", qty: 2 },
      { name: "Muddy Pigs", qty: 2 },
      { name: "Nightwatchmen", qty: 1 },
      { name: "Order of the White Wing", qty: 1 },
      { name: "Revered Revenant", qty: 2 },
      { name: "Rowdy Boys", qty: 1 },
      { name: "Search Party", qty: 3 },
      { name: "Serava Townsfolk", qty: 1 },
      { name: "Smite", qty: 2 },
      { name: "Survivors of Serava", qty: 2 },
      { name: "Town Priest", qty: 1 },
      { name: "Virgin in Prayer", qty: 2 },
      { name: "Wave of Eviction", qty: 1 },
      { name: "Weathered Trunks", qty: 2 },
    ],
    atlas: [
      { name: "Algae Bloom", qty: 1 },
      { name: "Autumn Bloom", qty: 2 },
      { name: "Blessed Village", qty: 2 },
      { name: "Blessed Well", qty: 1 },
      { name: "Consecrated Ground", qty: 1 },
      { name: "Fertile Earth", qty: 1 },
      { name: "Forlorn Keep", qty: 1 },
      { name: "Mudslide", qty: 1 },
      { name: "Stream", qty: 2 },
      { name: "Troubled Town", qty: 2 },
      { name: "Valley", qty: 2 },
    ],
    collection: [
      { name: "Eltham Townsfolk", qty: 1 },
      { name: "Penitent Knight", qty: 1 },
      { name: "Serava Townsfolk", qty: 1 },
    ],
  },
  {
    id: "necromancer",
    name: "Necromancer",
    elements: ["Air","Fire"],
    description: "Raise the dead and unleash undead hordes. Sacrifice the weak to empower the strong.",
    curiosaDeckId: "cmip2vh9y00kal204778yzvbd",
    avatar: "Necromancer",
    spellbook: [
      { name: "Bitter Departed", qty: 1 },
      { name: "Bone Jumble", qty: 1 },
      { name: "Bone Spear", qty: 3 },
      { name: "Carrionette", qty: 1 },
      { name: "Corpse Catapult", qty: 1 },
      { name: "Detonate", qty: 1 },
      { name: "Draconian Bonekite", qty: 1 },
      { name: "Dreadwing", qty: 1 },
      { name: "Fowl Bones", qty: 2 },
      { name: "Hotwheel", qty: 2 },
      { name: "Ignited", qty: 2 },
      { name: "Khamaseen Mummy", qty: 1 },
      { name: "Kiss of Death", qty: 2 },
      { name: "Master Necromancer", qty: 1 },
      { name: "Necronomiconcert", qty: 1 },
      { name: "Novice Necromancer", qty: 2 },
      { name: "Noxious Corpse", qty: 1 },
      { name: "Order of the Pale Worm", qty: 1 },
      { name: "Panpipes of Pnom", qty: 1 },
      { name: "Screamer", qty: 3 },
      { name: "Snallygaster", qty: 2 },
      { name: "Stitched Abomination", qty: 1 },
      { name: "Stygian Archers", qty: 1 },
      { name: "Those Who Linger", qty: 1 },
      { name: "Vesper Swarm", qty: 1 },
      { name: "Witching Hour", qty: 1 },
    ],
    atlas: [
      { name: "Accursed Desert", qty: 1 },
      { name: "Accursed Tower", qty: 1 },
      { name: "Darkest Dungeon", qty: 1 },
      { name: "Den of Evil", qty: 1 },
      { name: "Desert Bloom", qty: 1 },
      { name: "Dread Thicket", qty: 1 },
      { name: "Forsaken Crypt", qty: 1 },
      { name: "Open Mausoleum", qty: 2 },
      { name: "Sold-out Cemetery", qty: 1 },
      { name: "Spire", qty: 2 },
      { name: "Twilight Bloom", qty: 1 },
      { name: "Vast Desert", qty: 1 },
      { name: "Wasteland", qty: 2 },
    ],
    collection: [
      { name: "Ghoul", qty: 2 },
    ],
  },
  {
    id: "persecutor",
    name: "Persecutor",
    elements: ["Earth","Fire"],
    description: "Purge evil with righteous fury. Burn heretics and demons alike with zealous fervor.",
    curiosaDeckId: "cmip2vwc100khl2043cgtpae7",
    avatar: "Persecutor",
    spellbook: [
      { name: "Angry Mob", qty: 1 },
      { name: "Bind Evil", qty: 2 },
      { name: "Blade of Thorns", qty: 1 },
      { name: "Blaze of Glory", qty: 1 },
      { name: "Cherubim", qty: 1 },
      { name: "Fallen Angel", qty: 1 },
      { name: "Flagellant", qty: 1 },
      { name: "Flame Strike", qty: 2 },
      { name: "Flaming Skull", qty: 1 },
      { name: "Flayer", qty: 1 },
      { name: "Greater Blood Demon", qty: 1 },
      { name: "Holy Warrior", qty: 2 },
      { name: "Holy Water", qty: 1 },
      { name: "Intrepid Hero", qty: 1 },
      { name: "Kissers of Wounds", qty: 1 },
      { name: "Lash", qty: 1 },
      { name: "Lesser Blood Demon", qty: 2 },
      { name: "Martyrs of Tomorrow", qty: 1 },
      { name: "Màzuj Ifrit", qty: 1 },
      { name: "One-shot Wizard", qty: 1 },
      { name: "Peacemaker Arbalest", qty: 1 },
      { name: "Redmane Hyena", qty: 1 },
      { name: "Release the Hounds", qty: 1 },
      { name: "Shackled Demon", qty: 1 },
      { name: "Trial by Fire", qty: 2 },
      { name: "Undesirables", qty: 1 },
      { name: "Wild Fanatic", qty: 2 },
      { name: "Wreathed in Righteousness", qty: 1 },
      { name: "Zeppelin of Zealots", qty: 2 },
    ],
    atlas: [
      { name: "Active Volcano", qty: 1 },
      { name: "Autumn Bloom", qty: 1 },
      { name: "Blessed Village", qty: 1 },
      { name: "Consecrated Ground", qty: 1 },
      { name: "Desert Bloom", qty: 2 },
      { name: "Hillside Chapel", qty: 1 },
      { name: "Molten Maar", qty: 1 },
      { name: "Purgatory", qty: 1 },
      { name: "Road to Perdition", qty: 1 },
      { name: "Valley", qty: 2 },
      { name: "Vast Desert", qty: 2 },
      { name: "Wasteland", qty: 2 },
    ],
    collection: [
      { name: "Hellhounds", qty: 3 },
    ],
  },
  {
    id: "harbinger",
    name: "Harbinger",
    elements: ["Air","Water"],
    description: "Command eldritch horrors from the deep. Overwhelm foes with monstrous tentacled creatures.",
    curiosaDeckId: "cmip2w8qa002mjl04intv339z",
    avatar: "Harbinger",
    spellbook: [
      { name: "Aaj-kegon Ghost Crabs", qty: 1 },
      { name: "Abyssal Assault", qty: 1 },
      { name: "Bound Spirit", qty: 2 },
      { name: "Call of the Sea", qty: 1 },
      { name: "Dormant Monstrosity", qty: 1 },
      { name: "Falling Star", qty: 1 },
      { name: "Forsaken", qty: 2 },
      { name: "Frozen Horror", qty: 1 },
      { name: "Gift of the Frog", qty: 2 },
      { name: "Gnarled Wendigo", qty: 1 },
      { name: "Hearkening Kraken", qty: 1 },
      { name: "Ice Shards", qty: 2 },
      { name: "Into the Abyss", qty: 1 },
      { name: "Lacuna Entity", qty: 1 },
      { name: "Mesmer Demon", qty: 2 },
      { name: "Monstermorphosis", qty: 1 },
      { name: "Nommo Monitor", qty: 2 },
      { name: "Regurgitator", qty: 1 },
      { name: "Sea Witch", qty: 2 },
      { name: "Shoggoth", qty: 2 },
      { name: "Slimy Mutants", qty: 1 },
      { name: "Static Servant", qty: 1 },
      { name: "Swap", qty: 1 },
      { name: "Ten-tonne Slug", qty: 2 },
      { name: "Willing Tribute", qty: 2 },
      { name: "Yog-Sothoth", qty: 1 },
    ],
    atlas: [
      { name: "Accursed Tower", qty: 1 },
      { name: "Algae Bloom", qty: 1 },
      { name: "Croaking Swamp", qty: 2 },
      { name: "Dark Alley", qty: 1 },
      { name: "Deep Sea", qty: 1 },
      { name: "Den of Evil", qty: 1 },
      { name: "Elder Ruins", qty: 1 },
      { name: "Peculiar Port", qty: 1 },
      { name: "Spire", qty: 2 },
      { name: "Stinging Kelp", qty: 2 },
      { name: "Stream", qty: 2 },
      { name: "Twilight Bloom", qty: 1 },
    ],
    collection: [
      { name: "Horrible Hybrids", qty: 1 },
      { name: "Shoggoth", qty: 2 },
    ],
  },
];

/**
 * Resolve a starter deck's zone-aware card lists against the loaded
 * Sorcery card database. Returns a flat array of
 * `{ cardId, printingId, foiling, zone }` — one entry per copy of
 * each card, with `zone` ∈ { 'avatar', 'spellbook', 'atlas', 'collection' }.
 * Consumers (saved deck, grantCards) use the zone to route each card
 * to its correct deck compartment on the first save.
 *
 * The avatar is resolved first and prefers the Foil printing when one
 * exists — Sorcery starter decks ship with a foil version of their
 * avatar, and the grant contract mirrors that.
 */
export function resolveStarterDeck(starterDeck, sorceryCards) {
  const nameIndex = new Map();
  for (const card of sorceryCards) {
    nameIndex.set(card.name.toLowerCase(), card);
  }

  const resolved = [];

  // Avatar — prefer the foil printing when the card has one, so new
  // players get a sparkly avatar on their first deck save.
  if (starterDeck.avatar) {
    const card = nameIndex.get(starterDeck.avatar.toLowerCase());
    if (card) {
      let printing = card.printings?.[0];
      let foiling = 'S';
      const foilPrinting = card.printings?.find((p) => p.foiling === 'F');
      if (foilPrinting) {
        printing = foilPrinting;
        foiling = 'F';
      }
      resolved.push({
        cardId: card.unique_id,
        printingId: printing?.unique_id || '',
        foiling,
        zone: 'avatar',
      });
    }
  }

  // Spellbook + Atlas + Collection — straightforward name lookups. Entries
  // whose names don't resolve are silently dropped so a missing card never
  // crashes the starter grant; the rest of the deck still imports cleanly.
  for (const zone of ['spellbook', 'atlas', 'collection']) {
    const entries = starterDeck[zone] || [];
    for (const entry of entries) {
      const card = nameIndex.get(entry.name.toLowerCase());
      if (!card) continue;
      const printing = card.printings?.[0];
      for (let i = 0; i < entry.qty; i++) {
        resolved.push({
          cardId: card.unique_id,
          printingId: printing?.unique_id || '',
          foiling: 'S',
          zone,
        });
      }
    }
  }

  return resolved;
}
