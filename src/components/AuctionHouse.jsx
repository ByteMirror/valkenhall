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
    };
  }

  componentDidMount() {
    this.doSync();
    this.loadListings();
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
      // Sync failure is non-blocking
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
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30"
          />
          <button
            type="button"
            className={cn(
              'rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
              sortBy === 'price' ? 'border-amber-500/50 bg-amber-500/10 text-amber-400' : 'border-white/10 text-white/50 hover:text-white/80',
            )}
            onClick={() => this.handleSort('price')}
          >
            Price{sortIndicator(sortBy, 'price', sortOrder)}
          </button>
          <button
            type="button"
            className={cn(
              'rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
              sortBy === 'date' ? 'border-amber-500/50 bg-amber-500/10 text-amber-400' : 'border-white/10 text-white/50 hover:text-white/80',
            )}
            onClick={() => this.handleSort('date')}
          >
            Date{sortIndicator(sortBy, 'date', sortOrder)}
          </button>
        </div>

        {listingsLoading ? (
          <div className="text-center text-white/40 py-12 text-sm">Loading listings...</div>
        ) : listings.length === 0 ? (
          <div className="text-center text-white/40 py-12 text-sm">No listings found</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {listings.map((listing) => {
              const card = findCard(sorceryCards, listing.cardId);
              const isOwn = profile.name === listing.sellerName;
              return (
                <div key={listing.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex flex-col gap-2">
                  {card ? (
                    <img src={cardImageUrl(card)} alt={card.name} className="w-full rounded-lg aspect-[5/7] object-cover bg-black/40" loading="lazy" />
                  ) : (
                    <div className="w-full rounded-lg aspect-[5/7] bg-white/5 flex items-center justify-center text-white/20 text-xs">{listing.cardId}</div>
                  )}
                  <div className="text-xs font-semibold text-white truncate">{card?.name || listing.cardId}</div>
                  <div className="text-[10px] text-white/40 truncate">by {listing.sellerName}</div>
                  <div className="flex items-center justify-between mt-auto">
                    <span className="text-sm font-bold text-yellow-300">{listing.price} <span className="text-[10px] text-yellow-300/60">coins</span></span>
                    {isOwn ? (
                      <span className="text-[10px] text-white/30">Your listing</span>
                    ) : (
                      <button
                        type="button"
                        disabled={buyingId === listing.id || listing.price > profile.coins}
                        className="rounded-lg bg-green-600/80 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
              className="rounded-lg border border-white/10 px-3 py-1 text-xs text-white/60 hover:text-white disabled:opacity-30"
              onClick={() => this.setState({ page: page - 1 }, this.loadListings)}
            >
              Previous
            </button>
            <span className="text-xs text-white/40">
              {page * 50 + 1}-{Math.min((page + 1) * 50, listingsTotal)} of {listingsTotal}
            </span>
            <button
              type="button"
              disabled={(page + 1) * 50 >= listingsTotal}
              className="rounded-lg border border-white/10 px-3 py-1 text-xs text-white/60 hover:text-white disabled:opacity-30"
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
          <div className="flex items-start gap-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <img src={cardImageUrl(selectedCard)} alt={selectedCard.name} className="w-20 rounded-lg aspect-[5/7] object-cover bg-black/40" />
            <div className="flex-1 flex flex-col gap-2">
              <div className="text-sm font-bold text-white">{selectedCard.name}</div>
              <div className="text-xs text-white/40">Available: {selectedQty}</div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  placeholder="Price in coins"
                  value={sellPrice}
                  onInput={(e) => this.setState({ sellPrice: e.target.value })}
                  className="w-32 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30"
                />
                <button
                  type="button"
                  disabled={sellLoading || !sellPrice || parseInt(sellPrice, 10) <= 0}
                  className="rounded-lg bg-amber-600/80 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  onClick={this.handleCreateListing}
                >
                  {sellLoading ? 'Listing...' : 'List for Sale'}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/50 hover:text-white/80"
                  onClick={() => this.setState({ selectedCardId: null, sellPrice: '', sellError: null })}
                >
                  Cancel
                </button>
              </div>
              {sellError && <div className="text-xs text-red-400">{sellError}</div>}
            </div>
          </div>
        ) : (
          <div className="text-xs text-white/40">Select a card from your collection to list for sale.</div>
        )}

        {availableCards.length === 0 ? (
          <div className="text-center text-white/40 py-12 text-sm">No available cards to sell</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {availableCards.map((card) => {
              const qty = getAvailableQuantity(card.unique_id, ownedMap, usedMap);
              const isSelected = selectedCardId === card.unique_id;
              return (
                <button
                  key={card.unique_id}
                  type="button"
                  className={cn(
                    'relative rounded-lg border p-1 transition-all text-left',
                    isSelected
                      ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/50'
                      : 'border-white/10 hover:border-white/30',
                  )}
                  onClick={() => this.setState({ selectedCardId: card.unique_id, sellPrice: '', sellError: null })}
                >
                  <img src={cardImageUrl(card)} alt={card.name} className="w-full rounded aspect-[5/7] object-cover bg-black/40" loading="lazy" />
                  {qty > 1 && (
                    <span className="absolute top-0.5 right-0.5 rounded-full bg-black/70 px-1.5 text-[10px] font-bold text-white">x{qty}</span>
                  )}
                  <div className="text-[10px] text-white/60 truncate mt-1 px-0.5">{card.name}</div>
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
      return <div className="text-center text-white/40 py-12 text-sm">Loading your listings...</div>;
    }

    const active = myListings.filter((l) => l.status === 'active');
    const sold = myListings.filter((l) => l.status === 'sold');

    return (
      <div className="flex flex-col gap-6">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3">Active Listings ({active.length})</div>
          {active.length === 0 ? (
            <div className="text-xs text-white/30 py-4">No active listings</div>
          ) : (
            <div className="flex flex-col gap-2">
              {active.map((listing) => {
                const card = findCard(sorceryCards, listing.cardId);
                return (
                  <div key={listing.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                    {card && <img src={cardImageUrl(card)} alt={card.name} className="w-10 rounded aspect-[5/7] object-cover bg-black/40" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{card?.name || listing.cardId}</div>
                    </div>
                    <span className="text-sm font-bold text-yellow-300 shrink-0">{listing.price} coins</span>
                    <button
                      type="button"
                      disabled={cancellingId === listing.id}
                      className="rounded-lg border border-red-500/30 px-2.5 py-1 text-[10px] font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors shrink-0"
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
            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3">Sold ({sold.length})</div>
            <div className="flex flex-col gap-1">
              {sold.map((listing) => {
                const card = findCard(sorceryCards, listing.cardId);
                return (
                  <div key={listing.id} className="flex items-center gap-3 rounded-lg bg-white/[0.02] px-3 py-2">
                    {card && <img src={cardImageUrl(card)} alt={card.name} className="w-8 rounded aspect-[5/7] object-cover bg-black/40" />}
                    <span className="text-xs text-white/50 flex-1 truncate">{card?.name || listing.cardId}</span>
                    <span className="text-xs font-semibold text-green-400">+{listing.price} coins</span>
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
      <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0908] text-white overflow-hidden arena-bg">
        <div className="flex items-center gap-4 px-6 py-3 border-b border-white/10 bg-black/80 backdrop-blur-sm">
          <button
            type="button"
            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
            onClick={onBack}
          >
            Back to Hub
          </button>
          <div className="text-sm font-bold arena-heading">Auction House</div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm font-bold text-yellow-300">{profile.coins}</span>
            <span className="text-[10px] text-yellow-300/60">coins</span>
          </div>
        </div>

        <div className="flex gap-1 px-6 py-2 border-b border-white/5">
          {[
            { key: 'browse', label: 'Browse' },
            { key: 'sell', label: 'Sell' },
            { key: 'my-listings', label: 'My Listings' },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              className={cn(
                'rounded-lg px-4 py-1.5 text-xs font-medium transition-colors',
                tab === t.key ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70',
              )}
              onClick={() => this.switchTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mx-6 mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-400">
            {error}
            <button type="button" className="ml-2 underline hover:no-underline" onClick={() => this.setState({ error: null })}>dismiss</button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tab === 'browse' && this.renderBrowse()}
          {tab === 'sell' && this.renderSell()}
          {tab === 'my-listings' && this.renderMyListings()}
        </div>
      </div>
    );
  }
}
