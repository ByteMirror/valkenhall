import { Component, createRef } from 'preact';
import { motion, AnimatePresence } from 'framer-motion';
import DeckCardTile from './DeckCardTile';
import CardInspector from './CardInspector';
import { isFoilFinish, FOIL_LABEL } from '../utils/sorcery/foil';
import { getMaxCopies, getRemainingCopies } from '../utils/sorcery/deckRules';
import { buildFoilingOwnedMap, getOwnedQty } from '../utils/arena/collectionUtils';
import { playUI, UI } from '../utils/arena/uiSounds';
import { extractKeywordAbilities } from '../utils/game/sorceryKeywords';
import { MultiSelect } from './ui/multi-select';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, INPUT_STYLE, ACCENT_GOLD,
  TAB_ACTIVE, TAB_INACTIVE, TAB_BAR_STYLE,
} from '../lib/medievalTheme';

function SorceryElementIcon({ element, className = 'size-3.5' }) {
  const triangles = {
    Water: { points: '6,11 1,2 11,2', line: null, color: '#01FFFF' },
    Earth: { points: '6,11 1,2 11,2', line: [2.5, 5, 9.5, 5], color: '#CFA572' },
    Fire: { points: '6,1 11,10 1,10', line: null, color: '#FF5F00' },
    Air: { points: '6,1 11,10 1,10', line: [2.5, 7, 9.5, 7], color: '#A0BADB' },
  };
  const t = triangles[element];
  if (!t) return null;
  return (
    <svg viewBox="0 0 12 12" className={className} fill="none" stroke={t.color} strokeWidth="1.5" strokeLinejoin="round">
      <polygon points={t.points} />
      {t.line ? <line x1={t.line[0]} y1={t.line[1]} x2={t.line[2]} y2={t.line[3]} /> : null}
    </svg>
  );
}

const ELEMENTS = ['all', 'water', 'earth', 'fire', 'air'];
const TYPES = ['all', 'avatar', 'minion', 'magic', 'aura', 'artifact', 'site'];
const SETS = ['all', 'gothic', 'arthurian', 'beta'];
const RARITIES = ['all', 'ordinary', 'exceptional', 'elite', 'unique'];

const SET_ID_MAP = {
  gothic: 'Gothic',
  arthurian: 'Arthurian Legends',
  beta: 'Beta',
};

const TOGGLE_BASE = {
  padding: '3px 8px',
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: 600,
  transition: 'all 0.15s ease',
  textTransform: 'capitalize',
};

function toggleStyle(active) {
  return {
    ...TOGGLE_BASE,
    ...(active ? TAB_ACTIVE : TAB_INACTIVE),
  };
}

export default class DeckEditorCollection extends Component {
  constructor(props) {
    super(props);
    this.state = {
      searchQuery: '',
      elementFilters: new Set(),
      typeFilters: new Set(),
      setFilters: new Set(),
      rarityFilters: new Set(),
      keywordFilters: new Set(),
      cardScope: (props.chosenCards?.length || 0) > 0 ? 'deck' : 'owned',
      hoveredCard: null,
      inspectedEntry: null,
      visibleCount: 40,
      flashCardKey: null,
    };
    this.scrollRef = createRef();
    this.observer = null;
    // Lazily-built caches keyed by the current sorceryCards reference.
    // `_keywordIndex` maps unique_id -> Set<keyword name>; rebuilt whenever
    // the card catalog is swapped. `_keywordOptions` is the sorted option
    // list the MultiSelect renders.
    this._keywordCacheKey = null;
    this._keywordIndex = new Map();
    this._keywordOptions = [];
  }

  componentDidMount() {
    window.addEventListener('keydown', this.handleKeyDown);
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this.handleKeyDown);
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  toggleFilter = (key, value) => {
    this.setState((s) => {
      const next = new Set(s[key]);
      if (next.has(value)) next.delete(value); else next.add(value);
      return { [key]: next, visibleCount: 40 };
    });
  };

  clearFilter = (key) => {
    this.setState({ [key]: new Set(), visibleCount: 40 });
  };

  // Callback ref for the "load more" sentinel. IntersectionObserver
  // replaces the previous scroll-event handler because it only fires
  // when the sentinel actually enters the preload zone, rather than on
  // every scroll frame.
  attachSentinel = (el) => {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (!el) return;
    const root = this.scrollRef.current || null;
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          this.setState((s) => ({ visibleCount: s.visibleCount + 40 }));
        }
      },
      { root, rootMargin: '600px' }
    );
    this.observer.observe(el);
  };

  resetVisibleCount = () => {
    this.setState({ visibleCount: 40 });
    if (this.scrollRef.current) this.scrollRef.current.scrollTop = 0;
  };

  isEditableTarget = (el) => {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName?.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select';
  };

  handleKeyDown = (e) => {
    if ((e.key === ' ' || e.code === 'Space') && !this.isEditableTarget(e.target)) {
      e.preventDefault();
      if (this.state.inspectedEntry) {
        this.setState({ inspectedEntry: null });
      } else if (this.state.hoveredCard?.card) {
        const { card, printing } = this.state.hoveredCard;
        if (printing) this.setState({ inspectedEntry: { card, printing } });
      }
    }
    if (e.key === 'Escape' && this.state.inspectedEntry) {
      this.setState({ inspectedEntry: null });
    }
  };

  // Server stores collection as (cardId, foiling, quantity). Look up
  // ownership by foiling, not by printingId — multiple printings of the
  // same (card, foiling) collapse to one row on the server.
  _getFoilingOwnedMap() {
    const { collection } = this.props;
    if (this._cachedCollectionRef === collection && this._cachedFoilingMap) {
      return this._cachedFoilingMap;
    }
    this._cachedCollectionRef = collection;
    this._cachedFoilingMap = buildFoilingOwnedMap(collection || []);
    return this._cachedFoilingMap;
  }

  // Walk the catalog once per change of `sorceryCards` and collect every
  // keyword ability that actually appears on at least one card. Cached on
  // the instance because getFilteredCards runs on every render — parsing
  // rules text for every card on every keystroke would be wasteful.
  _getKeywordIndex() {
    const cards = this.props.sorceryCards || [];
    if (this._keywordCacheKey === cards) {
      return { index: this._keywordIndex, options: this._keywordOptions };
    }
    const index = new Map();
    const allKeywords = new Set();
    for (const card of cards) {
      const text = card.functional_text || card.functional_text_plain || '';
      const found = extractKeywordAbilities(text);
      if (found.length === 0) continue;
      const names = new Set();
      for (const { keyword } of found) {
        names.add(keyword);
        allKeywords.add(keyword);
      }
      index.set(card.unique_id, names);
    }
    const options = Array.from(allKeywords)
      .map((keyword) => ({ value: keyword, label: keyword }))
      .sort((a, b) => a.label.localeCompare(b.label));

    this._keywordCacheKey = cards;
    this._keywordIndex = index;
    this._keywordOptions = options;
    return { index, options };
  }

  getFilteredCards() {
    const { sorceryCards, ownedMap, chosenCards, collection } = this.props;
    const { searchQuery, elementFilters, typeFilters, setFilters, rarityFilters, keywordFilters, cardScope } = this.state;

    let cards = sorceryCards || [];

    if (cardScope === 'deck') {
      const deckCardIds = new Set((chosenCards || []).map((e) => e.card.unique_id));
      cards = cards.filter((c) => deckCardIds.has(c.unique_id));
    } else if (cardScope === 'owned') {
      cards = cards.filter((c) => (ownedMap?.get(c.unique_id) || 0) > 0);
    }

    if (searchQuery.length >= 2) {
      const q = searchQuery.toLowerCase();
      cards = cards.filter((c) => c.name.toLowerCase().includes(q));
    }

    if (elementFilters.size > 0) {
      cards = cards.filter((c) =>
        c.elements?.some((e) => elementFilters.has(e.name)),
      );
    }

    if (typeFilters.size > 0) {
      cards = cards.filter(
        (c) => typeFilters.has(c.type),
      );
    }

    if (setFilters.size > 0) {
      const setIds = new Set([...setFilters].map((s) => SET_ID_MAP[s]).filter(Boolean));
      cards = cards.filter((c) =>
        c.printings?.some((p) => setIds.has(p.set_id)),
      );
    }

    if (rarityFilters.size > 0) {
      cards = cards.filter(
        (c) => rarityFilters.has(c.rarity),
      );
    }

    if (keywordFilters.size > 0) {
      const { index } = this._getKeywordIndex();
      cards = cards.filter((c) => {
        const cardKeywords = index.get(c.unique_id);
        if (!cardKeywords) return false;
        for (const kw of keywordFilters) {
          if (cardKeywords.has(kw)) return true;
        }
        return false;
      });
    }

    cards.sort((a, b) => {
      const costDiff = (a.cost ?? 0) - (b.cost ?? 0);
      if (costDiff !== 0) return costDiff;
      return a.name.localeCompare(b.name);
    });

    // Expand cards into per-foiling entries (standard vs foil vs rainbow)
    // so each owned variant is shown as its own tile.
    const foilingOwned = this._getFoilingOwnedMap();
    const entries = [];

    // Pick the printing to use as the visual for a given (card, foiling).
    // Prefer one whose foiling matches; fall back to the first printing.
    const pickPrinting = (card, foiling) => {
      const printings = card.printings || [];
      return printings.find((p) => (p.foiling || 'S') === foiling) || printings[0];
    };

    for (const card of cards) {
      const ownedByFoiling = foilingOwned.get(card.unique_id) || new Map();

      // For 'deck' scope, build the set of foilings actually present in
      // the active deck for this card. This is the source of truth for
      // what 'In Deck' should display — owning a foil version of a card
      // whose standard version is in your deck must NOT cause the foil
      // to appear under 'In Deck'.
      const deckFoilings = cardScope === 'deck'
        ? new Set((chosenCards || []).filter((e) => e.card.unique_id === card.unique_id).map((e) => e.printing?.foiling || 'S'))
        : null;

      // Decide which foilings get a tile based on the active scope.
      // 'all'   → every printing the card has
      // 'deck'  → only foilings present in the deck for this card
      // 'owned' → only foilings the player actually owns
      let scopedFoilings;
      if (cardScope === 'all') {
        scopedFoilings = new Set((card.printings || []).map((p) => p.foiling || 'S'));
      } else if (cardScope === 'deck') {
        scopedFoilings = new Set(deckFoilings);
      } else {
        scopedFoilings = new Set(ownedByFoiling.keys());
      }

      // Standard tile is always rendered first when applicable.
      if (scopedFoilings.has('S')) {
        const printing = pickPrinting(card, 'S');
        if (printing) {
          entries.push({ card, printing, foiling: 'S', ownedQty: ownedByFoiling.get('S') || 0 });
        }
      }

      for (const foiling of scopedFoilings) {
        if (foiling === 'S') continue;
        const printing = pickPrinting(card, foiling);
        if (printing) {
          entries.push({ card, printing, foiling, ownedQty: ownedByFoiling.get(foiling) || 0 });
        }
      }
    }

    return entries;
  }

  renderFilterBar() {
    const { searchQuery, elementFilters, typeFilters, setFilters, rarityFilters, keywordFilters } = this.state;
    const { options: keywordOptions } = this._getKeywordIndex();

    return (
      <div className="flex flex-col gap-1.5 mb-3">
        {/* Row 1: Search + Elements + Type */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Search cards..."
            value={searchQuery}
            onInput={(e) => this.setState({ searchQuery: e.target.value, visibleCount: 40 })}
            className="px-3 py-1 text-sm flex-shrink-0"
            style={{ ...INPUT_STYLE, width: 160 }}
          />

          <div className="flex items-center" style={{ ...TAB_BAR_STYLE, borderRight: `1px solid ${GOLD} 0.12)`, paddingRight: 8 }}>
            <button type="button" style={toggleStyle(elementFilters.size === 0)} onClick={() => this.clearFilter('elementFilters')}>All</button>
            {['Water', 'Earth', 'Fire', 'Air'].map((el) => (
              <button key={el} type="button" className="flex items-center gap-1" style={toggleStyle(elementFilters.has(el))} onClick={() => this.toggleFilter('elementFilters', el)}>
                <SorceryElementIcon element={el} className="size-3" />
                <span className="hidden sm:inline">{el}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center" style={TAB_BAR_STYLE}>
            <button type="button" style={toggleStyle(typeFilters.size === 0)} onClick={() => this.clearFilter('typeFilters')}>All</button>
            {['Avatar', 'Minion', 'Magic', 'Aura', 'Artifact', 'Site'].map((t) => (
              <button key={t} type="button" style={toggleStyle(typeFilters.has(t))} onClick={() => this.toggleFilter('typeFilters', t)}>{t}</button>
            ))}
          </div>

          <div className="ml-auto flex items-center" style={TAB_BAR_STYLE}>
            {[
              { id: 'deck', label: 'In Deck' },
              { id: 'owned', label: 'Owned' },
              { id: 'all', label: 'All Cards' },
            ].map((scope) => (
              <button key={scope.id} type="button" style={toggleStyle(this.state.cardScope === scope.id)} onClick={() => this.setState({ cardScope: scope.id, visibleCount: 40 })}>{scope.label}</button>
            ))}
          </div>
        </div>

        {/* Row 2: Set + Rarity */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center" style={TAB_BAR_STYLE}>
            <span className="text-[9px] mr-0.5 uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Set</span>
            <button type="button" style={toggleStyle(setFilters.size === 0)} onClick={() => this.clearFilter('setFilters')}>All</button>
            {['gothic', 'arthurian', 'beta'].map((s) => (
              <button key={s} type="button" style={toggleStyle(setFilters.has(s))} onClick={() => this.toggleFilter('setFilters', s)}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
            ))}
          </div>

          <div className="flex items-center" style={TAB_BAR_STYLE}>
            <span className="text-[9px] mr-0.5 uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Rarity</span>
            <button type="button" style={toggleStyle(rarityFilters.size === 0)} onClick={() => this.clearFilter('rarityFilters')}>All</button>
            {['Ordinary', 'Exceptional', 'Elite', 'Unique'].map((r) => (
              <button key={r} type="button" style={toggleStyle(rarityFilters.has(r))} onClick={() => this.toggleFilter('rarityFilters', r)}>{r}</button>
            ))}
          </div>

          <div className="flex items-center gap-1 ml-2">
            <span className="text-[9px] uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Keywords</span>
            <MultiSelect
              ariaLabel="Keyword filter"
              className="w-[180px]"
              options={keywordOptions}
              value={Array.from(keywordFilters)}
              onValueChange={(next) =>
                this.setState({ keywordFilters: new Set(next), visibleCount: 40 })
              }
              placeholder="Any keyword"
              menuSearchPlaceholder="Search keywords…"
              noOptionsMessage="No keywords"
              menuPreferredWidth={260}
              portalMenu
              triggerHeight={28}
            />
          </div>
        </div>
      </div>
    );
  }

  renderOwnershipDots(card) {
    const { ownedMap, chosenCards } = this.props;
    const owned = ownedMap?.get(card.unique_id) || 0;
    const inDeck = (chosenCards || []).filter((e) => e.card.unique_id === card.unique_id).length;
    const total = owned;

    if (total > 6) {
      return (
        <div className="flex items-center justify-center gap-1 mt-1.5" style={{ fontSize: '10px' }}>
          <span style={{ color: ACCENT_GOLD }}>{inDeck}</span>
          <span style={{ color: TEXT_MUTED }}>/</span>
          <span style={{ color: TEXT_MUTED }}>{owned}</span>
        </div>
      );
    }

    const filled = { width: 16, height: 16, opacity: 1, filter: 'sepia(1) saturate(5) brightness(1.2) hue-rotate(15deg)', dropShadow: `0 0 3px ${ACCENT_GOLD}` };
    const empty = { width: 16, height: 16, opacity: 0.6, filter: 'sepia(1) saturate(2) brightness(1.0) hue-rotate(15deg)' };

    return (
      <div className="flex items-center justify-center gap-1 mt-1.5">
        {Array.from({ length: total }, (_, i) => {
          const active = i < inDeck;
          return (
            <div
              key={i}
              style={{
                width: 16,
                height: 16,
                borderRadius: 3,
                outline: active ? 'none' : `1px solid rgba(180,150,80,0.3)`,
                filter: active ? `drop-shadow(${filled.dropShadow})` : undefined,
              }}
            >
              <img
                src="/rune-divider.webp"
                alt=""
                draggable={false}
                style={active
                  ? { width: '100%', height: '100%', opacity: filled.opacity, filter: filled.filter }
                  : { width: '100%', height: '100%', opacity: empty.opacity, filter: empty.filter }
                }
              />
            </div>
          );
        })}
      </div>
    );
  }

  renderOwnershipDotsForPrinting(owned, inUse, flash = false) {
    const filled = { opacity: 1, filter: 'sepia(1) saturate(5) brightness(1.2) hue-rotate(15deg)', dropShadow: `0 0 3px ${ACCENT_GOLD}` };
    const empty = { opacity: 0.6, filter: 'sepia(1) saturate(2) brightness(1.0) hue-rotate(15deg)' };

    if (owned > 6) {
      return (
        <motion.div
          className="flex items-center justify-center gap-1 mt-1.5"
          style={{ fontSize: '10px' }}
          animate={flash ? { scale: [1, 1.15, 1, 1.1, 1], x: [0, -2, 2, -1, 0] } : { scale: 1, x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <span style={{ color: flash ? '#c45050' : ACCENT_GOLD }}>{inUse}</span>
          <span style={{ color: TEXT_MUTED }}>/</span>
          <span style={{ color: flash ? '#c45050' : TEXT_MUTED }}>{owned}</span>
        </motion.div>
      );
    }

    return (
      <motion.div
        className="flex items-center justify-center gap-1 mt-1.5"
        animate={flash ? { scale: [1, 1.15, 1, 1.1, 1], x: [0, -2, 2, -1, 0] } : { scale: 1, x: 0 }}
        transition={{ duration: 0.4 }}
      >
        {Array.from({ length: owned }, (_, i) => {
          const active = i < inUse;
          return (
            <div
              key={i}
              style={{
                width: 16,
                height: 16,
                borderRadius: 3,
                outline: active ? 'none' : `1px solid rgba(180,150,80,0.3)`,
                filter: active ? `drop-shadow(${filled.dropShadow})` : undefined,
              }}
            >
              <img
                src="/rune-divider.webp"
                alt=""
                draggable={false}
                style={active
                  ? { width: '100%', height: '100%', opacity: filled.opacity, filter: filled.filter }
                  : { width: '100%', height: '100%', opacity: empty.opacity, filter: empty.filter }
                }
              />
            </div>
          );
        })}
      </motion.div>
    );
  }

  renderCardGrid(allEntries) {
    const entries = allEntries.slice(0, this.state.visibleCount);
    const { ownedMap, chosenCards, onAddCard } = this.props;

    if (entries.length === 0) {
      return (
        <div className="flex items-center justify-center py-12" style={{ color: TEXT_MUTED }}>
          <span className="text-sm">No cards match your filters.</span>
        </div>
      );
    }

    return (
      <div className="card-grid" style={{ padding: '8px 0' }}>
        {entries.map((entry) => {
          // Support both old format (plain card) and new format ({ card, printing, foiling, ownedQty })
          const isExpanded = entry.card && entry.printing && entry.foiling !== undefined;
          const card = isExpanded ? entry.card : entry;
          const printing = isExpanded ? entry.printing : (card.printings?.[card.printings.length - 1] || card.printings?.[0]);
          const foiling = isExpanded ? entry.foiling : (printing?.foiling || 'S');
          const isFoilEntry = isFoilFinish(foiling);

          // Per-foiling ownership comes from the expanded entry — the
          // server stores collection by (cardId, foiling), so this value
          // is authoritative. No fallback math needed.
          const printingOwnedQty = isExpanded ? entry.ownedQty : (ownedMap?.get(card.unique_id) || 0);
          // Cards of this foiling in the current deck
          const inDeckWithPrinting = (chosenCards || []).filter((e) =>
            e.card.unique_id === card.unique_id && (e.printing?.foiling || 'S') === foiling
          ).length;
          // Total of this card in the current deck (all foilings)
          const totalInCurrentDeck = (chosenCards || []).filter((e) =>
            e.card.unique_id === card.unique_id
          ).length;
          const totalOwned = ownedMap?.get(card.unique_id) || 0;
          const maxCopies = getMaxCopies(card);
          // For non-singleton cards this is `maxCopies - totalInCurrentDeck`.
          // For Avatars it's `1 - (any avatar in deck ? 1 : 0)`, so a second
          // different avatar correctly reports zero remaining slots — the
          // rule is "one Avatar per deck", not "one of each Avatar".
          const remainingByLimit = getRemainingCopies(card, chosenCards);
          const remainingByOwnership = totalOwned - totalInCurrentDeck;
          const available = Math.min(printingOwnedQty - inDeckWithPrinting, remainingByOwnership, remainingByLimit);
          const unowned = printingOwnedQty === 0 && inDeckWithPrinting === 0;

          const key = `${card.unique_id}-${foiling}`;
          const isHovered = this.state.hoveredCard?.key === key;

          const cardStyle = unowned
            ? { opacity: 0.3, filter: 'grayscale(1) brightness(0.6)' }
            : {};

          return (
            <div
              key={key}
              className="transition-all duration-150"
              style={{
                ...cardStyle,
                position: 'relative',
                zIndex: isHovered ? 50 : 'auto',
              }}
            >
              <DeckCardTile
                entry={{ card, printing: printing || {}, zone: 'spellbook', entryIndex: 0 }}
                isSelected={false}
                onClick={() => {
                  if (unowned) return;
                  if (available <= 0) {
                    let reason;
                    if (remainingByLimit <= 0) {
                      reason = card.type === 'Avatar'
                        ? 'Only one Avatar is allowed per deck'
                        : `${card.rarity || 'This'} cards are limited to ${maxCopies} ${maxCopies === 1 ? 'copy' : 'copies'} per deck`;
                    } else {
                      reason = `All ${printingOwnedQty} owned ${printingOwnedQty === 1 ? 'copy' : 'copies'} of ${card.name}${isFoilEntry ? ` (${FOIL_LABEL[foiling]})` : ''} already in this deck`;
                    }
                    playUI(UI.ERROR);
                    this.props.onShowToast?.(reason);
                    this.setState({ flashCardKey: key });
                    setTimeout(() => this.setState({ flashCardKey: null }), 600);
                    return;
                  }
                  playUI(UI.EQUIP);
                  onAddCard?.(card, printing);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (inDeckWithPrinting > 0) {
                    playUI(UI.UNEQUIP);
                    this.props.onRemoveCard?.(card.unique_id, foiling);
                  }
                }}
                onHoverChange={(hovered) => this.setState({ hoveredCard: hovered ? { key, card, printing } : null })}
              />
              {printingOwnedQty > 0 && this.renderOwnershipDotsForPrinting(printingOwnedQty, inDeckWithPrinting, this.state.flashCardKey === key)}
              <div
                className="text-center mt-0.5 truncate px-1"
                style={{ fontSize: '10px', color: isFoilEntry ? (foiling === 'R' ? '#d98eff' : '#6dd5ed') : TEXT_MUTED, lineHeight: 1.3 }}
              >
                {card.name}{isFoilEntry ? ` (${FOIL_LABEL[foiling] || 'Foil'})` : ''}
              </div>
            </div>
          );
        })}
        {allEntries.length > entries.length && (
          <div
            ref={this.attachSentinel}
            className="col-span-full text-center py-3"
            style={{ color: TEXT_MUTED, fontSize: '11px' }}
          >
            Loading more cards · {entries.length} / {allEntries.length}
          </div>
        )}
      </div>
    );
  }

  render() {
    const cards = this.getFilteredCards();
    const { inspectedEntry } = this.state;

    return (
      <div className="flex flex-col h-full min-h-0">
        {this.renderFilterBar()}
        <div ref={this.scrollRef} className="flex-1 overflow-y-auto min-h-0 px-10">
          {this.renderCardGrid(cards)}
        </div>
        {inspectedEntry ? (
          <CardInspector
            card={inspectedEntry.card}
            imageUrl={inspectedEntry.printing?.image_url}
            rarity={inspectedEntry.card?.rarity}
            foiling={inspectedEntry.printing?.foiling}
            onClose={() => this.setState({ inspectedEntry: null })}
          />
        ) : null}
      </div>
    );
  }
}
