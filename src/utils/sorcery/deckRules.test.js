import { describe, expect, it } from 'bun:test';
import { canAddCard, getRemainingCopies, getMaxCopies } from './deckRules';

const savior = { unique_id: 'sorcery-savior', name: 'Savior', type: 'Avatar', rarity: '' };
const imposter = { unique_id: 'sorcery-imposter', name: 'Imposter', type: 'Avatar', rarity: '' };
const minion = { unique_id: 'sorcery-minion', name: 'Minion', type: 'Minion', rarity: 'Ordinary' };
const elite = { unique_id: 'sorcery-elite', name: 'Elite', type: 'Minion', rarity: 'Elite' };

const asEntry = (card) => ({ card, printing: { foiling: 'S' } });

describe('deckRules: Avatar singleton rule', () => {
  it('allows the first Avatar in an empty deck', () => {
    expect(canAddCard(savior, []).allowed).toBe(true);
  });

  it('rejects a second copy of the same Avatar', () => {
    const result = canAddCard(savior, [asEntry(savior)]);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Only one Avatar is allowed per deck');
  });

  it('rejects a different Avatar when one is already in the deck', () => {
    // This is the regression guard for the "one per Avatar card" bug —
    // the rule is one Avatar TOTAL per deck, not one of each.
    const result = canAddCard(imposter, [asEntry(savior)]);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Only one Avatar is allowed per deck');
  });

  it('reports 0 remaining copies for any Avatar once one is slotted', () => {
    const chosen = [asEntry(savior)];
    expect(getRemainingCopies(savior, chosen)).toBe(0);
    expect(getRemainingCopies(imposter, chosen)).toBe(0);
  });

  it('reports 1 remaining for any Avatar when the deck is empty', () => {
    expect(getRemainingCopies(savior, [])).toBe(1);
    expect(getRemainingCopies(imposter, [])).toBe(1);
  });
});

describe('deckRules: rarity-based copy limits still work', () => {
  it('allows 4 copies of an Ordinary minion and blocks the 5th', () => {
    const chosen = Array.from({ length: 4 }, () => asEntry(minion));
    expect(canAddCard(minion, chosen).allowed).toBe(false);
    expect(getRemainingCopies(minion, chosen.slice(0, 3))).toBe(1);
  });

  it('allows 2 copies of an Elite minion and blocks the 3rd', () => {
    const chosen = [asEntry(elite), asEntry(elite)];
    expect(canAddCard(elite, chosen).allowed).toBe(false);
    expect(getRemainingCopies(elite, [asEntry(elite)])).toBe(1);
  });

  it('does not count copies of different non-singleton cards toward a card’s limit', () => {
    const otherMinion = { ...minion, unique_id: 'sorcery-other', name: 'Other' };
    const chosen = [asEntry(otherMinion), asEntry(otherMinion), asEntry(otherMinion), asEntry(otherMinion)];
    // Four Others in the deck — we can still add four of the original minion.
    expect(getRemainingCopies(minion, chosen)).toBe(4);
  });
});

describe('deckRules: ownership is per-card, not per-type', () => {
  it('owning one Savior does not block adding an Imposter to an empty deck', () => {
    // Ownership map is per-card: you may own many different Avatars. The
    // singleton rule is about deck-building, not ownership.
    const ownedMap = new Map([['sorcery-savior', 1], ['sorcery-imposter', 1]]);
    expect(canAddCard(imposter, [], { ownedMap }).allowed).toBe(true);
  });

  it('blocks adding a card you do not own', () => {
    const ownedMap = new Map();
    const result = canAddCard(minion, [], { ownedMap });
    expect(result.allowed).toBe(false);
  });
});

describe('getMaxCopies sanity', () => {
  it('returns 1 for Avatar', () => expect(getMaxCopies(savior)).toBe(1));
  it('returns 4 for Ordinary', () => expect(getMaxCopies(minion)).toBe(4));
  it('returns 2 for Elite', () => expect(getMaxCopies(elite)).toBe(2));
});
