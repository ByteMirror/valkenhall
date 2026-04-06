import { Component } from 'preact';
import { Mail, Users } from 'lucide-react';
import { CURRENCY, SET_UNLOCK_LEVELS, levelFromXp, isArenaDebugMode } from '../utils/arena/profileDefaults';
import { BOOSTER_SETS } from '../utils/arena/packGenerator';
import { getLocalApiOrigin } from '../utils/localApi';
import { cn } from '../lib/utils';
import { GOLD, GOLD_TEXT, ACCENT_GOLD, BEVELED_BTN, GOLD_BTN, PANEL_BG, PANEL_BORDER, CornerPlating, getViewportScale, onViewportScaleChange } from '../lib/medievalTheme';
import AppHeader from './AppHeader';
import { playUI, UI } from '../utils/arena/uiSounds';
import AmbientParticles from './AmbientParticles';
import StoreTorchFX from './StoreTorchFX';

const SET_ORDER = ['gothic', 'arthurian', 'beta'];

function getBoosterImage(setKey) {
  const base = getLocalApiOrigin();
  return `${base}/game-assets/booster-${setKey}.webp`;
}

const BOOSTER_SCALE = {
  gothic: 1,
  arthurian: 1.85,
  beta: 1,
};

export default class ArenaStore extends Component {
  constructor(props) {
    super(props);
    this.state = {
      tab: 'boosters',
      cart: { gothic: 0, arthurian: 0, beta: 0 },
      showConfirm: false,
      purchaseFlash: false,
      viewScale: getViewportScale(),
    };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
  }

  componentWillUnmount() {
    this.unsubScale?.();
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
    playUI(UI.GOLD);
    const { cart } = this.state;
    const { onBuyPack } = this.props;
    for (const setKey of SET_ORDER) {
      if (cart[setKey] > 0) onBuyPack(setKey, cart[setKey]);
    }
    this.setState({ cart: { gothic: 0, arthurian: 0, beta: 0 }, showConfirm: false, purchaseFlash: true });
    setTimeout(() => this.setState({ purchaseFlash: false }), 1500);
  };

  render() {
    const { profile, pendingPacks, onBack, onOpenPacks, onToggleMailbox, mailboxUnreadCount, mailboxDropdown, onToggleFriends, friendListData } = this.props;
    const { tab, cart, showConfirm, purchaseFlash } = this.state;
    const level = levelFromXp(profile.xp);
    const debug = isArenaDebugMode();
    const totalPending = pendingPacks?.length || 0;
    const { packs: cartPacks, cost: cartCost } = this.getCartTotal();
    const canAffordCart = debug || profile.coins >= cartCost;

    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{
        background: `url('/store-bg.png') center/cover no-repeat`,
        zoom: this.state.viewScale,
      }}>
        {/* Darken overlay */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.35) 40%, rgba(0,0,0,0.5) 70%, rgba(0,0,0,0.85) 100%)' }} />
        {/* Vignette */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 50%, transparent 30%, rgba(0,0,0,0.6) 100%)' }} />

        {/* Torch firelight glow */}
        <StoreTorchFX />

        {/* Ambient particles */}
        <AmbientParticles preset="store" />

        {purchaseFlash ? (
          <div className="fixed inset-0 z-[60] pointer-events-none" style={{ background: 'rgba(245,158,11,0.08)', animation: 'fadeOut 1.5s ease-out forwards' }} />
        ) : null}

        {/* ─── TOP BAR ─────────────────────────────── */}
        <AppHeader
          profile={profile}
          onToggleMailbox={onToggleMailbox}
          mailboxUnreadCount={mailboxUnreadCount}
          mailboxDropdown={mailboxDropdown}
          onToggleFriends={onToggleFriends}
          friendListData={friendListData}
          zoom={1}
        >
          <button
            type="button"
            className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all hover:scale-[1.03] active:scale-[0.97]"
            style={{ ...BEVELED_BTN, color: '#A6A09B', borderRadius: '4px' }}
            data-sound={UI.CANCEL}
            onClick={onBack}
          >
            Back to Hub
          </button>
          {totalPending > 0 ? (
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold transition-all hover:scale-[1.02]"
              style={{ ...GOLD_BTN, borderRadius: '4px' }}
              onClick={onOpenPacks}
            >
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              {totalPending} pack{totalPending !== 1 ? 's' : ''} to open
            </button>
          ) : null}
        </AppHeader>

        {/* ─── TAB BAR ─────────────────────────────── */}
        <div className="relative z-10 flex justify-center py-1" style={{ background: 'rgba(8,6,4,0.7)', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${GOLD} 0.12)` }}>
          {[
            { id: 'boosters', label: 'Booster Packs' },
            { id: 'decks', label: 'Pre-constructed Decks' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              className="px-8 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all relative"
              style={{
                color: tab === t.id ? '#e8d5a0' : 'rgba(166,160,155,0.5)',
                textShadow: tab === t.id ? '0 0 10px rgba(180,140,60,0.2)' : 'none',
              }}
              onClick={() => this.setState({ tab: t.id })}
            >
              <span className="arena-heading">{t.label}</span>
              {tab === t.id ? (
                <div className="absolute bottom-0 left-4 right-4 h-[2px]" style={{ background: `linear-gradient(90deg, transparent, ${GOLD} 0.6), transparent)` }} />
              ) : null}
            </button>
          ))}
        </div>

        {/* ─── CONTENT ─────────────────────────────── */}
        <div className="relative z-10 flex-1 flex items-center justify-center p-6 overflow-y-auto">
          {tab === 'boosters' ? (
            <div className="w-full max-w-4xl">
              {/* Title */}
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold arena-heading mb-1" style={{ color: '#e8d5a0', textShadow: '0 2px 8px rgba(0,0,0,0.6), 0 0 30px rgba(180,140,60,0.15)' }}>Booster Packs</h1>
                <p className="text-sm" style={{ color: 'rgba(166,160,155,0.6)', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>Each pack contains 15 cards · {CURRENCY.PACK_PRICE} gold per pack</p>
              </div>

              {/* Booster grid */}
              <div className="grid grid-cols-3 gap-8 mb-8">
                {SET_ORDER.map((setKey) => {
                  const set = BOOSTER_SETS[setKey];
                  const requiredLevel = SET_UNLOCK_LEVELS[setKey];
                  const unlocked = debug || level >= requiredLevel;
                  const qty = cart[setKey] || 0;

                  return (
                    <div key={setKey} className="flex flex-col items-center">
                      {/* Booster image */}
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
                          className="max-w-full max-h-full object-contain"
                          style={{ transform: `scale(${BOOSTER_SCALE[setKey] || 1})`, filter: 'drop-shadow(0 10px 30px rgba(0,0,0,0.7))' }}
                          draggable={false}
                        />
                        {!unlocked ? (
                          <div className="absolute inset-0 flex items-end justify-center pb-4">
                            <span className="text-3xl" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}>🔒</span>
                          </div>
                        ) : null}
                        {qty > 0 ? (
                          <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-black" style={{ background: '#d4a843', boxShadow: '0 0 12px rgba(212,168,67,0.4), 0 2px 4px rgba(0,0,0,0.5)' }}>
                            {qty}
                          </div>
                        ) : null}
                      </button>

                      {/* Set name */}
                      <div className="text-base font-bold arena-heading mb-2" style={{ color: '#e8d5a0', textShadow: '0 1px 4px rgba(0,0,0,0.6)' }}>{set.label}</div>

                      {/* Quantity controls */}
                      {unlocked ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="w-8 h-8 flex items-center justify-center text-sm font-bold transition-all hover:scale-110 active:scale-90"
                            style={{ ...BEVELED_BTN, borderRadius: '4px', color: '#A6A09B' }}
                            onClick={() => this.setCart(setKey, qty - 1)}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min="0"
                            max="99"
                            value={qty}
                            className="w-10 h-8 text-center text-sm font-bold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            style={{ background: PANEL_BG, border: `1px solid ${GOLD} 0.15)`, borderRadius: '4px', color: '#e8d5a0' }}
                            onInput={(e) => this.setCart(setKey, e.target.value)}
                          />
                          <button
                            type="button"
                            className="w-8 h-8 flex items-center justify-center text-sm font-bold transition-all hover:scale-110 active:scale-90"
                            style={{ ...BEVELED_BTN, borderRadius: '4px', color: '#A6A09B' }}
                            onClick={() => this.setCart(setKey, qty + 1)}
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <div className="text-xs" style={{ color: 'rgba(166,160,155,0.4)', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>Unlocks at Level {requiredLevel}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Cart summary */}
              <div className="relative p-5 flex items-center justify-between" style={{
                background: PANEL_BG,
                backdropFilter: 'blur(8px)',
                border: `1px solid ${cartPacks > 0 ? `${GOLD} 0.35)` : `${GOLD} 0.15)`}`,
                borderRadius: '8px',
                boxShadow: cartPacks > 0 ? `0 0 20px ${GOLD} 0.08)` : 'none',
              }}>
                <CornerPlating position="top-left" />
                <CornerPlating position="top-right" />
                <CornerPlating position="bottom-left" />
                <CornerPlating position="bottom-right" />
                <div>
                  <div className="text-sm font-semibold" style={{ color: cartPacks > 0 ? '#e8d5a0' : 'rgba(166,160,155,0.4)' }}>
                    {cartPacks > 0 ? `${cartPacks} pack${cartPacks !== 1 ? 's' : ''} selected` : 'No packs selected'}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'rgba(166,160,155,0.35)' }}>
                    {cartPacks > 0
                      ? SET_ORDER.filter((k) => cart[k] > 0).map((k) => `${cart[k]}× ${BOOSTER_SETS[k].label}`).join(', ')
                      : 'Click a pack or use +/− to add'}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-lg font-bold tabular-nums" style={{ color: cartPacks > 0 ? '#f0d060' : 'rgba(166,160,155,0.2)' }}>{cartCost}</div>
                    <div className="text-[10px]" style={{ color: 'rgba(166,160,155,0.3)' }}>gold</div>
                  </div>
                  <button
                    type="button"
                    disabled={cartPacks === 0 || !canAffordCart}
                    className="px-8 py-3 text-sm font-semibold arena-heading uppercase tracking-wider transition-all hover:scale-[1.03] active:scale-[0.97]"
                    style={cartPacks > 0 && canAffordCart
                      ? GOLD_BTN
                      : {
                          ...BEVELED_BTN,
                          color: 'rgba(166,160,155,0.25)',
                        }
                    }
                    data-sound={UI.CONFIRM}
                    onClick={() => this.setState({ showConfirm: true })}
                  >
                    {cartPacks === 0 ? 'Purchase' : canAffordCart ? 'Purchase' : 'Not enough gold'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {tab === 'decks' ? (
            <div className="w-full max-w-4xl">
              <div className="text-center py-20">
                <div className="text-5xl mb-4 opacity-20">🃏</div>
                <div className="text-lg font-semibold arena-heading" style={{ color: 'rgba(166,160,155,0.4)' }}>Coming Soon</div>
                <p className="text-sm mt-2 max-w-sm mx-auto" style={{ color: 'rgba(166,160,155,0.25)' }}>Pre-constructed decks will be available in a future update.</p>
              </div>
            </div>
          ) : null}
        </div>

        {/* ─── CONFIRMATION DIALOG ─────────────────── */}
        {showConfirm ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm" onClick={() => this.setState({ showConfirm: false })}>
            <div
              className="relative w-96 p-6"
              style={{ background: PANEL_BG, backdropFilter: 'blur(8px)', border: `1px solid ${PANEL_BORDER}`, borderRadius: '8px', boxShadow: `0 0 40px rgba(0,0,0,0.5), 0 0 20px ${GOLD} 0.05)` }}
              onClick={(e) => e.stopPropagation()}
            >
              <CornerPlating position="top-left" />
              <CornerPlating position="top-right" />
              <CornerPlating position="bottom-left" />
              <CornerPlating position="bottom-right" />

              <h2 className="text-lg font-bold arena-heading mb-4" style={{ color: '#e8d5a0' }}>Confirm Purchase</h2>
              <div className="flex flex-col gap-2 mb-4">
                {SET_ORDER.filter((k) => cart[k] > 0).map((k) => (
                  <div key={k} className="flex items-center justify-between text-sm py-1" style={{ borderBottom: `1px solid ${GOLD} 0.08)` }}>
                    <div className="flex items-center gap-3">
                      <img src={getBoosterImage(k)} alt="" className="w-8 h-auto" draggable={false} />
                      <span style={{ color: '#A6A09B' }}>{cart[k]}× {BOOSTER_SETS[k].label}</span>
                    </div>
                    <span className="tabular-nums font-semibold" style={{ color: '#f0d060' }}>{cart[k] * CURRENCY.PACK_PRICE}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between py-3 mb-5" style={{ borderTop: `1px solid ${GOLD} 0.15)` }}>
                <span className="text-sm font-semibold" style={{ color: '#e8d5a0' }}>Total</span>
                <span className="text-lg font-bold tabular-nums" style={{ color: '#f0d060' }}>{cartCost} gold</span>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="flex-1 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={{ ...BEVELED_BTN, borderRadius: '4px', color: '#A6A09B' }}
                  data-sound={UI.CANCEL}
                  onClick={() => this.setState({ showConfirm: false })}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="flex-1 py-2.5 text-sm font-semibold arena-heading uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-[0.97]"
                  style={{ ...GOLD_BTN, borderRadius: '4px' }}
                  data-sound={UI.CONFIRM}
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
