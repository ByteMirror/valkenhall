import { api } from '../serverClient';

// Store-visible booster sets. The server rolls the actual contents, but
// the client still needs display metadata (label) and the wire key that
// the server accepts on /packs/purchase. The server enforces that only
// these keys are accepted; keep this in sync with BOOSTER_SETS in
// valkenhall-server/src/utils/packs.js.
export const BOOSTER_SETS = {
  gothic:    { name: 'gothic',    label: 'Gothic' },
  arthurian: { name: 'arthurian', label: 'Arthurian Legends' },
  beta:      { name: 'beta',      label: 'Beta' },
};

export const PACK_SIZE = 15;

// Resolve a single server-rolled pack entry against the client's
// sorceryCards index. Server sends { cardId, printingId, foiling, rarity };
// the pack-opening UI needs { card, printing } with the full card object
// so it can render art, name, stats, etc.
//
// If the card or its printing isn't found (e.g. the client's card data
// is stale), the entry is skipped. That shouldn't happen in practice
// because the server pool is built from the same sorcery-cards.json, but
// we degrade gracefully instead of crashing the UI.
export function resolvePackContents(contents, sorceryCards) {
  if (!Array.isArray(contents) || !Array.isArray(sorceryCards)) return [];

  const cardsById = new Map();
  for (const card of sorceryCards) {
    if (card?.unique_id) cardsById.set(card.unique_id, card);
  }

  const resolved = [];
  for (const entry of contents) {
    const card = cardsById.get(entry.cardId);
    if (!card) continue;
    const printing =
      card.printings?.find((p) => p.unique_id === entry.printingId) ||
      card.printings?.find((p) => p.foiling === (entry.foiling || 'S')) ||
      card.printings?.[0] ||
      {};
    resolved.push({ card, printing });
  }
  return resolved;
}

// Transform a server pack row { id, setKey, contents } into the shape
// the local state uses: { id, setKey, cards: [{card, printing}] }. The
// id is the pending_packs row id, which the client sends back on open.
export function resolvePack(pack, sorceryCards) {
  return {
    id: pack.id,
    setKey: pack.setKey,
    cards: resolvePackContents(pack.contents, sorceryCards),
  };
}

export function resolvePendingPacks(pendingPacks, sorceryCards) {
  if (!Array.isArray(pendingPacks)) return [];
  return pendingPacks.map((p) => resolvePack(p, sorceryCards));
}

// Buy N packs of a set. Server rolls contents, deducts coins atomically,
// and returns the freshly-rolled packs plus the new coin balance.
export async function purchasePacks(setKey, quantity) {
  return api.post('/profile/me/packs/purchase', { setKey, quantity });
}

// Open a pending pack by server id. Server deletes the pending row,
// grants the contents, and returns { pack, collection }.
export async function openPendingPack(packId) {
  return api.post(`/profile/me/packs/${encodeURIComponent(packId)}/open`, {});
}
