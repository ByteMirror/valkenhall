import { Component, createRef } from 'preact';
import { Sparkles } from 'lucide-react';
import DeckCardTile from './DeckCardTile';
import RuneSpinner from './RuneSpinner';
import { isFoilFinish } from '../utils/sorcery/foil.js';
import { purchaseCardWithShards } from '../utils/arena/matchmakingApi';
import { shardPriceForRarity } from '../utils/arena/profileDefaults';
import { buildOwnedMap } from '../utils/arena/collectionUtils';
import { playUI, UI } from '../utils/arena/uiSounds';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD,
  PANEL_BG, BEVELED_BTN, INPUT_STYLE, TAB_ACTIVE, TAB_INACTIVE, TAB_BAR_STYLE,
  FourCorners, SECTION_HEADER_STYLE,
} from '../lib/medievalTheme';
import VikingOrnament from './VikingOrnament';
import CardInspector from './CardInspector';
import { ShardIcon } from './ui/icons';

const SHARD_COLOR = '#7dd3fc';

const RARITY_COLORS = {
  Ordinary: TEXT_MUTED,
  Exceptional: '#6ea8d4',
  Elite: '#b480d4',
  Unique: ACCENT_GOLD,
  Avatar: '#c45050',
};

const RARITY_ORDER = { Ordinary: 0, Exceptional: 1, Elite: 2, Unique: 3 };

// Filter the full card catalog down to cards purchasable with shards:
// non-Avatar cards that have at least one non-foil printing.
function getPurchasableCards(sorceryCards) {
  if (!Array.isArray(sorceryCards)) return [];
  return sorceryCards.filter((card) => {
    if (!card?._sorcery) return false;
    if (card.type === 'Avatar') return false;
    if (!shardPriceForRarity(card.rarity)) return false;
    // Must have at least one non-foil printing so "buy a non-foil copy" is meaningful.
    return (card.printings || []).some((p) => !isFoilFinish(p.foiling));
  });
}

function pickStandardPrinting(card) {
  return (card.printings || []).find((p) => !isFoilFinish(p.foiling)) || card.printings?.[0] || null;
}

// Progressive rendering window. The full purchasable catalog is ~1000
// cards; rendering all of them at once instantiates a DeckCardTile per
// card (each with its own tilt handlers + gradients) and tanks
// performance. We render in chunks and use IntersectionObserver to grow
// the window as the user scrolls.
const INITIAL_VISIBLE = 60;
const LOAD_MORE_CHUNK = 60;

export default class StoreSinglesTab extends Component {
  constructor(props) {
    super(props);
    this.state = {
      searchQuery: '',
      rarityFilter: 'all',
      elementFilters: new Set(),
      sortBy: 'rarity',
      selectedCardId: null,
      purchasing: false,
      purchaseError: null,
      purchaseFlash: null,
      visibleCount: INITIAL_VISIBLE,
      hoveredCard: null,
      inspectedEntry: null,
    };
    this.gridScrollRef = createRef();
    this.observer = null;
  }

  componentDidMount() {
    document.addEventListener('keydown', this.handleInspectorKeyDown);
  }

  componentWillUnmount() {
    if (this.observer) this.observer.disconnect();
    document.removeEventListener('keydown', this.handleInspectorKeyDown);
  }

  // Space toggles the full-screen inspector for whichever card is currently
  // hovered in the grid (matches the deck editor / auction house behavior).
  // Escape always closes. Typing into a search/filter input is ignored so
  // the user can still hit space inside the search field.
  handleInspectorKeyDown = (e) => {
    const tag = e.target?.tagName;
    const editable = e.target?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if ((e.key === ' ' || e.code === 'Space') && !editable) {
      e.preventDefault();
      if (this.state.inspectedEntry) {
        this.setState({ inspectedEntry: null });
      } else if (this.state.hoveredCard) {
        this.setState({ inspectedEntry: this.state.hoveredCard });
      }
      return;
    }
    if (e.key === 'Escape' && this.state.inspectedEntry) {
      this.setState({ inspectedEntry: null });
    }
  };

  componentDidUpdate(_prevProps, prevState) {
    // Reset the visible window whenever the filtered set could have
    // changed. Jumping back to the top of the filter feels right, and
    // it also prevents a dangling "visibleCount > filtered.length"
    // state that would leave the sentinel unreachable.
    if (
      prevState.searchQuery !== this.state.searchQuery ||
      prevState.rarityFilter !== this.state.rarityFilter ||
      prevState.sortBy !== this.state.sortBy ||
      prevState.elementFilters !== this.state.elementFilters
    ) {
      // eslint-disable-next-line react/no-did-update-set-state
      this.setState({ visibleCount: INITIAL_VISIBLE });
      const el = this.gridScrollRef.current;
      if (el) el.scrollTop = 0;
    }
  }

  // Callback ref for the "load more" sentinel. Re-attaches the
  // IntersectionObserver each time the sentinel mounts — which happens
  // naturally whenever the filter / visibleCount changes because the
  // sentinel unmounts once the window reaches the full filtered length.
  attachSentinel = (el) => {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (!el) return;
    const root = this.gridScrollRef.current || null;
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          this.setState((s) => ({ visibleCount: s.visibleCount + LOAD_MORE_CHUNK }));
        }
      },
      { root, rootMargin: '600px' }
    );
    this.observer.observe(el);
  };

  handleSearch = (e) => {
    this.setState({ searchQuery: e.currentTarget.value });
  };

  toggleElementFilter = (el) => {
    this.setState((s) => {
      const next = new Set(s.elementFilters);
      if (next.has(el)) next.delete(el);
      else next.add(el);
      return { elementFilters: next };
    });
  };

  handleSelectCard = (cardId) => {
    playUI(UI.SELECT);
    this.setState({ selectedCardId: cardId, purchaseError: null });
  };

  handlePurchase = async () => {
    const { selectedCardId } = this.state;
    const { sorceryCards, profile, onProfileUpdate } = this.props;
    if (!selectedCardId) return;
    const card = sorceryCards.find((c) => c.unique_id === selectedCardId);
    if (!card) return;
    const price = shardPriceForRarity(card.rarity);
    if (!price || (profile.arcanaShards || 0) < price) return;

    this.setState({ purchasing: true, purchaseError: null });
    try {
      const result = await purchaseCardWithShards({ cardId: card.unique_id });
      playUI(UI.GOLD);
      // The server deducted the shards and added the card atomically;
      // sync the client profile to the returned totals and locally
      // bump the collection for immediate feedback. The local entry
      // uses the preferred standard printing for display purposes —
      // the server's collection storage is printing-agnostic, so this
      // is purely a client-side display choice.
      const printing = pickStandardPrinting(card);
      if (onProfileUpdate) {
        onProfileUpdate({
          arcanaShards: result.newTotals?.arcanaShards ?? ((profile.arcanaShards || 0) - price),
          collectionDelta: {
            cardId: card.unique_id,
            printingId: printing?.unique_id,
            quantity: 1,
          },
        });
      }
      this.setState({ purchasing: false, purchaseFlash: card.name });
      setTimeout(() => this.setState({ purchaseFlash: null }), 2000);
    } catch (err) {
      console.error('[StoreSinglesTab] purchase failed:', err);
      this.setState({
        purchasing: false,
        purchaseError: err?.message || 'Purchase failed. Please try again.',
      });
    }
  };

  render() {
    const { sorceryCards, profile } = this.props;
    const {
      searchQuery, rarityFilter, elementFilters, sortBy, selectedCardId,
      purchasing, purchaseError, purchaseFlash, visibleCount,
    } = this.state;

    const purchasable = getPurchasableCards(sorceryCards);
    const ownedMap = buildOwnedMap(profile?.collection || []);

    // Filter
    let filtered = purchasable;
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      filtered = filtered.filter((c) => c.name.toLowerCase().includes(query));
    }
    if (rarityFilter !== 'all') {
      filtered = filtered.filter((c) => c.rarity === rarityFilter);
    }
    if (elementFilters.size > 0) {
      filtered = filtered.filter((c) => (c.elements || []).some((e) => elementFilters.has(e.name)));
    }

    // Sort
    if (sortBy === 'rarity') {
      filtered = [...filtered].sort((a, b) => {
        const ra = RARITY_ORDER[a.rarity] ?? 99;
        const rb = RARITY_ORDER[b.rarity] ?? 99;
        if (ra !== rb) return ra - rb;
        return a.name.localeCompare(b.name);
      });
    } else if (sortBy === 'price') {
      filtered = [...filtered].sort((a, b) => (shardPriceForRarity(a.rarity) || 0) - (shardPriceForRarity(b.rarity) || 0));
    } else if (sortBy === 'name') {
      filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    }

    const selectedCard = selectedCardId ? sorceryCards.find((c) => c.unique_id === selectedCardId) : null;
    const selectedPrinting = selectedCard ? pickStandardPrinting(selectedCard) : null;
    const selectedPrice = selectedCard ? shardPriceForRarity(selectedCard.rarity) : null;
    const shardBalance = profile?.arcanaShards || 0;
    const canAfford = selectedPrice != null && shardBalance >= selectedPrice;
    const ownedCount = selectedCard ? (ownedMap.get(selectedCard.unique_id) || 0) : 0;

    return (
      <div className="flex gap-0 flex-1 min-h-0">
        {/* Left column: Filters + Card Grid */}
        <div className="flex-[65] flex flex-col min-h-0 pr-4">
          {/* Header strip */}
          <div className="mb-3">
            <h1 className="text-xl font-bold arena-heading mb-0.5" style={{ color: '#e8d5a0', textShadow: '0 2px 6px rgba(0,0,0,0.6)' }}>
              Card Singles
            </h1>
            <p className="text-xs" style={{ color: 'rgba(166,160,155,0.6)' }}>
              Purchase individual non-foil cards with Arcana
            </p>
          </div>

          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2 pb-3 mb-3" style={{ borderBottom: `1px solid ${GOLD} 0.08)` }}>
            <input
              type="text"
              placeholder="Search cards..."
              value={searchQuery}
              onInput={this.handleSearch}
              className="flex-1 min-w-[180px] px-3 py-2 text-sm outline-none"
              style={{ ...INPUT_STYLE, borderRadius: '6px', color: TEXT_PRIMARY }}
            />

            <div className="flex items-center" style={TAB_BAR_STYLE}>
              {['all', 'Ordinary', 'Exceptional', 'Elite', 'Unique'].map((r) => (
                <button
                  key={r}
                  type="button"
                  className="px-2.5 py-1.5 text-[11px] font-medium transition-colors cursor-pointer"
                  style={rarityFilter === r
                    ? { ...TAB_ACTIVE, color: r === 'all' ? '#e8d5a0' : RARITY_COLORS[r] }
                    : TAB_INACTIVE
                  }
                  onClick={() => this.setState({ rarityFilter: r })}
                >
                  {r === 'all' ? 'All' : r}
                </button>
              ))}
            </div>

            <div className="flex items-center" style={{ ...TAB_BAR_STYLE, borderLeft: `1px solid ${GOLD} 0.1)`, paddingLeft: 8 }}>
              {['price', 'rarity', 'name'].map((key) => (
                <button
                  key={key}
                  type="button"
                  className="px-3 py-1.5 text-[11px] font-medium transition-colors cursor-pointer capitalize"
                  style={sortBy === key ? TAB_ACTIVE : TAB_INACTIVE}
                  onClick={() => this.setState({ sortBy: key })}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>

          {/* Card grid */}
          <div ref={this.gridScrollRef} className="flex-1 overflow-y-auto min-h-0">
            {filtered.length === 0 ? (
              <div className="text-center py-16 text-sm" style={{ color: TEXT_MUTED }}>No cards match your filters</div>
            ) : (
              <>
                <div className="card-grid px-2">
                  {filtered.slice(0, visibleCount).map((card) => {
                    const printing = pickStandardPrinting(card);
                    const price = shardPriceForRarity(card.rarity);
                    const isSelected = selectedCardId === card.unique_id;
                    const owned = ownedMap.get(card.unique_id) || 0;
                    return (
                      <div
                        key={card.unique_id}
                        className="cursor-pointer"
                        onClick={() => this.handleSelectCard(card.unique_id)}
                      >
                        {printing ? (
                          <div className="relative">
                            <DeckCardTile
                              entry={{ card, printing, zone: 'spellbook', entryIndex: 0 }}
                              isSelected={isSelected}
                              onClick={() => this.handleSelectCard(card.unique_id)}
                              onHoverChange={(hovered) => this.setState({ hoveredCard: hovered ? { card, printing } : null })}
                            />
                            {owned > 0 ? (
                              <div className="absolute top-1 right-1 rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ background: 'rgba(0,0,0,0.7)', color: ACCENT_GOLD, border: `1px solid ${GOLD} 0.3)` }}>
                                ×{owned}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="w-full rounded-[14px] aspect-[63/88] flex items-center justify-center text-[10px]" style={{ background: `${GOLD} 0.04)`, color: TEXT_MUTED, border: `1px solid ${GOLD} 0.12)` }}>
                            {card.name}
                          </div>
                        )}
                        <div className="text-xs font-semibold truncate mt-1 text-center" style={{ color: TEXT_PRIMARY }}>
                          {card.name}
                        </div>
                        <div className="flex items-center justify-center gap-1 mt-0.5">
                          <ShardIcon size={11} />
                          <span className="text-xs font-bold tabular-nums" style={{ color: SHARD_COLOR }}>{price}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Load-more sentinel: when this element scrolls within
                    600px of the visible area, IntersectionObserver bumps
                    visibleCount and renders the next chunk. Only rendered
                    when there are more cards to reveal. */}
                {filtered.length > visibleCount ? (
                  <div ref={this.attachSentinel} className="flex items-center justify-center py-6 text-[10px] uppercase tracking-widest" style={{ color: TEXT_MUTED }}>
                    Loading more cards · {visibleCount} / {filtered.length}
                  </div>
                ) : (
                  <div className="py-4 text-center text-[10px]" style={{ color: 'rgba(166,160,155,0.3)' }}>
                    {filtered.length} card{filtered.length !== 1 ? 's' : ''}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right column: Card Preview + Buy action */}
        <div className="flex-[35] min-h-0 overflow-hidden">
          <div className="relative p-4 h-full flex flex-col" style={{ background: PANEL_BG, border: `1px solid ${GOLD} 0.2)`, borderRadius: '8px', isolation: 'isolate' }}>
            <FourCorners />
            <VikingOrnament ornament="style1007" variant="centerpiece" opacity={0.08} />
            {selectedCard && selectedPrinting ? (
              <div className="flex flex-col items-center gap-3 h-full min-h-0">
                <img
                  src={selectedPrinting.image_url}
                  alt={selectedCard.name}
                  className="rounded-lg object-cover bg-black/40 shrink min-h-0"
                  style={{ aspectRatio: '63 / 88', maxWidth: '60%' }}
                />
                <div className="w-full text-center shrink-0">
                  <div className="text-sm font-bold arena-heading" style={{ color: TEXT_PRIMARY, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                    {selectedCard.name}
                  </div>
                  <div className="text-[11px] font-semibold mt-0.5" style={{ color: RARITY_COLORS[selectedCard.rarity] || TEXT_MUTED }}>
                    {selectedCard.rarity}
                  </div>
                  {ownedCount > 0 ? (
                    <div className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>
                      You own: <span style={{ color: ACCENT_GOLD }}>{ownedCount}</span>
                    </div>
                  ) : (
                    <div className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>You don't own this card</div>
                  )}
                </div>

                <div className="w-full shrink-0 flex flex-col gap-2 mt-auto">
                  <div className="flex items-center justify-center gap-2 py-2 rounded" style={{ background: 'rgba(0,0,0,0.35)', border: `1px solid ${GOLD} 0.12)` }}>
                    <ShardIcon size={16} />
                    <span className="text-xl font-bold tabular-nums" style={{ color: SHARD_COLOR }}>{selectedPrice}</span>
                    <span className="text-[10px] uppercase tracking-wider" style={{ color: 'rgba(125,211,252,0.5)' }}>arcana</span>
                  </div>

                  <div className="text-[10px] text-center" style={{ color: TEXT_MUTED }}>
                    Balance: <span style={{ color: canAfford ? SHARD_COLOR : '#c45050' }}>{shardBalance}</span> arcana
                  </div>

                  {purchaseError ? (
                    <div className="text-[10px] text-center" style={{ color: '#c45050' }}>{purchaseError}</div>
                  ) : null}
                  {purchaseFlash ? (
                    <div className="text-[11px] text-center font-semibold" style={{ color: ACCENT_GOLD }}>
                      +1 {purchaseFlash} added!
                    </div>
                  ) : null}

                  <button
                    type="button"
                    disabled={!canAfford || purchasing}
                    className="w-full py-2.5 text-xs font-bold uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed"
                    style={{
                      ...BEVELED_BTN,
                      background: canAfford ? `linear-gradient(180deg, rgba(125,211,252,0.18), rgba(125,211,252,0.08))` : `rgba(20,16,10,0.7)`,
                      border: `1px solid ${canAfford ? 'rgba(125,211,252,0.5)' : 'rgba(166,160,155,0.2)'}`,
                      borderRadius: '4px',
                      color: canAfford ? SHARD_COLOR : 'rgba(166,160,155,0.4)',
                    }}
                    onClick={this.handlePurchase}
                  >
                    {purchasing ? (
                      <span className="flex items-center justify-center gap-2"><RuneSpinner size={14} /> Purchasing...</span>
                    ) : !canAfford ? (
                      `Need ${selectedPrice - shardBalance} more arcana`
                    ) : (
                      <span className="flex items-center justify-center gap-1.5">
                        <Sparkles size={12} /> Buy with Arcana
                      </span>
                    )}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        {this.state.inspectedEntry ? (
          <CardInspector
            card={this.state.inspectedEntry.card}
            imageUrl={this.state.inspectedEntry.printing?.image_url}
            rarity={this.state.inspectedEntry.card?.rarity}
            foiling={this.state.inspectedEntry.printing?.foiling}
            onClose={() => this.setState({ inspectedEntry: null })}
          />
        ) : null}
      </div>
    );
  }
}
