export const SORCERY_SETS = [
  { id: 'Alpha', name: 'Alpha' },
  { id: 'Beta', name: 'Beta' },
  { id: 'Arthurian Legends', name: 'Arthurian Legends' },
  { id: 'Gothic', name: 'Gothic' },
  { id: 'Dragonlord', name: 'Dragonlord' },
  { id: 'Promotional', name: 'Promotional' },
];

export function getSorcerySetName(setId) {
  return setId || '';
}

function getCardSetNames(card) {
  return [...new Set((card?.printings || []).map((p) => p.set_id).filter(Boolean))];
}

export function buildSorceryArchiveSetOptions(cards = []) {
  const setNames = [
    ...new Set(
      (Array.isArray(cards) ? cards : []).flatMap((card) => getCardSetNames(card))
    ),
  ].sort((a, b) => a.localeCompare(b));

  return [
    { value: 'all', label: 'All sets' },
    ...setNames.map((name) => ({ value: name, label: name })),
  ];
}

export function sorceryCardMatchesSetFilter(card, setFilter = 'all') {
  if (!setFilter || setFilter === 'all') {
    return true;
  }

  return getCardSetNames(card).includes(setFilter);
}
