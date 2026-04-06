const SORCERY_CDN_BASE = 'https://d27a44hjr9gen3.cloudfront.net/cards';

export function buildSorceryCdnImageUrl(variantSlug) {
  return `${SORCERY_CDN_BASE}/${variantSlug}.png`;
}

const RARITY_CODE_MAP = {
  'Ordinary': 'O',
  'Exceptional': 'E',
  'Elite': 'L',
  'Unique': 'U',
};

const FOILING_CODE_MAP = {
  'Standard': 'S',
  'Foil': 'F',
  'Rainbow': 'R',
};

function parseElements(elementsStr) {
  if (!elementsStr || elementsStr === 'None') return [];
  return elementsStr.split(',').map(e => e.trim()).filter(Boolean);
}

function parseSubTypes(subTypesStr) {
  if (!subTypesStr) return [];
  return subTypesStr.split(',').map(s => s.trim()).filter(Boolean);
}

function getSorceryCategory(type) {
  if (type === 'Site') return 'Site';
  if (type === 'Avatar') return 'Avatar';
  return 'Spell';
}

function statToString(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

function buildSorceryImageUrl(variantSlug, imageBaseUrl) {
  return `${imageBaseUrl}/sorcery-images/${variantSlug}.png`;
}

export function normalizeSorceryCard(raw, imageBaseUrl = '') {
  const guardian = raw.guardian || {};
  const type = guardian.type || 'Minion';
  const elements = parseElements(raw.elements);
  const subTypes = parseSubTypes(raw.subTypes);
  const slug = raw.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  const printings = [];
  for (const set of raw.sets || []) {
    const setRarity = set.metadata?.rarity || guardian.rarity;
    for (const variant of set.variants || []) {
      printings.push({
        unique_id: variant.slug,
        set_printing_unique_id: variant.slug,
        id: variant.slug,
        set_id: set.name,
        edition: (variant.finish || 'S')[0].toUpperCase(),
        foiling: FOILING_CODE_MAP[variant.finish] || 'S',
        rarity: RARITY_CODE_MAP[setRarity] || '',
        expansion_slot: false,
        artists: variant.artist ? [variant.artist] : [],
        art_variations: [],
        flavor_text: variant.flavorText || '',
        image_url: buildSorceryImageUrl(variant.slug, imageBaseUrl),
        image_rotation_degrees: 0,
        tcgplayer_product_id: '',
        tcgplayer_url: '',
      });
    }
  }

  return {
    unique_id: `sorcery-${slug}`,
    name: raw.name,
    pitch: '',
    cost: statToString(guardian.cost),
    power: statToString(guardian.attack),
    defense: statToString(guardian.defence),
    health: statToString(guardian.life),
    intelligence: '',
    arcane: '',
    types: [type],
    traits: subTypes,
    card_keywords: [],
    abilities_and_effects: [],
    functional_text: guardian.rulesText || '',
    functional_text_plain: (guardian.rulesText || '').replace(/\r\n/g, '\n'),
    type_text: [guardian.rarity, type, ...subTypes].filter(Boolean).join(' '),
    played_horizontally: type === 'Site',
    blitz_legal: false,
    cc_legal: false,
    printings,
    // Fields used by deckMetrics and archive filters
    elements: elements.map((name) => ({ id: name.toLowerCase(), name })),
    type: type,
    rarity: guardian.rarity || '',
    waterThreshold: guardian.thresholds?.water || 0,
    earthThreshold: guardian.thresholds?.earth || 0,
    fireThreshold: guardian.thresholds?.fire || 0,
    airThreshold: guardian.thresholds?.air || 0,
    // Sorcery-specific metadata
    _sorcery: true,
    _sorceryCategory: getSorceryCategory(type),
  };
}

export function normalizeSorceryCards(rawCards, imageBaseUrl = '') {
  return (Array.isArray(rawCards) ? rawCards : []).map((card) => normalizeSorceryCard(card, imageBaseUrl));
}
