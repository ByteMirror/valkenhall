import { Component } from 'preact';
import { CURRENCY, SET_UNLOCK_LEVELS, levelFromXp, isArenaDebugMode } from '../utils/arena/profileDefaults';
import { BOOSTER_SETS } from '../utils/arena/packGenerator';
import { getLocalApiOrigin } from '../utils/localApi';
import { cn } from '../lib/utils';

const SET_ORDER = ['gothic', 'arthurian', 'beta'];

function getBoosterImage(setKey) {
  const base = getLocalApiOrigin();
  return `${base}/game-assets/booster-${setKey}.webp`;
}

// Per-set scale adjustments to visually match sizes despite different image padding
const BOOSTER_SCALE = {
  gothic: 1,
  arthurian: 1.85,
  beta: 1,
};

export default class ArenaStore extends Component {
  constructor(props) {
    super(props);
    this.state = {
      tab: 'boosters', // 'boosters' | 'decks'
      cart: { gothic: 0, arthurian: 0, beta: 0 },
      showConfirm: false,
      purchaseFlash: false,
    };
  }

  setCart = (setKey, value) => {
    const qty = Math.max(0, Math.min(99, parseInt(value, 10) || 0));
    this.setState((s) => ({ cart: { ...s.cart, [setKey]: qty } }));
  };

  addToCart = (setKey) => {
    this.setState((s) => ({ cart: { ...s.cart, [setKey]: (s.cart[setKey] || 0) + 1 } }));
  };

  getCartTotal() {
    const { cart } = this.state;
    let packs = 0;
    let cost = 0;
    for (const key of SET_ORDER) {
      packs += cart[key] || 0;
      cost += (cart[key] || 0) * CURRENCY.PACK_PRICE;
    }
    return { packs, cost };
  }

  handlePurchase = () => {
    const { cart } = this.state;
    const { onBuyPack } = this.props;

    for (const setKey of SET_ORDER) {
      if (cart[setKey] > 0) {
        onBuyPack(setKey, cart[setKey]);
      }
    }

    this.setState({
      cart: { gothic: 0, arthurian: 0, beta: 0 },
      showConfirm: false,
      purchaseFlash: true,
    });
    setTimeout(() => this.setState({ purchaseFlash: false }), 1500);
  };

  render() {
    const { profile, pendingPacks, onBack, onOpenPacks } = this.props;
    const { tab, cart, showConfirm, purchaseFlash } = this.state;
    const level = levelFromXp(profile.xp);
    const debug = isArenaDebugMode();
    const totalPending = pendingPacks?.length || 0;
    const { packs: cartPacks, cost: cartCost } = this.getCartTotal();
    const canAffordCart = debug || profile.coins >= cartCost;

    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{
        background: `linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.7) 100%), url('/flesh-and-blood-proxies/store-bg.png') center/cover no-repeat`,
      }}>
        {/* Purchase flash overlay */}
        {purchaseFlash ? (
          <div className="fixed inset-0 z-[60] pointer-events-none bg-amber-500/10 animate-[fadeOut_1.5s_ease-out_forwards]" />
        ) : null}

        <div className="flex items-center gap-4 px-6 py-3 border-b border-white/10 bg-black/80 backdrop-blur-sm">
          <button
            type="button"
            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
            onClick={onBack}
          >
            Back to Hub
          </button>
          <div className="ml-auto flex items-center gap-4">
            {totalPending > 0 ? (
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg bg-amber-500/15 border border-amber-500/30 px-3 py-1.5 text-xs font-semibold text-amber-400 hover:bg-amber-500/25 transition-colors"
                onClick={onOpenPacks}
              >
                <span className="size-2 rounded-full bg-amber-400 animate-pulse" />
                {totalPending} pack{totalPending !== 1 ? 's' : ''} to open
              </button>
            ) : null}
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-bold text-yellow-300">{profile.coins}</span>
              <span className="text-xs text-muted-foreground">coins</span>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex justify-center border-b border-white/10">
          {[
            { id: 'boosters', label: 'Booster Packs' },
            { id: 'decks', label: 'Pre-constructed Decks' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              className={cn(
                'px-8 py-3 text-sm font-medium transition-colors relative',
                tab === t.id
                  ? 'text-white'
                  : 'text-muted-foreground hover:text-white/80'
              )}
              onClick={() => this.setState({ tab: t.id })}
            >
              {t.label}
              {tab === t.id ? (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500" />
              ) : null}
            </button>
          ))}
        </div>

        <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
          {tab === 'boosters' ? (
          <div className="w-full max-w-4xl">
            <div className="text-center mb-10">
              <h1 className="text-3xl font-bold text-white mb-2">Booster Packs</h1>
              <p className="text-muted-foreground">Each pack contains 15 cards · {CURRENCY.PACK_PRICE} coins per pack</p>
            </div>

            <div className="grid grid-cols-3 gap-8 mb-10">
              {SET_ORDER.map((setKey) => {
                const set = BOOSTER_SETS[setKey];
                const requiredLevel = SET_UNLOCK_LEVELS[setKey];
                const unlocked = debug || level >= requiredLevel;
                const qty = cart[setKey] || 0;

                return (
                  <div
                    key={setKey}
                    className="flex flex-col items-center transition-all"
                  >
                    {/* Booster image — click to add to cart */}
                    <button
                      type="button"
                      disabled={!unlocked}
                      className={cn(
                        'relative mb-4 transition-transform flex items-center justify-center',
                        unlocked ? 'hover:scale-105 cursor-pointer active:scale-95' : 'opacity-30'
                      )}
                      style={{ width: '200px', height: '300px' }}
                      onClick={() => unlocked && this.addToCart(setKey)}
                    >
                      <img
                        src={getBoosterImage(setKey)}
                        alt={`${set.label} Booster Pack`}
                        className="max-w-full max-h-full object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.6)]"
                        style={{ transform: `scale(${BOOSTER_SCALE[setKey] || 1})` }}
                        draggable={false}
                      />
                      {!unlocked ? (
                        <div className="absolute inset-0 flex items-end justify-center pb-4">
                          <span className="text-3xl drop-shadow-lg">🔒</span>
                        </div>
                      ) : null}
                      {/* Cart badge */}
                      {qty > 0 ? (
                        <div className="absolute -top-2 -right-2 size-7 rounded-full bg-amber-500 flex items-center justify-center text-xs font-bold text-black shadow-lg">
                          {qty}
                        </div>
                      ) : null}
                    </button>

                    <div className="text-lg font-bold text-white mb-2">{set.label}</div>

                    {unlocked ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="size-7 rounded-lg border border-white/20 flex items-center justify-center text-white/60 hover:bg-white/10 text-sm"
                          onClick={() => this.setCart(setKey, qty - 1)}
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          max="99"
                          value={qty}
                          className="w-12 rounded-lg border border-white/20 bg-transparent text-center text-sm text-white outline-none focus:border-white/40 py-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          onInput={(e) => this.setCart(setKey, e.target.value)}
                        />
                        <button
                          type="button"
                          className="size-7 rounded-lg border border-white/20 flex items-center justify-center text-white/60 hover:bg-white/10 text-sm"
                          onClick={() => this.setCart(setKey, qty + 1)}
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground/50">Unlocks at Level {requiredLevel}</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Cart summary + checkout */}
            <div className={cn(
              'rounded-2xl border p-5 flex items-center justify-between transition-all',
              cartPacks > 0
                ? 'border-amber-500/30 bg-amber-500/5'
                : 'border-white/10 bg-white/[0.02]'
            )}>
              <div>
                <div className={cn('text-sm font-semibold', cartPacks > 0 ? 'text-white' : 'text-white/30')}>
                  {cartPacks > 0 ? `${cartPacks} pack${cartPacks !== 1 ? 's' : ''} selected` : 'No packs selected'}
                </div>
                <div className="text-xs text-muted-foreground/50 mt-0.5">
                  {cartPacks > 0
                    ? SET_ORDER.filter((k) => cart[k] > 0).map((k) => `${cart[k]}x ${BOOSTER_SETS[k].label}`).join(', ')
                    : 'Click a pack or use +/- to add to cart'}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className={cn('text-lg font-bold tabular-nums', cartPacks > 0 ? 'text-yellow-300' : 'text-white/20')}>{cartCost}</div>
                  <div className="text-[10px] text-muted-foreground/50">coins</div>
                </div>
                <button
                  type="button"
                  disabled={cartPacks === 0 || !canAffordCart}
                  className={cn(
                    'rounded-xl px-8 py-3 text-sm font-semibold transition-all',
                    cartPacks > 0 && canAffordCart
                      ? 'bg-amber-500 text-black hover:bg-amber-400 shadow-lg shadow-amber-500/20'
                      : 'bg-white/5 text-white/20 cursor-not-allowed'
                  )}
                  onClick={() => this.setState({ showConfirm: true })}
                >
                  {cartPacks === 0 ? 'Purchase' : canAffordCart ? 'Purchase' : 'Not enough coins'}
                </button>
              </div>
            </div>
          </div>
          ) : null}

          {tab === 'decks' ? (
            <div className="w-full max-w-4xl">
              <div className="text-center mb-10">
                <h1 className="text-3xl font-bold text-white mb-2">Pre-constructed Decks</h1>
                <p className="text-muted-foreground">Ready-to-play decks with a curated selection of cards</p>
              </div>
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="text-6xl mb-4 opacity-20">🃏</div>
                  <div className="text-lg font-semibold text-white/40">Coming Soon</div>
                  <p className="text-sm text-muted-foreground/50 mt-2 max-w-sm">Pre-constructed decks will be available for purchase in a future update.</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Confirmation dialog */}
        {showConfirm ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => this.setState({ showConfirm: false })}>
            <div className="w-96 rounded-2xl border border-border/70 bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold text-white mb-4">Confirm Purchase</h2>
              <div className="flex flex-col gap-2 mb-4">
                {SET_ORDER.filter((k) => cart[k] > 0).map((k) => (
                  <div key={k} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <img src={getBoosterImage(k)} alt="" className="w-8 h-auto" draggable={false} />
                      <span className="text-white">{cart[k]}x {BOOSTER_SETS[k].label}</span>
                    </div>
                    <span className="text-yellow-300 tabular-nums">{cart[k] * CURRENCY.PACK_PRICE}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between py-3 border-t border-white/10 mb-5">
                <span className="text-sm font-semibold text-white">Total</span>
                <span className="text-lg font-bold text-yellow-300 tabular-nums">{cartCost} coins</span>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="flex-1 rounded-xl border border-white/20 py-2.5 text-sm font-medium text-white/70 hover:bg-white/10"
                  onClick={() => this.setState({ showConfirm: false })}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 shadow-lg"
                  onClick={this.handlePurchase}
                >
                  Buy {cartPacks} Pack{cartPacks !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <style>{`
          @keyframes fadeOut {
            0% { opacity: 1; }
            100% { opacity: 0; }
          }
        `}</style>
      </div>
    );
  }
}
