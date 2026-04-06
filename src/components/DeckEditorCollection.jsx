import { Component } from 'preact';
import { motion, AnimatePresence } from 'framer-motion';
import DeckCardTile from './DeckCardTile';
import CardInspector from './CardInspector';
import { isFoilFinish, FOIL_LABEL } from '../utils/sorcery/foil';
import { getMaxCopies } from '../utils/sorcery/deckRules';
import { playUI, UI } from '../utils/arena/uiSounds';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, INPUT_STYLE, ACCENT_GOLD,
  TAB_ACTIVE, TAB_INACTIVE,
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
      cardScope: 'deck',
      hoveredCard: null,
      inspectedEntry: null,
      visibleCount: 40,
      flashCardKey: null,
    };
  }

  componentDidMount() {
    window.addEventListener('keydown', this.handleKeyDown);
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this.handleKeyDown);
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

  handleScroll = (e) => {
    const el = e.target;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) {
      this.setState((s) => ({ visibleCount: s.visibleCount + 40 }));
    }
  };

  resetVisibleCount = () => {
    this.setState({ visibleCount: 40 });
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

  // Build a map of printingId -> owned quantity from the collection
  _buildPrintingOwnedMap() {
    const { collection } = this.props;
    const map = new Map();
    if (!collection) return map;
    for (const entry of collection) {
      map.set(entry.printingId, (map.get(entry.printingId) || 0) + entry.quantity);
    }
    return map;
  }

  getFilteredCards() {
    const { sorceryCards, ownedMap, chosenCards, collection } = this.props;
    const { searchQuery, elementFilters, typeFilters, setFilters, rarityFilters, cardScope } = this.state;

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

    cards.sort((a, b) => {
      const costDiff = (a.cost ?? 0) - (b.cost ?? 0);
      if (costDiff !== 0) return costDiff;
      return a.name.localeCompare(b.name);
    });

    // Expand cards into per-printing entries (standard vs foil vs rainbow)
    // so each foiling variant is shown as a separate tile
    if (!collection || collection.length === 0) return cards;

    const printingOwned = this._buildPrintingOwnedMap();
    const entries = [];
    for (const card of cards) {
      const printings = card.printings || [];
      // Group printings by foiling type
      const foilGroups = new Map(); // foiling -> { printing, ownedQty }
      for (const p of printings) {
        const foiling = p.foiling || 'S';
        const qty = printingOwned.get(p.unique_id) || 0;
        if (!foilGroups.has(foiling)) {
          foilGroups.set(foiling, { printing: p, ownedQty: qty });
        } else {
          const existing = foilGroups.get(foiling);
          existing.ownedQty += qty;
          // Prefer the printing that is owned
          if (qty > 0 && printingOwned.get(existing.printing.unique_id) === 0) {
            existing.printing = p;
          }
        }
      }

      // Always show the standard version first
      const standardGroup = foilGroups.get('S');
      if (standardGroup) {
        entries.push({ card, printing: standardGroup.printing, foiling: 'S', ownedQty: standardGroup.ownedQty });
      } else if (printings.length > 0) {
        // No standard printing exists — show the first available
        const first = printings[0];
        entries.push({ card, printing: first, foiling: first.foiling || 'S', ownedQty: 0 });
      }

      // Then show foil/rainbow variants if owned
      for (const [foiling, group] of foilGroups) {
        if (foiling === 'S') continue;
        if (group.ownedQty > 0 || cardScope === 'all') {
          entries.push({ card, printing: group.printing, foiling, ownedQty: group.ownedQty });
        }
      }
    }

    return entries;
  }

  renderFilterBar() {
    const { searchQuery, elementFilters, typeFilters, setFilters, rarityFilters } = this.state;

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

          <div className="flex items-center gap-0.5" style={{ borderRight: `1px solid ${GOLD} 0.12)`, paddingRight: 8 }}>
            <button type="button" style={toggleStyle(elementFilters.size === 0)} onClick={() => this.clearFilter('elementFilters')}>All</button>
            {['Water', 'Earth', 'Fire', 'Air'].map((el) => (
              <button key={el} type="button" className="flex items-center gap-1" style={toggleStyle(elementFilters.has(el))} onClick={() => this.toggleFilter('elementFilters', el)}>
                <SorceryElementIcon element={el} className="size-3" />
                <span className="hidden sm:inline">{el}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-0.5">
            <button type="button" style={toggleStyle(typeFilters.size === 0)} onClick={() => this.clearFilter('typeFilters')}>All</button>
            {['Avatar', 'Minion', 'Magic', 'Aura', 'Artifact', 'Site'].map((t) => (
              <button key={t} type="button" style={toggleStyle(typeFilters.has(t))} onClick={() => this.toggleFilter('typeFilters', t)}>{t}</button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-0.5">
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
          <div className="flex items-center gap-0.5">
            <span className="text-[9px] mr-0.5 uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Set</span>
            <button type="button" style={toggleStyle(setFilters.size === 0)} onClick={() => this.clearFilter('setFilters')}>All</button>
            {['gothic', 'arthurian', 'beta'].map((s) => (
              <button key={s} type="button" style={toggleStyle(setFilters.has(s))} onClick={() => this.toggleFilter('setFilters', s)}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
            ))}
          </div>

          <div className="flex items-center gap-0.5">
            <span className="text-[9px] mr-0.5 uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Rarity</span>
            <button type="button" style={toggleStyle(rarityFilters.size === 0)} onClick={() => this.clearFilter('rarityFilters')}>All</button>
            {['Ordinary', 'Exceptional', 'Elite', 'Unique'].map((r) => (
              <button key={r} type="button" style={toggleStyle(rarityFilters.has(r))} onClick={() => this.toggleFilter('rarityFilters', r)}>{r}</button>
            ))}
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
    const filledFilter = flash
      ? 'sepia(1) saturate(6) brightness(1.3) hue-rotate(-20deg)'
      : 'sepia(1) saturate(5) brightness(1.2) hue-rotate(15deg)';
    const emptyFilter = flash
      ? 'sepia(1) saturate(4) brightness(0.9) hue-rotate(-20deg)'
      : 'sepia(1) saturate(2) brightness(1.0) hue-rotate(15deg)';
    const filledShadow = flash ? '0 0 6px rgba(200,50,50,0.6)' : `0 0 3px ${ACCENT_GOLD}`;
    const emptyOutline = flash ? '1px solid rgba(200,60,60,0.5)' : '1px solid rgba(180,150,80,0.3)';

    if (owned > 6) {
      return (
        <motion.div
          className="flex items-center justify-center gap-1 mt-1.5"
          style={{ fontSize: '10px' }}
          animate={flash ? { scale: [1, 1.2, 1, 1.15, 1], x: [0, -3, 3, -2, 0] } : { scale: 1, x: 0 }}
          transition={{ duration: 0.5 }}
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
        animate={flash ? { scale: [1, 1.2, 1, 1.15, 1], x: [0, -3, 3, -2, 0] } : { scale: 1, x: 0 }}
        transition={{ duration: 0.5 }}
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
                outline: active ? 'none' : emptyOutline,
                filter: active ? `drop-shadow(${filledShadow})` : undefined,
                transition: 'filter 0.2s, outline 0.2s',
              }}
            >
              <img
                src="/rune-divider.webp"
                alt=""
                draggable={false}
                style={{
                  width: '100%',
                  height: '100%',
                  opacity: active ? 1 : 0.6,
                  filter: active ? filledFilter : emptyFilter,
                  transition: 'filter 0.2s, opacity 0.2s',
                }}
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

          // Per-printing ownership: count how many of THIS specific printing variant are owned & in deck
          let printingOwnedQty = isExpanded ? entry.ownedQty : (ownedMap?.get(card.unique_id) || 0);
          // Fallback for standard cards: if per-printing qty is 0 but card is owned, derive from total
          if (isExpanded && printingOwnedQty === 0 && foiling === 'S') {
            const totalOwned = ownedMap?.get(card.unique_id) || 0;
            const foilOwned = allEntries.filter((e2) =>
              e2.card?.unique_id === card.unique_id && e2.foiling && e2.foiling !== 'S'
            ).reduce((sum, e2) => sum + (e2.ownedQty || 0), 0);
            printingOwnedQty = Math.max(0, totalOwned - foilOwned);
          }
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
          const remainingByRarity = maxCopies - totalInCurrentDeck;
          const remainingByOwnership = totalOwned - totalInCurrentDeck;
          const available = Math.min(printingOwnedQty - inDeckWithPrinting, remainingByOwnership, remainingByRarity);
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
                    if (remainingByRarity <= 0) {
                      reason = `${card.rarity || 'This'} cards are limited to ${maxCopies} ${maxCopies === 1 ? 'copy' : 'copies'} per deck`;
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
          <div className="col-span-full text-center py-3" style={{ color: TEXT_MUTED, fontSize: '11px' }}>
            Showing {entries.length} of {allEntries.length} · scroll for more
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
        <div className="flex-1 overflow-y-auto min-h-0 px-10" onScroll={this.handleScroll}>
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
