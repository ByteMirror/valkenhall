function makeUidFactory(prefix) {
  let counter = 1;
  return () => `${prefix}-${counter++}-${Math.random().toString(36).slice(2, 7)}`;
}

const uid = makeUidFactory('card');
const tokenUid = makeUidFactory('token');
const diceUid = makeUidFactory('dice');

export function createTokenInstance(x, z, color = 'red') {
  return {
    id: tokenUid(),
    x,
    z,
    color,
  };
}

export function createDiceInstance(x, z, dieType = 'd6') {
  const faceCount = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 }[dieType] || 6;
  return {
    id: diceUid(),
    x,
    z,
    dieType,
    value: Math.ceil(Math.random() * faceCount),
  };
}

export function createTrackerState() {
  return {
    p1: { life: 20, mana: 0, earth: 0, water: 0, fire: 0, wind: 0 },
    p2: { life: 20, mana: 0, earth: 0, water: 0, fire: 0, wind: 0 },
  };
}

export function createGameState() {
  return {
    tableCards: [],
    handCards: [],
    piles: [],
    tokens: [],
    dice: [],
    trackers: createTrackerState(),
  };
}

export function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function createCardInstance(card, printing, rotated = false) {
  return {
    id: uid(),
    cardId: card.unique_id,
    name: card.name,
    imageUrl: printing?.image_url || card.printings?.[0]?.image_url || '',
    type: card.type || card.types?.[0] || '',
    isSite: card.played_horizontally || card.type === 'Site',
    tapped: false,
    faceDown: false,
    rotated,
    x: 0,
    y: 0,
    z: 0,
  };
}

export function createPile(name, cards, x, z, rotated = false) {
  return {
    id: uid(),
    name,
    cards,
    x,
    z,
    rotated,
  };
}

export function spawnDeck(deck, sorceryCards, spawnPoints = {}, rotated = false) {
  const cardIndex = new Map();
  for (const card of sorceryCards || []) {
    cardIndex.set(card.unique_id, card);
  }

  const spellbookCards = [];
  const atlasCards = [];
  const collectionCards = [];
  let avatarInstance = null;

  for (const savedCard of deck.cards || []) {
    const card = cardIndex.get(savedCard.cardId);
    if (!card) continue;

    const printing = card.printings?.find((p) => p.unique_id === savedCard.printingId) || card.printings?.[0];
    const instance = createCardInstance(card, printing, rotated);

    if (card.type === 'Avatar' || card._sorceryCategory === 'Avatar') {
      avatarInstance = instance;
    } else if (savedCard.isSideboard) {
      collectionCards.push(instance);
    } else if (card.type === 'Site' || card._sorceryCategory === 'Site') {
      atlasCards.push(instance);
    } else {
      spellbookCards.push(instance);
    }
  }

  // Auto-detect collection: if spellbook has more than 60 cards,
  // the extras are likely collection (deck max is 60 spellbook)
  const SPELLBOOK_MAX = 60;
  if (collectionCards.length === 0 && spellbookCards.length > SPELLBOOK_MAX) {
    const overflow = spellbookCards.splice(SPELLBOOK_MAX);
    collectionCards.push(...overflow);
  }

  const sb = spawnPoints.spellbook || { x: 30, z: 30 };
  const at = spawnPoints.atlas || { x: 30, z: -30 };
  const av = spawnPoints.avatar || { x: -30, z: 0 };
  const co = spawnPoints.collection || { x: -30, z: 30 };

  const spellbookPile = createPile('Spellbook', shuffleArray(spellbookCards), sb.x, sb.z, rotated);
  const atlasPile = createPile('Atlas', shuffleArray(atlasCards), at.x, at.z, rotated);

  const piles = [spellbookPile, atlasPile];

  if (collectionCards.length > 0) {
    const collectionPile = createPile('Collection', collectionCards, co.x, co.z, rotated);
    piles.push(collectionPile);
  }

  const result = { piles };

  if (avatarInstance) {
    avatarInstance.x = av.x;
    avatarInstance.z = av.z;
    result.avatarCard = avatarInstance;
  }

  return result;
}

export function drawFromPile(state, pileId) {
  const pile = state.piles.find((p) => p.id === pileId);
  if (!pile || pile.cards.length === 0) return null;

  const drawn = pile.cards[pile.cards.length - 1];
  pile.cards = pile.cards.slice(0, -1);
  return drawn;
}

export function shufflePile(state, pileId) {
  const pile = state.piles.find((p) => p.id === pileId);
  if (!pile) return;
  pile.cards = shuffleArray(pile.cards);
}
