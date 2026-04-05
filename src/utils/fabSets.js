import { FAB_SET_NAME_BY_ID } from './fabSetCatalog';

export function normalizeSetId(setId) {
  return String(setId || '').trim().toUpperCase();
}

export function getFabSetName(setId) {
  const normalizedSetId = normalizeSetId(setId);

  if (!normalizedSetId) {
    return '';
  }

  return FAB_SET_NAME_BY_ID[normalizedSetId] || normalizedSetId;
}

export function printingMatchesSetFilter(printing, setFilter = 'all') {
  const normalizedFilter = normalizeSetId(setFilter);

  if (!normalizedFilter || normalizedFilter === 'ALL') {
    return true;
  }

  return normalizeSetId(printing?.set_id) === normalizedFilter;
}

export function buildArchiveSetOptions(cards = []) {
  const setIds = [
    ...new Set(
      (Array.isArray(cards) ? cards : []).flatMap((card) =>
        (card?.printings || []).map((printing) => normalizeSetId(printing?.set_id)).filter(Boolean)
      )
    ),
  ].sort((left, right) => getFabSetName(left).localeCompare(getFabSetName(right)));

  return [
    { value: 'all', label: 'All sets' },
    ...setIds.map((setId) => ({ value: setId, label: getFabSetName(setId) })),
  ];
}
