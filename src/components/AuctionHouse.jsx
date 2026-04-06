import { Component } from 'preact';
import { Mail, Users, Sparkles } from 'lucide-react';
import AppHeader from './AppHeader';
import AmbientParticles from './AmbientParticles';
import StoreTorchFX from './StoreTorchFX';
import DeckCardTile from './DeckCardTile';
import RuneSpinner from './RuneSpinner';
import { isFoilFinish, FOIL_LABEL } from '../utils/sorcery/foil.js';
import { playUI, UI } from '../utils/arena/uiSounds';
import { cn } from '../lib/utils';
import {
  fetchListings,
  fetchMyListings,
  createListing,
  buyListing,
  cancelListing,
  syncCoins,
} from '../utils/arena/auctionApi';
import { buildOwnedMap, buildUsedMap, getAvailableQuantity } from '../utils/arena/collectionUtils';
import {
  BG_ATMOSPHERE, VIGNETTE, GOLD, GOLD_TEXT, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED,
  PANEL_BG, PANEL_BORDER, BEVELED_BTN, GOLD_BTN, DANGER_BTN, INPUT_STYLE,
  TAB_ACTIVE, TAB_INACTIVE, COIN_COLOR, ACCENT_GOLD,
  DIALOG_STYLE, FourCorners, OrnamentalDivider, SECTION_HEADER_STYLE,
  getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';

function cardImageUrl(card, printingId) {
  if (printingId && card?.printings) {
    const match = card.printings.find((p) => p.unique_id === printingId);
    if (match) return match.image_url || '';
  }
  return card?.printings?.[0]?.image_url || '';
}

function findCard(sorceryCards, cardId) {
  return (sorceryCards || []).find((c) => c.unique_id === cardId);
}

function sortIndicator(activeKey, currentKey, order) {
  if (activeKey !== currentKey) return '';
  return order === 'asc' ? ' \u2191' : ' \u2193';
}

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

const AUCTION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function formatTimeRemaining(createdAt, now) {
  if (!createdAt) return null;
  const expires = new Date(createdAt).getTime() + AUCTION_DURATION_MS;
  const remaining = expires - now;
  if (remaining <= 0) return 'Expired';
  const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
  const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  const secs = Math.floor((remaining % (60 * 1000)) / 1000);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
}

const RARITY_COLORS = {
  Ordinary: TEXT_MUTED,
  Exceptional: '#6ea8d4',
  Elite: '#b480d4',
  Unique: ACCENT_GOLD,
  Avatar: '#c45050',
};

const CARD_TILE_STYLE = {
  background: PANEL_BG,
  border: `1px solid ${GOLD} 0.12)`,
  borderRadius: '8px',
};

const SIDEBAR_PANEL = {
  background: PANEL_BG,
  borderLeft: `1px solid ${GOLD} 0.25)`,
};

export default class AuctionHouse extends Component {
  constructor(props) {
    super(props);
    this.state = {
      tab: 'browse',
      listings: [],
      listingsTotal: 0,
      listingsLoading: false,
      searchQuery: '',
      sortBy: 'date',
      sortOrder: 'desc',
      page: 0,
      selectedCardId: null,
      selectedFoiling: 'S',
      sellPrice: '',
      sellQuantity: 1,
      sellLoading: false,
      sellError: null,
      myListings: [],
      myListingsLoading: false,
      error: null,
      syncing: false,
      buyingId: null,
      cancellingId: null,
      viewScale: getViewportScale(),
      previewListing: null,
      elementFilters: new Set(),
      foilOnly: false,
      sellSearch: '',
      now: Date.now(),
    };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
    this._tickTimer = setInterval(() => this.setState({ now: Date.now() }), 1000);
    this.doSync();
    this.loadListings();
  }

  componentWillUnmount() {
    this.unsubScale?.();
    clearInterval(this._tickTimer);
    clearTimeout(this._purchaseMsgTimer);
  }

  doSync = async () => {
    const { profile } = this.props;
    if (!profile.serverToken) return;
    this.setState({ syncing: true });
    try {
      const result = await syncCoins(profile.serverToken, profile.coins);
      if (result.coins !== profile.coins) {
        this.props.onUpdateProfile({ ...profile, coins: result.coins });
      }
    } catch {
    } finally {
      this.setState({ syncing: false });
    }
  };

  loadListings = async () => {
    this.setState({ listingsLoading: true, error: null });
    try {
      const { searchQuery, sortBy, sortOrder, page } = this.state;
      const result = await fetchListings({
        search: searchQuery || undefined,
        sortBy,
        sortOrder,
        limit: 50,
        offset: page * 50,
      });
      this.setState({ listings: result.listings, listingsTotal: result.total });
    } catch (err) {
      this.setState({ error: err.message });
    } finally {
      this.setState({ listingsLoading: false });
    }
  };

  handleSearch = (e) => {
    this.setState({ searchQuery: e.target.value, page: 0 }, () => {
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(this.loadListings, 300);
    });
  };

  handleSort = (sortBy) => {
    this.setState(
      (s) => ({
        sortBy,
        sortOrder: s.sortBy === sortBy && s.sortOrder === 'asc' ? 'desc' : 'asc',
        page: 0,
      }),
      this.loadListings,
    );
  };

  handleBuy = async (listing) => {
    const { profile } = this.props;
    if (listing.price > profile.coins) {
      playUI(UI.ERROR);
      this.setState({ error: 'Not enough coins' });
      return;
    }
    this.setState({ buyingId: listing.id, error: null });
    try {
      const result = await buyListing(profile.serverToken, listing.id);
      // Card is delivered via mail from the server — only update coins
      playUI(UI.PURCHASE);
      this.props.onUpdateProfile({ ...profile, coins: result.newBalance });
      this.setState((s) => ({
        listings: s.listings.filter((l) => l.id !== listing.id),
        listingsTotal: s.listingsTotal - 1,
        previewListing: s.previewListing?.id === listing.id ? null : s.previewListing,
        purchaseMessage: `${listing.cardName || 'Card'} purchased! Check your mailbox to collect it.`,
      }));
      clearTimeout(this._purchaseMsgTimer);
      this._purchaseMsgTimer = setTimeout(() => this.setState({ purchaseMessage: null }), 5000);
    } catch (err) {
      this.setState({ error: err.message });
    } finally {
      this.setState({ buyingId: null });
    }
  };

  handleCreateListing = async () => {
    const { profile, sorceryCards } = this.props;
    const { selectedCardId, sellPrice, sellQuantity } = this.state;
    const price = parseInt(sellPrice, 10);
    const qty = Math.max(1, parseInt(sellQuantity, 10) || 1);
    if (!selectedCardId || !price || price <= 0) return;

    const card = findCard(sorceryCards, selectedCardId);
    if (!card) return;

    this.setState({ sellLoading: true, sellError: null });
    try {
      const foiling = this.state.selectedFoiling || 'S';
      for (let i = 0; i < qty; i++) {
        await createListing(profile.serverToken, selectedCardId, card.name, price, foiling);
      }
      let collection = [...profile.collection];
      for (let i = 0; i < qty; i++) {
        collection = collection
          .map((c) => (c.cardId === selectedCardId ? { ...c, quantity: c.quantity - 1 } : c))
          .filter((c) => c.quantity > 0);
      }
      playUI(UI.GOLD);
      this.props.onUpdateProfile({ ...profile, collection });
      this.setState({ selectedCardId: null, selectedFoiling: 'S', sellPrice: '', sellQuantity: 1 });
      this.loadMyListings();
    } catch (err) {
      this.setState({ sellError: err.message });
    } finally {
      this.setState({ sellLoading: false });
    }
  };

  loadMyListings = async () => {
    const { profile } = this.props;
    this.setState({ myListingsLoading: true, error: null });
    try {
      const result = await fetchMyListings(profile.serverToken);
      this.setState({ myListings: result.listings });
    } catch (err) {
      this.setState({ error: err.message });
    } finally {
      this.setState({ myListingsLoading: false });
    }
  };

  handleCancel = async (listing) => {
    const { profile } = this.props;
    this.setState({ cancellingId: listing.id, error: null });
    try {
      await cancelListing(profile.serverToken, listing.id);
      // Card is returned via mail from the server
      this.setState((s) => ({
        myListings: s.myListings.map((l) =>
          l.id === listing.id ? { ...l, status: 'cancelled' } : l,
        ),
        purchaseMessage: `${listing.cardName || 'Card'} listing cancelled. Check your mailbox to collect it.`,
      }));
      clearTimeout(this._purchaseMsgTimer);
      this._purchaseMsgTimer = setTimeout(() => this.setState({ purchaseMessage: null }), 5000);
    } catch (err) {
      this.setState({ error: err.message });
    } finally {
      this.setState({ cancellingId: null });
    }
  };

  switchTab = (tab) => {
    this.setState({ tab, error: null });
    if (tab === 'browse') this.loadListings();
    if (tab === 'sell') this.loadMyListings();
  };

  toggleElementFilter = (el) => {
    this.setState((s) => {
      const next = new Set(s.elementFilters);
      if (next.has(el)) next.delete(el);
      else next.add(el);
      return { elementFilters: next };
    });
  };

  renderBrowse() {
    const { sorceryCards, profile } = this.props;
    const {
      listings, listingsTotal, listingsLoading, searchQuery,
      sortBy, sortOrder, page, previewListing, buyingId, elementFilters,
    } = this.state;

    const previewCard = previewListing ? findCard(sorceryCards, previewListing.cardId) : null;
    const canAfford = previewListing ? previewListing.price <= profile.coins : false;

    let filteredListings = listings;
    if (elementFilters.size > 0) {
      filteredListings = filteredListings.filter((listing) => {
        const card = findCard(sorceryCards, listing.cardId);
        return card?.elements?.some((e) => elementFilters.has(e.name));
      });
    }
    if (this.state.foilOnly) {
      filteredListings = filteredListings.filter((listing) => {
        if (listing.foiling === 'F' || listing.foiling === 'R') return true;
        // Fallback: check if the card name contains foil indicator from the listing
        if (listing.foiling) return false;
        // No foiling field — check the card's printings for any foil variant
        const card = findCard(sorceryCards, listing.cardId);
        const printing = card?.printings?.find((p) => p.unique_id === listing.printingId);
        return printing && isFoilFinish(printing.foiling);
      });
    }

    return (
      <div className="flex gap-0 flex-1 min-h-0">
        {/* Left column: Filters + Grid */}
        <div className="flex-[65] flex flex-col min-h-0 pr-4">
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

            <div className="flex items-center gap-1">
              {['price', 'date', 'rarity'].map((key) => (
                <button
                  key={key}
                  type="button"
                  className="px-3 py-1.5 text-[11px] font-medium transition-colors cursor-pointer capitalize"
                  style={sortBy === key ? TAB_ACTIVE : TAB_INACTIVE}
                  onClick={() => this.handleSort(key)}
                >
                  {key}{sortIndicator(sortBy, key, sortOrder)}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1" style={{ borderLeft: `1px solid ${GOLD} 0.1)`, paddingLeft: 8 }}>
              {['Water', 'Earth', 'Fire', 'Air'].map((el) => (
                <button
                  key={el}
                  type="button"
                  className="flex items-center gap-1 px-2 py-1 text-[11px] transition-colors cursor-pointer"
                  style={elementFilters.has(el)
                    ? { ...TAB_ACTIVE, borderRadius: '4px' }
                    : { ...TAB_INACTIVE, borderRadius: '4px' }
                  }
                  onClick={() => this.toggleElementFilter(el)}
                >
                  <SorceryElementIcon element={el} className="size-3" />
                  <span className="hidden md:inline">{el}</span>
                </button>
              ))}
              <button
                type="button"
                className="flex items-center gap-1 px-2 py-1 text-[11px] transition-colors cursor-pointer"
                style={this.state.foilOnly
                  ? { ...TAB_ACTIVE, borderRadius: '4px', aspectRatio: '1' }
                  : { ...TAB_INACTIVE, borderRadius: '4px', aspectRatio: '1' }
                }
                title="Show foil cards only"
                onClick={() => this.setState((s) => ({ foilOnly: !s.foilOnly }))}
              >
                <Sparkles size={13} style={{ color: this.state.foilOnly ? ACCENT_GOLD : TEXT_MUTED }} />
              </button>
            </div>
          </div>

          {/* Listing grid */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {listingsLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <RuneSpinner size={56} />
                <span className="text-xs" style={{ color: TEXT_MUTED }}>Loading listings...</span>
              </div>
            ) : filteredListings.length === 0 ? (
              <div className="text-center py-16 text-sm" style={{ color: TEXT_MUTED }}>No listings found</div>
            ) : (
              <div className="card-grid px-4">
                {filteredListings.map((listing) => {
                  const card = findCard(sorceryCards, listing.cardId);
                  const printing = card?.printings?.[0];
                  const foiling = listing.foiling || printing?.foiling || 'S';
                  const foil = isFoilFinish(foiling);
                  const isSelected = previewListing?.id === listing.id;
                  return (
                    <div
                      key={listing.id}
                      className="cursor-pointer"
                      onClick={() => this.setState({ previewListing: listing })}
                    >
                      {card && printing ? (
                        <DeckCardTile
                          entry={{ card, printing: { ...printing, foiling }, zone: 'spellbook', entryIndex: 0 }}
                          isSelected={isSelected}
                          onClick={() => this.setState({ previewListing: listing })}
                        />
                      ) : (
                        <div
                          className="w-full rounded-[14px] aspect-[63/88] flex items-center justify-center text-[10px]"
                          style={{ background: `${GOLD} 0.04)`, color: TEXT_MUTED, border: `1px solid ${GOLD} 0.12)` }}
                        >
                          {listing.cardId}
                        </div>
                      )}
                      <div className="text-xs font-semibold truncate mt-1 text-center" style={{ color: TEXT_PRIMARY }}>
                        {card?.name || listing.cardId}
                        {foil && <span className="ml-1 text-[9px]" style={{ color: foiling === 'R' ? '#c480e0' : '#6ec8d4' }}>{FOIL_LABEL[foiling]}</span>}
                      </div>
                      <div className="flex items-center justify-center gap-1 mt-0.5">
                        <span className="text-xs font-bold" style={{ color: COIN_COLOR }}>{listing.price}</span>
                        <span className="text-[9px]" style={{ color: TEXT_MUTED }}>gold</span>
                      </div>
                      {listing.createdAt && (
                        <div className="text-center mt-0.5">
                          <span className="text-[9px] tabular-nums" style={{ color: TEXT_MUTED }}>
                            {formatTimeRemaining(listing.createdAt, this.state.now)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination */}
          {listingsTotal > 50 && (
            <div className="flex items-center justify-center gap-4 pt-3 mt-2" style={{ borderTop: `1px solid ${GOLD} 0.08)` }}>
              <button
                type="button"
                disabled={page === 0}
                className="px-3 py-1 text-xs cursor-pointer disabled:opacity-30 transition-all"
                style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
                onClick={() => this.setState({ page: page - 1 }, this.loadListings)}
              >
                &laquo; Prev
              </button>
              <span className="text-xs" style={{ color: TEXT_MUTED }}>
                {page * 50 + 1}&ndash;{Math.min((page + 1) * 50, listingsTotal)} of {listingsTotal}
              </span>
              <button
                type="button"
                disabled={(page + 1) * 50 >= listingsTotal}
                className="px-3 py-1 text-xs cursor-pointer disabled:opacity-30 transition-all"
                style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
                onClick={() => this.setState({ page: page + 1 }, this.loadListings)}
              >
                Next &raquo;
              </button>
            </div>
          )}
        </div>

        {/* Right column: Card Preview — no scroll, image shrinks to fit */}
        <div className="flex-[35] min-h-0 overflow-hidden" style={SIDEBAR_PANEL}>
          <div className="relative p-4 h-full flex flex-col" style={{ background: PANEL_BG, border: `1px solid ${GOLD} 0.2)`, borderRadius: '8px' }}>
            <FourCorners />
            {previewListing && previewCard ? (
              <div className="flex flex-col items-center gap-2 h-full min-h-0">
                <img
                  src={cardImageUrl(previewCard, previewListing.printingId)}
                  alt={previewCard.name}
                  className="rounded-lg object-cover bg-black/40 shrink min-h-0"
                  style={{ aspectRatio: '63 / 88', maxWidth: '50%' }}
                />

                <div className="w-full text-center shrink-0">
                  <div className="text-sm font-bold arena-heading" style={{ color: TEXT_PRIMARY, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                    {previewCard.name}
                  </div>
                  {(() => {
                    const f = previewListing.foiling || previewCard.printings?.[0]?.foiling || 'S';
                    return isFoilFinish(f) ? (
                      <span className="text-[11px] font-semibold" style={{ color: f === 'R' ? '#c480e0' : '#6ec8d4' }}>
                        {FOIL_LABEL[f]}
                      </span>
                    ) : null;
                  })()}
                </div>

                <div className="w-full flex flex-col gap-1 text-xs shrink-0">
                  <div className="flex justify-between">
                    <span style={{ color: TEXT_MUTED }}>Type</span>
                    <span style={{ color: TEXT_BODY }}>{previewCard.type_text || previewCard.type || 'Unknown'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: TEXT_MUTED }}>Rarity</span>
                    <span style={{ color: RARITY_COLORS[previewCard.rarity] || TEXT_BODY }}>
                      {previewCard.rarity || 'Unknown'}
                    </span>
                  </div>
                  {previewCard.elements?.length > 0 && (
                    <div className="flex justify-between items-center">
                      <span style={{ color: TEXT_MUTED }}>Elements</span>
                      <div className="flex items-center gap-1.5">
                        {previewCard.elements.map((el) => (
                          <span key={el.name} className="flex items-center gap-0.5">
                            <SorceryElementIcon element={el.name} className="size-3.5" />
                            <span style={{ color: TEXT_BODY }}>{el.name}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {previewCard.cost != null && (
                    <div className="flex justify-between">
                      <span style={{ color: TEXT_MUTED }}>Cost</span>
                      <span style={{ color: ACCENT_GOLD }}>{previewCard.cost}</span>
                    </div>
                  )}
                </div>

                <OrnamentalDivider className="w-full shrink-0 mt-auto" />

                <div className="w-full flex flex-col gap-1 text-xs shrink-0">
                  <div className="flex justify-between">
                    <span style={{ color: TEXT_MUTED }}>Seller</span>
                    <span style={{ color: TEXT_BODY }}>{previewListing.sellerName}</span>
                  </div>
                  {previewListing.createdAt && (
                    <div className="flex justify-between">
                      <span style={{ color: TEXT_MUTED }}>Expires</span>
                      <span className="tabular-nums" style={{ color: TEXT_BODY }}>
                        {formatTimeRemaining(previewListing.createdAt, this.state.now)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <span style={{ color: TEXT_MUTED }}>Price</span>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block w-3 h-3 rounded-full"
                        style={{ background: `radial-gradient(circle at 35% 35%, #ffe680, ${COIN_COLOR}, #b8860b)`, boxShadow: `0 0 4px ${GOLD} 0.4)` }}
                      />
                      <span className="text-lg font-bold" style={{ color: COIN_COLOR, textShadow: `0 0 10px ${GOLD} 0.3)` }}>
                        {previewListing.price}
                      </span>
                      <span style={{ color: TEXT_MUTED }}>gold</span>
                    </span>
                  </div>
                </div>

                <div className="w-full mt-2 shrink-0">
                  {!canAfford ? (
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        disabled
                        className="w-full py-2.5 text-sm font-semibold cursor-not-allowed opacity-40"
                        style={GOLD_BTN}
                      >
                        Buy Now
                      </button>
                      <div className="text-center text-[11px]" style={{ color: '#c45050' }}>Not enough gold</div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={buyingId === previewListing.id}
                      className="w-full py-2.5 text-sm font-semibold cursor-pointer transition-all disabled:opacity-50"
                      style={GOLD_BTN}
                      onClick={() => this.handleBuy(previewListing)}
                    >
                      {buyingId === previewListing.id ? <><RuneSpinner size={16} dark className="inline-block" /><span className="invisible">Buy Now</span></> : 'Buy Now'}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="w-16 h-16 rounded-lg flex items-center justify-center" style={{ background: `${GOLD} 0.04)`, border: `1px dashed ${GOLD} 0.15)` }}>
                  <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke={`${GOLD} 0.2)`} strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <path d="M9 9h6M9 12h6M9 15h4" />
                  </svg>
                </div>
                <div className="text-sm" style={{ color: TEXT_MUTED }}>Select a listing to preview</div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  renderSell() {
    const { profile, sorceryCards } = this.props;
    const {
      selectedCardId, sellPrice, sellQuantity, sellLoading, sellError,
      myListings, myListingsLoading, cancellingId, sellSearch,
    } = this.state;

    const ownedMap = buildOwnedMap(profile.collection || []);
    const usedMap = buildUsedMap(profile.decks || []);
    const { sortBy, sortOrder, elementFilters } = this.state;

    let availableCards = (sorceryCards || []).filter(
      (card) => getAvailableQuantity(card.unique_id, ownedMap, usedMap) > 0,
    );

    if (sellSearch) {
      const q = sellSearch.toLowerCase();
      availableCards = availableCards.filter((c) => c.name.toLowerCase().includes(q));
    }

    if (elementFilters.size > 0) {
      availableCards = availableCards.filter((card) =>
        card.elements?.some((e) => elementFilters.has(e.name)),
      );
    }

    const RARITY_ORDER = { Ordinary: 0, Exceptional: 1, Elite: 2, Unique: 3, Avatar: 4 };
    if (sortBy === 'rarity') {
      availableCards = [...availableCards].sort((a, b) => {
        const diff = (RARITY_ORDER[b.rarity] || 0) - (RARITY_ORDER[a.rarity] || 0);
        return sortOrder === 'asc' ? -diff : diff;
      });
    } else if (sortBy === 'price') {
      availableCards = [...availableCards].sort((a, b) => {
        const diff = (a.name || '').localeCompare(b.name || '');
        return sortOrder === 'asc' ? diff : -diff;
      });
    }

    // Expand cards into per-foiling entries (standard vs foil vs rainbow)
    const collection = profile.collection || [];
    const printingOwned = new Map();
    for (const entry of collection) {
      if (entry.printingId) {
        printingOwned.set(entry.printingId, (printingOwned.get(entry.printingId) || 0) + entry.quantity);
      }
    }

    const sellEntries = [];
    for (const card of availableCards) {
      const printings = card.printings || [];
      const foilGroups = new Map();
      for (const p of printings) {
        const f = p.foiling || 'S';
        const qty = printingOwned.get(p.unique_id) || 0;
        if (!foilGroups.has(f)) {
          foilGroups.set(f, { printing: p, ownedQty: qty });
        } else {
          const existing = foilGroups.get(f);
          existing.ownedQty += qty;
        }
      }
      // Standard version
      let addedForCard = 0;
      const stdGroup = foilGroups.get('S');
      if (stdGroup && stdGroup.ownedQty > 0) {
        sellEntries.push({ card, printing: stdGroup.printing, foiling: 'S', qty: stdGroup.ownedQty });
        addedForCard++;
      }
      // Foil/rainbow variants
      for (const [f, group] of foilGroups) {
        if (f === 'S') continue;
        if (group.ownedQty > 0) {
          sellEntries.push({ card, printing: group.printing, foiling: f, qty: group.ownedQty });
          addedForCard++;
        }
      }
      // Fallback: if no printing-level tracking, show card-level qty
      if (addedForCard === 0 && getAvailableQuantity(card.unique_id, ownedMap, usedMap) > 0) {
        const p = printings[0] || {};
        sellEntries.push({ card, printing: p, foiling: p.foiling || 'S', qty: getAvailableQuantity(card.unique_id, ownedMap, usedMap) });
      }
    }

    const filteredSellEntries = this.state.foilOnly
      ? sellEntries.filter((e) => e.foiling === 'F' || e.foiling === 'R')
      : sellEntries;

    const selectedCard = selectedCardId ? findCard(sorceryCards, selectedCardId) : null;
    const selectedQty = selectedCardId ? getAvailableQuantity(selectedCardId, ownedMap, usedMap) : 0;

    const active = myListings.filter((l) => l.status === 'active');
    const sold = myListings.filter((l) => l.status === 'sold');

    return (
      <div className="flex gap-0 flex-1 min-h-0">
        {/* Left column: Your Collection + Sell Panel */}
        <div className="flex-[65] flex flex-col min-h-0 pr-4">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2 pb-3 mb-3" style={{ borderBottom: `1px solid ${GOLD} 0.08)` }}>
            <input
              type="text"
              placeholder="Search your cards..."
              value={sellSearch}
              onInput={(e) => this.setState({ sellSearch: e.target.value })}
              className="flex-1 min-w-[180px] px-3 py-2 text-sm outline-none"
              style={{ ...INPUT_STYLE, borderRadius: '6px', color: TEXT_PRIMARY }}
            />

            <div className="flex items-center gap-1">
              {['rarity', 'name'].map((key) => (
                <button
                  key={key}
                  type="button"
                  className="px-3 py-1.5 text-[11px] font-medium transition-colors cursor-pointer capitalize"
                  style={sortBy === key ? TAB_ACTIVE : TAB_INACTIVE}
                  onClick={() => this.handleSort(key)}
                >
                  {key}{sortIndicator(sortBy, key, sortOrder)}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1" style={{ borderLeft: `1px solid ${GOLD} 0.1)`, paddingLeft: 8 }}>
              {['Water', 'Earth', 'Fire', 'Air'].map((el) => (
                <button
                  key={el}
                  type="button"
                  className="flex items-center gap-1 px-2 py-1 text-[11px] transition-colors cursor-pointer"
                  style={elementFilters.has(el)
                    ? { ...TAB_ACTIVE, borderRadius: '4px' }
                    : { ...TAB_INACTIVE, borderRadius: '4px' }
                  }
                  onClick={() => this.toggleElementFilter(el)}
                >
                  <SorceryElementIcon element={el} className="size-3" />
                  <span className="hidden md:inline">{el}</span>
                </button>
              ))}
              <button
                type="button"
                className="flex items-center gap-1 px-2 py-1 text-[11px] transition-colors cursor-pointer"
                style={this.state.foilOnly
                  ? { ...TAB_ACTIVE, borderRadius: '4px', aspectRatio: '1' }
                  : { ...TAB_INACTIVE, borderRadius: '4px', aspectRatio: '1' }
                }
                title="Show foil cards only"
                onClick={() => this.setState((s) => ({ foilOnly: !s.foilOnly }))}
              >
                <Sparkles size={13} style={{ color: this.state.foilOnly ? ACCENT_GOLD : TEXT_MUTED }} />
              </button>
            </div>
          </div>

          {/* Card grid */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {filteredSellEntries.length === 0 ? (
              <div className="text-center py-16 text-sm" style={{ color: TEXT_MUTED }}>No available cards to sell</div>
            ) : (
              <div className="card-grid px-4">
                {filteredSellEntries.map((entry, idx) => {
                  const { card, printing, foiling, qty } = entry;
                  const key = `${card.unique_id}-${foiling}`;
                  const isSelected = selectedCardId === card.unique_id;
                  const foil = isFoilFinish(foiling);
                  return (
                    <div key={key}>
                      <DeckCardTile
                        entry={{ card, printing: { ...printing, foiling }, zone: 'spellbook', entryIndex: idx }}
                        isSelected={isSelected}
                        onClick={() => this.setState({ selectedCardId: card.unique_id, selectedFoiling: foiling, sellPrice: '', sellQuantity: 1, sellError: null })}
                      />
                      <div className="flex items-center justify-center gap-1 mt-1">
                        {qty > 1 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: PANEL_BG, color: ACCENT_GOLD, border: `1px solid ${GOLD} 0.3)` }}>
                            ×{qty}
                          </span>
                        )}
                        {foil && <span className="text-[9px] font-semibold" style={{ color: foiling === 'R' ? '#c480e0' : '#6ec8d4' }}>{FOIL_LABEL[foiling]}</span>}
                      </div>
                      <div className="text-[10px] truncate mt-0.5 text-center px-0.5" style={{ color: TEXT_MUTED }}>{card.name}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sell panel at bottom */}
          {selectedCard && (
            <>
              <OrnamentalDivider className="my-3" />
              <div
                className="relative flex items-start gap-4 p-4 shrink-0"
                style={{ background: 'rgba(12, 10, 8, 0.92)', border: `1px solid ${GOLD} 0.18)`, borderRadius: '8px' }}
              >
                <FourCorners />
                <img
                  src={cardImageUrl(selectedCard)}
                  alt={selectedCard.name}
                  className="w-20 rounded-lg aspect-[63/88] object-cover bg-black/40 shrink-0"
                />
                <div className="flex-1 flex flex-col gap-2 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold truncate" style={{ color: TEXT_PRIMARY }}>{selectedCard.name}</span>
                    {isFoilFinish(this.state.selectedFoiling) && (
                      <span className="flex items-center gap-1 shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{
                          color: this.state.selectedFoiling === 'R' ? '#c480e0' : ACCENT_GOLD,
                          background: this.state.selectedFoiling === 'R' ? 'rgba(196,128,224,0.1)' : `${GOLD} 0.1)`,
                          border: `1px solid ${this.state.selectedFoiling === 'R' ? 'rgba(196,128,224,0.25)' : `${GOLD} 0.25)`}`,
                        }}
                      >
                        <Sparkles size={11} />
                        {FOIL_LABEL[this.state.selectedFoiling]}
                      </span>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: TEXT_MUTED }}>
                    Available: <span style={{ color: ACCENT_GOLD }}>{selectedQty}</span>
                  </div>
                  <div className="flex items-end gap-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Qty</span>
                      <input
                        type="number"
                        min="1"
                        max={selectedQty}
                        value={sellQuantity}
                        onInput={(e) => this.setState({ sellQuantity: e.target.value })}
                        onBlur={(e) => {
                          const v = Math.max(1, Math.min(parseInt(e.target.value, 10) || 1, selectedQty));
                          this.setState({ sellQuantity: v });
                        }}
                        className="w-14 px-2 py-1.5 text-sm outline-none text-center"
                        style={{ ...INPUT_STYLE, borderRadius: '6px', color: TEXT_PRIMARY }}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[9px] uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Price each</span>
                      <input
                        type="number"
                        min="1"
                        placeholder="Gold"
                        value={sellPrice}
                        onInput={(e) => this.setState({ sellPrice: e.target.value })}
                        className="w-24 px-3 py-1.5 text-sm outline-none"
                        style={{ ...INPUT_STYLE, borderRadius: '6px', color: TEXT_PRIMARY }}
                      />
                    </div>
                    <button
                      type="button"
                      disabled={sellLoading || !sellPrice || parseInt(sellPrice, 10) <= 0}
                      className="px-5 py-1.5 text-xs font-semibold cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={GOLD_BTN}
                      onClick={this.handleCreateListing}
                    >
                      {sellLoading ? <><RuneSpinner size={14} dark className="inline-block" /><span className="invisible">List for Sale</span></> : sellQuantity > 1 ? `List ${sellQuantity} for Sale` : 'List for Sale'}
                    </button>
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs cursor-pointer transition-all"
                      style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
                      data-sound={UI.CANCEL}
                      onClick={() => this.setState({ selectedCardId: null, selectedFoiling: 'S', sellPrice: '', sellError: null })}
                    >
                      Cancel
                    </button>
                  </div>
                  {sellError && <div className="text-xs" style={{ color: '#c45050' }}>{sellError}</div>}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right column: Active Listings + Sold */}
        <div className="flex-[35] min-h-0 overflow-y-auto" style={SIDEBAR_PANEL}>
          <div className="relative p-4 h-full" style={{ background: PANEL_BG, border: `1px solid ${GOLD} 0.2)`, borderRadius: '8px' }}>
            <FourCorners />

            {myListingsLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <RuneSpinner size={48} />
                <span className="text-xs" style={{ color: TEXT_MUTED }}>Loading your listings...</span>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {/* Active listings */}
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={SECTION_HEADER_STYLE}>
                    Active ({active.length})
                  </div>
                  <OrnamentalDivider className="mb-3" />
                  {active.length === 0 ? (
                    <div className="text-xs py-4" style={{ color: TEXT_MUTED }}>No active listings</div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {active.map((listing) => {
                        const card = findCard(sorceryCards, listing.cardId);
                        return (
                          <div
                            key={listing.id}
                            className="flex items-center gap-3 px-3 py-2"
                            style={{
                              background: `${GOLD} 0.03)`,
                              border: `1px solid ${GOLD} 0.1)`,
                              borderRadius: '6px',
                            }}
                          >
                            {card && (
                              <img
                                src={cardImageUrl(card)}
                                alt={card.name}
                                className="w-8 rounded aspect-[63/88] object-cover bg-black/40 shrink-0"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold truncate flex items-center gap-1.5" style={{ color: TEXT_PRIMARY }}>
                                {card?.name || listing.cardId}
                                {isFoilFinish(listing.foiling) && (
                                  <Sparkles size={11} className="shrink-0" style={{ color: listing.foiling === 'R' ? '#c480e0' : ACCENT_GOLD }} />
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col items-end shrink-0 gap-0.5">
                              <span className="text-xs font-bold" style={{ color: COIN_COLOR }}>
                                {listing.price}g
                              </span>
                              {listing.createdAt && (
                                <span className="text-[9px] tabular-nums" style={{ color: TEXT_MUTED }}>
                                  {formatTimeRemaining(listing.createdAt, this.state.now)}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              disabled={cancellingId === listing.id}
                              className="px-2 py-1 text-[10px] font-medium cursor-pointer disabled:opacity-40 transition-colors shrink-0"
                              style={DANGER_BTN}
                              data-sound={UI.CANCEL}
                              onClick={() => this.handleCancel(listing)}
                            >
                              {cancellingId === listing.id ? <><RuneSpinner size={12} className="inline-block" /><span className="invisible">Cancel</span></> : 'Cancel'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Sold listings */}
                {sold.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={SECTION_HEADER_STYLE}>
                      Sold ({sold.length})
                    </div>
                    <OrnamentalDivider className="mb-3" />
                    <div className="flex flex-col gap-1.5">
                      {sold.slice(0, 5).map((listing) => {
                        const card = findCard(sorceryCards, listing.cardId);
                        return (
                          <div
                            key={listing.id}
                            className="flex items-center gap-3 px-3 py-2"
                            style={{ background: `${GOLD} 0.02)`, borderRadius: '6px' }}
                          >
                            {card && (
                              <img
                                src={cardImageUrl(card)}
                                alt={card.name}
                                className="w-7 rounded aspect-[63/88] object-cover bg-black/40 shrink-0"
                              />
                            )}
                            <span className="text-xs flex-1 truncate flex items-center gap-1" style={{ color: TEXT_MUTED }}>
                              {card?.name || listing.cardId}
                              {isFoilFinish(listing.foiling) && (
                                <Sparkles size={10} className="shrink-0" style={{ color: listing.foiling === 'R' ? '#c480e0' : ACCENT_GOLD }} />
                              )}
                            </span>
                            <span className="text-xs font-semibold shrink-0" style={{ color: '#6ab04c' }}>
                              +{listing.price}g
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  render() {
    const { profile, onBack, onToggleMailbox, mailboxUnreadCount, mailboxDropdown, onToggleFriends, friendListData } = this.props;
    const { tab, error, viewScale } = this.state;

    return (
      <div className="fixed inset-0 z-50 flex flex-col overflow-hidden" style={{ background: '#08080a', color: TEXT_BODY }}>
        {/* Background image with blur */}
        <div className="absolute inset-0" style={{ background: "url('/auction-bg.webp') center/cover no-repeat", filter: 'blur(1.5px)', transform: 'scale(1.008)' }} />
        {/* Darken overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.45) 70%, rgba(0,0,0,0.75) 100%)' }} />
        {/* Vignette */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: VIGNETTE }} />

        {/* Torch firelight glow + particles — behind all UI */}
        <StoreTorchFX />
        <AmbientParticles preset="auction" />

        {/* All UI content sits above effects */}
        <div className="relative z-10 flex flex-col flex-1 min-h-0">

        {/* Top bar */}
        <AppHeader
          profile={profile}
          onToggleMailbox={onToggleMailbox}
          mailboxUnreadCount={mailboxUnreadCount}
          mailboxDropdown={mailboxDropdown}
          onToggleFriends={onToggleFriends}
          friendListData={friendListData}
          zoom={viewScale}
        >
          <button
            type="button"
            className="px-3 py-1.5 text-xs font-medium cursor-pointer transition-all"
            style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
            data-sound={UI.CANCEL}
            onClick={onBack}
          >
            Back to Hub
          </button>
          <div className="text-sm font-bold arena-heading" style={{ color: TEXT_PRIMARY, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
            Auction House
          </div>
          <div className="flex items-center gap-2 ml-4">
            {[
              { key: 'browse', label: 'Browse' },
              { key: 'sell', label: 'Sell & My Listings' },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                className="px-4 py-1.5 text-xs font-medium transition-colors cursor-pointer"
                style={tab === t.key ? TAB_ACTIVE : TAB_INACTIVE}
                onClick={() => this.switchTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </AppHeader>

        {/* Error banner */}
        {error && (
          <div
            className="relative mx-6 mt-3 px-4 py-2 text-xs shrink-0"
            style={{
              background: 'rgba(180,60,60,0.08)',
              border: '1px solid rgba(180,60,60,0.25)',
              borderRadius: '6px',
              color: '#c45050',
              zoom: viewScale,
            }}
          >
            {error}
            <button
              type="button"
              className="ml-2 underline hover:no-underline cursor-pointer"
              onClick={() => this.setState({ error: null })}
            >
              dismiss
            </button>
          </div>
        )}

        {/* Content area */}
        <div className="relative flex-1 flex flex-col min-h-0 px-6 py-4" style={{ zoom: viewScale }}>
          {tab === 'browse' && this.renderBrowse()}
          {tab === 'sell' && this.renderSell()}
        </div>

        {/* Purchase toast */}
        {this.state.purchaseMessage && (
          <div
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[80] px-5 py-3 rounded-lg text-sm font-medium pointer-events-none"
            style={{
              background: 'rgba(12,10,8,0.95)',
              border: `1px solid ${GOLD} 0.3)`,
              color: ACCENT_GOLD,
              boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 20px ${GOLD} 0.1)`,
            }}
          >
            {this.state.purchaseMessage}
          </div>
        )}
        </div>{/* end UI content wrapper */}
      </div>
    );
  }
}
