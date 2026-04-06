import { Component } from 'preact';
import { cn } from '../lib/utils';
import { UI } from '../utils/arena/uiSounds';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, PANEL_BG, ACCENT_GOLD,
  DIALOG_STYLE, GOLD_BTN, BEVELED_BTN, INPUT_STYLE,
  FourCorners, OrnamentalDivider, SECTION_HEADER_STYLE, VIGNETTE,
} from '../lib/medievalTheme';

export default class TradeWindow extends Component {
  constructor(props) {
    super(props);
    this.state = {
      myOffer: [],
      theirOffer: [],
      myLocked: false,
      theirLocked: false,
      searchQuery: '',
    };
  }

  addToOffer = (card) => {
    this.setState((s) => {
      const existing = s.myOffer.find((c) => c.cardId === card.cardId);
      const ownedQty = this.getOwnedQuantity(card.cardId);
      const offeredQty = existing ? existing.quantity : 0;
      if (offeredQty >= ownedQty) return null;
      if (existing) {
        return { myOffer: s.myOffer.map((c) => c.cardId === card.cardId ? { ...c, quantity: c.quantity + 1 } : c), myLocked: false };
      }
      return { myOffer: [...s.myOffer, { cardId: card.cardId, quantity: 1, name: card.name, imageUrl: card.imageUrl }], myLocked: false };
    }, () => this.props.onOfferChanged?.(this.state.myOffer));
  };

  removeFromOffer = (cardId) => {
    this.setState((s) => {
      const existing = s.myOffer.find((c) => c.cardId === cardId);
      if (!existing) return null;
      if (existing.quantity > 1) {
        return { myOffer: s.myOffer.map((c) => c.cardId === cardId ? { ...c, quantity: c.quantity - 1 } : c), myLocked: false };
      }
      return { myOffer: s.myOffer.filter((c) => c.cardId !== cardId), myLocked: false };
    }, () => this.props.onOfferChanged?.(this.state.myOffer));
  };

  getOwnedQuantity(cardId) {
    const entry = this.props.collection?.find((c) => c.cardId === cardId);
    return entry?.quantity || 0;
  }

  handleLockIn = () => {
    this.setState({ myLocked: true });
    this.props.onLockIn?.();
  };

  handleConfirm = () => {
    this.props.onConfirm?.(this.state.myOffer, this.state.theirOffer);
  };

  render() {
    const { collection, sorceryCards, partnerName, onCancel } = this.props;
    const { myOffer, theirOffer, myLocked, theirLocked, searchQuery } = this.state;
    const bothLocked = myLocked && theirLocked;
    const q = searchQuery.toLowerCase().trim();
    const filteredCollection = (collection || []).filter((entry) => {
      if (!q) return true;
      const card = sorceryCards?.find((c) => c.unique_id === entry.cardId);
      return card?.name?.toLowerCase().includes(q);
    });

    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}>
        <div className="fixed inset-0 pointer-events-none" style={{ background: VIGNETTE }} />
        <div className="relative w-full max-w-5xl h-[80vh] flex flex-col" style={DIALOG_STYLE}>
          <FourCorners radius={12} />

          {/* Header */}
          <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${GOLD} 0.12)` }}>
            <h2 className="text-sm font-semibold arena-heading" style={{ color: TEXT_PRIMARY, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>Trading with {partnerName}</h2>
            <button
              type="button"
              className="text-xs cursor-pointer transition-all"
              style={{ color: TEXT_MUTED }}
              onMouseEnter={(e) => { e.currentTarget.style.color = TEXT_BODY; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = TEXT_MUTED; }}
              data-sound={UI.CANCEL}
              onClick={onCancel}
            >
              Cancel
            </button>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* Left: collection */}
            <div className="w-1/3 flex flex-col" style={{ borderRight: `1px solid ${GOLD} 0.08)` }}>
              <div className="px-3 py-2" style={{ borderBottom: `1px solid ${GOLD} 0.08)` }}>
                <input
                  type="text"
                  placeholder="Search your cards..."
                  className="w-full px-3 py-1.5 text-xs outline-none"
                  style={{ ...INPUT_STYLE, borderRadius: '6px', color: TEXT_PRIMARY }}
                  value={searchQuery}
                  onInput={(e) => this.setState({ searchQuery: e.target.value })}
                />
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                <div className="grid grid-cols-3 gap-1">
                  {filteredCollection.map((entry) => {
                    const card = sorceryCards?.find((c) => c.unique_id === entry.cardId);
                    if (!card) return null;
                    const imageUrl = card.printings?.[0]?.image_url || '';
                    return (
                      <button
                        key={entry.cardId}
                        type="button"
                        className="rounded-md overflow-hidden relative cursor-pointer transition-all"
                        style={{ border: `1px solid ${GOLD} 0.08)` }}
                        onMouseEnter={(e) => { if (!myLocked) e.currentTarget.style.borderColor = ACCENT_GOLD; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.08)`; }}
                        onClick={() => this.addToOffer({ cardId: entry.cardId, name: card.name, imageUrl })}
                        disabled={myLocked}
                      >
                        <img src={imageUrl} alt={card.name} className="w-full aspect-[63/88] object-cover" draggable={false} />
                        <div className="absolute bottom-0 left-0 right-0 text-[8px] text-center py-0.5 truncate" style={{ background: 'rgba(0,0,0,0.7)', color: TEXT_BODY }}>{card.name} x{entry.quantity}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Center: offers */}
            <div className="flex-1 flex flex-col">
              <div className="flex-1 flex">
                {/* My offer */}
                <div className="flex-1 p-4" style={{ borderRight: `1px solid ${GOLD} 0.08)` }}>
                  <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={SECTION_HEADER_STYLE}>Your Offer {myLocked ? '(Locked)' : ''}</div>
                  <div className="flex flex-wrap gap-1">
                    {myOffer.map((item) => (
                      <div key={item.cardId} className="relative">
                        <img src={item.imageUrl} alt={item.name} className="w-16 aspect-[63/88] rounded-md object-cover" />
                        {item.quantity > 1 ? <div className="absolute -top-1 -right-1 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center" style={{ background: ACCENT_GOLD, color: '#1a1408' }}>{item.quantity}</div> : null}
                        {!myLocked ? <button type="button" className="absolute top-0 left-0 w-full h-full bg-black/0 hover:bg-black/50 flex items-center justify-center text-white/0 hover:text-white text-xs rounded-md transition-all cursor-pointer" onClick={() => this.removeFromOffer(item.cardId)}>Remove</button> : null}
                      </div>
                    ))}
                    {myOffer.length === 0 ? <div className="text-xs py-8 text-center w-full" style={{ color: TEXT_MUTED }}>Click cards to add</div> : null}
                  </div>
                </div>
                {/* Their offer */}
                <div className="flex-1 p-4">
                  <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={SECTION_HEADER_STYLE}>{partnerName}'s Offer {theirLocked ? '(Locked)' : ''}</div>
                  <div className="flex flex-wrap gap-1">
                    {theirOffer.map((item) => (
                      <div key={item.cardId} className="relative">
                        <img src={item.imageUrl} alt={item.name} className="w-16 aspect-[63/88] rounded-md object-cover" />
                        {item.quantity > 1 ? <div className="absolute -top-1 -right-1 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center" style={{ background: TEXT_BODY, color: '#000' }}>{item.quantity}</div> : null}
                      </div>
                    ))}
                    {theirOffer.length === 0 ? <div className="text-xs py-8 text-center w-full" style={{ color: TEXT_MUTED }}>Waiting for offer...</div> : null}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-4 py-3 flex items-center justify-end gap-3" style={{ borderTop: `1px solid ${GOLD} 0.12)` }}>
                {!myLocked ? (
                  <button
                    type="button"
                    disabled={myOffer.length === 0}
                    className="px-6 py-2 text-sm font-semibold cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    style={myOffer.length > 0 ? GOLD_BTN : { ...BEVELED_BTN, color: TEXT_MUTED }}
                    data-sound={UI.CONFIRM}
                    onClick={this.handleLockIn}
                  >
                    Lock In
                  </button>
                ) : bothLocked ? (
                  <button
                    type="button"
                    className="px-6 py-2 text-sm font-semibold cursor-pointer transition-all"
                    style={GOLD_BTN}
                    data-sound={UI.CONFIRM}
                    onClick={this.handleConfirm}
                  >
                    Confirm Trade
                  </button>
                ) : (
                  <div className="text-xs" style={{ color: ACCENT_GOLD }}>Waiting for {partnerName} to lock in...</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
