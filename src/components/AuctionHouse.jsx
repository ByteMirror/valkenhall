import { Component } from 'preact';
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
  BG_ATMOSPHERE, VIGNETTE, GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED,
  PANEL_BG, PANEL_BORDER, BEVELED_BTN, GOLD_BTN, DANGER_BTN, INPUT_STYLE,
  TAB_ACTIVE, TAB_INACTIVE, COIN_COLOR, ACCENT_GOLD,
  DIALOG_STYLE, FourCorners, OrnamentalDivider, SECTION_HEADER_STYLE,
  getViewportScale,
} from '../lib/medievalTheme';

function cardImageUrl(card) {
  return card?.printings?.[0]?.image_url || '';
}

function findCard(sorceryCards, cardId) {
  return sorceryCards.find((c) => c.unique_id === cardId);
}

function addCardToCollection(collection, cardId) {
  const updated = [...collection];
  const existing = updated.find((c) => c.cardId === cardId);
  if (existing) {
    existing.quantity += 1;
  } else {
    updated.push({ cardId, quantity: 1 });
  }
  return updated;
}

function sortIndicator(activeKey, currentKey, order) {
  if (activeKey !== currentKey) return '';
  return order === 'asc' ? ' \u2191' : ' \u2193';
}

const CARD_STYLE = {
  background: PANEL_BG,
  border: `1px solid ${GOLD} 0.15)`,
  borderRadius: '8px',
};

const CARD_STYLE_HOVER = `${GOLD} 0.35)`;

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
      sellPrice: '',
      sellLoading: false,
      sellError: null,
      myListings: [],
      myListingsLoading: false,
      error: null,
      syncing: false,
      buyingId: null,
      cancellingId: null,
      viewScale: getViewportScale(),
    };
  }

  componentDidMount() {
    window.addEventListener('resize', this.handleResize);
    this.doSync();
    this.loadListings();
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.handleResize);
  }

  handleResize = () => {
    this.setState({ viewScale: getViewportScale() });
  };

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
      this.setState({ error: 'Not enough coins' });
      return;
    }
    this.setState({ buyingId: listing.id, error: null });
    try {
      const result = await buyListing(profile.serverToken, listing.id);
      const collection = addCardToCollection(profile.collection, listing.cardId);
      this.props.onUpdateProfile({ ...profile, coins: result.newBalance, collection });
      this.setState((s) => ({
        listings: s.listings.filter((l) => l.id !== listing.id),
        listingsTotal: s.listingsTotal - 1,
      }));
    } catch (err) {
      this.setState({ error: err.message });
    } finally {
      this.setState({ buyingId: null });
    }
  };

  handleCreateListing = async () => {
    const { profile, sorceryCards } = this.props;
    const { selectedCardId, sellPrice } = this.state;
    const price = parseInt(sellPrice, 10);
    if (!selectedCardId || !price || price <= 0) return;

    const card = findCard(sorceryCards, selectedCardId);
    if (!card) return;

    this.setState({ sellLoading: true, sellError: null });
    try {
      await createListing(profile.serverToken, selectedCardId, card.name, price);
      const collection = profile.collection
        .map((c) => (c.cardId === selectedCardId ? { ...c, quantity: c.quantity - 1 } : c))
        .filter((c) => c.quantity > 0);
      this.props.onUpdateProfile({ ...profile, collection });
      this.setState({ selectedCardId: null, sellPrice: '' });
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
      const collection = addCardToCollection(profile.collection, listing.cardId);
      this.props.onUpdateProfile({ ...profile, collection });
      this.setState((s) => ({
        myListings: s.myListings.map((l) =>
          l.id === listing.id ? { ...l, status: 'cancelled' } : l,
        ),
      }));
    } catch (err) {
      this.setState({ error: err.message });
    } finally {
      this.setState({ cancellingId: null });
    }
  };

  switchTab = (tab) => {
    this.setState({ tab, error: null });
    if (tab === 'browse') this.loadListings();
    if (tab === 'my-listings') this.loadMyListings();
  };

  renderBrowse() {
    const { sorceryCards, profile } = this.props;
    const { listings, listingsTotal, listingsLoading, searchQuery, sortBy, sortOrder, page, buyingId } = this.state;

    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search cards..."
            value={searchQuery}
            onInput={this.handleSearch}
            className="flex-1 px-3 py-2 text-sm outline-none"
            style={{ ...INPUT_STYLE, borderRadius: '6px', color: TEXT_PRIMARY }}
          />
          <button
            type="button"
            className="px-3 py-2 text-xs font-medium transition-colors cursor-pointer"
            style={sortBy === 'price' ? TAB_ACTIVE : TAB_INACTIVE}
            onClick={() => this.handleSort('price')}
          >
            Price{sortIndicator(sortBy, 'price', sortOrder)}
          </button>
          <button
            type="button"
            className="px-3 py-2 text-xs font-medium transition-colors cursor-pointer"
            style={sortBy === 'date' ? TAB_ACTIVE : TAB_INACTIVE}
            onClick={() => this.handleSort('date')}
          >
            Date{sortIndicator(sortBy, 'date', sortOrder)}
          </button>
        </div>

        {listingsLoading ? (
          <div className="text-center py-12 text-sm" style={{ color: TEXT_MUTED }}>Loading listings...</div>
        ) : listings.length === 0 ? (
          <div className="text-center py-12 text-sm" style={{ color: TEXT_MUTED }}>No listings found</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {listings.map((listing) => {
              const card = findCard(sorceryCards, listing.cardId);
              const isOwn = profile.name === listing.sellerName;
              return (
                <div
                  key={listing.id}
                  className="relative p-3 flex flex-col gap-2"
                  style={CARD_STYLE}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = CARD_STYLE_HOVER; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.15)`; }}
                >
                  <FourCorners />
                  {card ? (
                    <img src={cardImageUrl(card)} alt={card.name} className="w-full rounded-lg aspect-[5/7] object-cover bg-black/40" loading="lazy" />
                  ) : (
                    <div className="w-full rounded-lg aspect-[5/7] flex items-center justify-center text-xs" style={{ background: `${GOLD} 0.04)`, color: TEXT_MUTED }}>{listing.cardId}</div>
                  )}
                  <div className="text-xs font-semibold truncate" style={{ color: TEXT_PRIMARY }}>{card?.name || listing.cardId}</div>
                  <div className="text-[10px] truncate" style={{ color: TEXT_MUTED }}>by {listing.sellerName}</div>
                  <div className="flex items-center justify-between mt-auto">
                    <span className="text-sm font-bold" style={{ color: COIN_COLOR }}>{listing.price} <span className="text-[10px]" style={{ color: `${GOLD} 0.5)` }}>coins</span></span>
                    {isOwn ? (
                      <span className="text-[10px]" style={{ color: TEXT_MUTED }}>Your listing</span>
                    ) : (
                      <button
                        type="button"
                        disabled={buyingId === listing.id || listing.price > profile.coins}
                        className="px-2.5 py-1 text-[10px] font-semibold cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        style={GOLD_BTN}
                        onClick={() => this.handleBuy(listing)}
                      >
                        {buyingId === listing.id ? 'Buying...' : 'Buy'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {listingsTotal > 50 && (
          <div className="flex items-center justify-center gap-4 pt-2">
            <button
              type="button"
              disabled={page === 0}
              className="px-3 py-1 text-xs cursor-pointer disabled:opacity-30 transition-all"
              style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
              onClick={() => this.setState({ page: page - 1 }, this.loadListings)}
            >
              Previous
            </button>
            <span className="text-xs" style={{ color: TEXT_MUTED }}>
              {page * 50 + 1}-{Math.min((page + 1) * 50, listingsTotal)} of {listingsTotal}
            </span>
            <button
              type="button"
              disabled={(page + 1) * 50 >= listingsTotal}
              className="px-3 py-1 text-xs cursor-pointer disabled:opacity-30 transition-all"
              style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
              onClick={() => this.setState({ page: page + 1 }, this.loadListings)}
            >
              Next
            </button>
          </div>
        )}
      </div>
    );
  }

  renderSell() {
    const { profile, sorceryCards } = this.props;
    const { selectedCardId, sellPrice, sellLoading, sellError } = this.state;

    const ownedMap = buildOwnedMap(profile.collection);
    const usedMap = buildUsedMap(profile.decks);
    const availableCards = sorceryCards.filter(
      (card) => getAvailableQuantity(card.unique_id, ownedMap, usedMap) > 0,
    );

    const selectedCard = selectedCardId ? findCard(sorceryCards, selectedCardId) : null;
    const selectedQty = selectedCardId ? getAvailableQuantity(selectedCardId, ownedMap, usedMap) : 0;

    return (
      <div className="flex flex-col gap-4">
        {selectedCard ? (
          <div className="relative flex items-start gap-4 p-4" style={{ background: `${GOLD} 0.06)`, border: `1px solid ${GOLD} 0.2)`, borderRadius: '8px' }}>
            <FourCorners />
            <img src={cardImageUrl(selectedCard)} alt={selectedCard.name} className="w-20 rounded-lg aspect-[5/7] object-cover bg-black/40" />
            <div className="flex-1 flex flex-col gap-2">
              <div className="text-sm font-bold" style={{ color: TEXT_PRIMARY }}>{selectedCard.name}</div>
              <div className="text-xs" style={{ color: TEXT_MUTED }}>Available: {selectedQty}</div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  placeholder="Price in coins"
                  value={sellPrice}
                  onInput={(e) => this.setState({ sellPrice: e.target.value })}
                  className="w-32 px-3 py-1.5 text-sm outline-none"
                  style={{ ...INPUT_STYLE, borderRadius: '6px', color: TEXT_PRIMARY }}
                />
                <button
                  type="button"
                  disabled={sellLoading || !sellPrice || parseInt(sellPrice, 10) <= 0}
                  className="px-4 py-1.5 text-xs font-semibold cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={GOLD_BTN}
                  onClick={this.handleCreateListing}
                >
                  {sellLoading ? 'Listing...' : 'List for Sale'}
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 text-xs cursor-pointer transition-all"
                  style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
                  onClick={() => this.setState({ selectedCardId: null, sellPrice: '', sellError: null })}
                >
                  Cancel
                </button>
              </div>
              {sellError && <div className="text-xs" style={{ color: '#c45050' }}>{sellError}</div>}
            </div>
          </div>
        ) : (
          <div className="text-xs" style={{ color: TEXT_MUTED }}>Select a card from your collection to list for sale.</div>
        )}

        {availableCards.length === 0 ? (
          <div className="text-center py-12 text-sm" style={{ color: TEXT_MUTED }}>No available cards to sell</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {availableCards.map((card) => {
              const qty = getAvailableQuantity(card.unique_id, ownedMap, usedMap);
              const isSelected = selectedCardId === card.unique_id;
              return (
                <button
                  key={card.unique_id}
                  type="button"
                  className="relative p-1 transition-all text-left cursor-pointer"
                  style={isSelected
                    ? { border: `1px solid ${ACCENT_GOLD}`, background: `${GOLD} 0.1)`, borderRadius: '6px', boxShadow: `0 0 12px ${GOLD} 0.15)` }
                    : { border: `1px solid ${GOLD} 0.1)`, borderRadius: '6px' }
                  }
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.borderColor = `${GOLD} 0.3)`; }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.borderColor = `${GOLD} 0.1)`; }}
                  onClick={() => this.setState({ selectedCardId: card.unique_id, sellPrice: '', sellError: null })}
                >
                  <img src={cardImageUrl(card)} alt={card.name} className="w-full rounded aspect-[5/7] object-cover bg-black/40" loading="lazy" />
                  {qty > 1 && (
                    <span className="absolute top-0.5 right-0.5 rounded-full px-1.5 text-[10px] font-bold" style={{ background: PANEL_BG, color: ACCENT_GOLD, border: `1px solid ${GOLD} 0.3)` }}>x{qty}</span>
                  )}
                  <div className="text-[10px] truncate mt-1 px-0.5" style={{ color: TEXT_MUTED }}>{card.name}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  renderMyListings() {
    const { sorceryCards } = this.props;
    const { myListings, myListingsLoading, cancellingId } = this.state;

    if (myListingsLoading) {
      return <div className="text-center py-12 text-sm" style={{ color: TEXT_MUTED }}>Loading your listings...</div>;
    }

    const active = myListings.filter((l) => l.status === 'active');
    const sold = myListings.filter((l) => l.status === 'sold');

    return (
      <div className="flex flex-col gap-6">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={SECTION_HEADER_STYLE}>Active Listings ({active.length})</div>
          {active.length === 0 ? (
            <div className="text-xs py-4" style={{ color: TEXT_MUTED }}>No active listings</div>
          ) : (
            <div className="flex flex-col gap-2">
              {active.map((listing) => {
                const card = findCard(sorceryCards, listing.cardId);
                return (
                  <div key={listing.id} className="relative flex items-center gap-3 px-3 py-2" style={CARD_STYLE}>
                    <FourCorners />
                    {card && <img src={cardImageUrl(card)} alt={card.name} className="w-10 rounded aspect-[5/7] object-cover bg-black/40" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: TEXT_PRIMARY }}>{card?.name || listing.cardId}</div>
                    </div>
                    <span className="text-sm font-bold shrink-0" style={{ color: COIN_COLOR }}>{listing.price} coins</span>
                    <button
                      type="button"
                      disabled={cancellingId === listing.id}
                      className="px-2.5 py-1 text-[10px] font-medium cursor-pointer disabled:opacity-40 transition-colors shrink-0"
                      style={DANGER_BTN}
                      onClick={() => this.handleCancel(listing)}
                    >
                      {cancellingId === listing.id ? 'Cancelling...' : 'Cancel'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {sold.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={SECTION_HEADER_STYLE}>Sold ({sold.length})</div>
            <div className="flex flex-col gap-1">
              {sold.map((listing) => {
                const card = findCard(sorceryCards, listing.cardId);
                return (
                  <div key={listing.id} className="flex items-center gap-3 px-3 py-2" style={{ background: `${GOLD} 0.03)`, borderRadius: '6px' }}>
                    {card && <img src={cardImageUrl(card)} alt={card.name} className="w-8 rounded aspect-[5/7] object-cover bg-black/40" />}
                    <span className="text-xs flex-1 truncate" style={{ color: TEXT_MUTED }}>{card?.name || listing.cardId}</span>
                    <span className="text-xs font-semibold" style={{ color: ACCENT_GOLD }}>+{listing.price} coins</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  render() {
    const { profile, onBack } = this.props;
    const { tab, error } = this.state;

    return (
      <div className="fixed inset-0 z-50 flex flex-col overflow-hidden" style={{ background: BG_ATMOSPHERE, color: TEXT_BODY }}>
        <div className="fixed inset-0 pointer-events-none" style={{ background: VIGNETTE }} />

        {/* Header */}
        <div className="relative flex items-center gap-4 px-6 py-3" style={{ background: PANEL_BG, borderBottom: `1px solid ${GOLD} 0.15)`, zoom: this.state.viewScale }}>
          <button
            type="button"
            className="px-3 py-1.5 text-xs font-medium cursor-pointer transition-all"
            style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.5)`; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.3)`; }}
            onClick={onBack}
          >
            Back to Hub
          </button>
          <div className="text-sm font-bold arena-heading" style={{ color: TEXT_PRIMARY, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>Auction House</div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: COIN_COLOR, textShadow: `0 0 8px ${GOLD} 0.3)` }}>{profile.coins}</span>
            <span className="text-[10px]" style={{ color: `${GOLD} 0.5)` }}>coins</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="relative flex gap-2 px-6 py-2" style={{ borderBottom: `1px solid ${GOLD} 0.08)`, zoom: this.state.viewScale }}>
          {[
            { key: 'browse', label: 'Browse' },
            { key: 'sell', label: 'Sell' },
            { key: 'my-listings', label: 'My Listings' },
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

        {/* Error */}
        {error && (
          <div className="relative mx-6 mt-3 px-4 py-2 text-xs" style={{ background: 'rgba(180,60,60,0.08)', border: '1px solid rgba(180,60,60,0.25)', borderRadius: '6px', color: '#c45050' }}>
            {error}
            <button type="button" className="ml-2 underline hover:no-underline cursor-pointer" onClick={() => this.setState({ error: null })}>dismiss</button>
          </div>
        )}

        {/* Content */}
        <div className="relative flex-1 overflow-y-auto px-6 py-4" style={{ zoom: this.state.viewScale }}>
          {tab === 'browse' && this.renderBrowse()}
          {tab === 'sell' && this.renderSell()}
          {tab === 'my-listings' && this.renderMyListings()}
        </div>
      </div>
    );
  }
}
