import { Component } from 'preact';
import { Mail, Users } from 'lucide-react';
import {
  GOLD, GOLD_TEXT, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD,
  BEVELED_BTN, INPUT_STYLE, BG_ATMOSPHERE, VIGNETTE, PANEL_BG,
  FourCorners, OrnamentalDivider, getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';
import { playUI, UI } from '../utils/arena/uiSounds';

function getAvatarImageUrl(deck, sorceryCards) {
  if (!deck.cards || !sorceryCards) return null;
  for (const entry of deck.cards) {
    const card = sorceryCards.find((c) => c.unique_id === entry.cardId);
    if (card?.type === 'Avatar') {
      const printing = card.printings?.find((p) => p.unique_id === entry.printingId) || card.printings?.[0];
      return printing?.image_url || null;
    }
  }
  return null;
}

export default class DeckGallery extends Component {
  constructor(props) {
    super(props);
    this.state = {
      searchQuery: '',
      viewScale: getViewportScale(),
      confirmDeleteId: null,
    };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
  }

  componentWillUnmount() {
    this.unsubScale?.();
  }

  getFilteredDecks() {
    const { savedDecks } = this.props;
    const { searchQuery } = this.state;
    if (!savedDecks) return [];
    if (!searchQuery.trim()) return savedDecks;
    const q = searchQuery.toLowerCase();
    return savedDecks.filter((d) => d.name.toLowerCase().includes(q));
  }

  render() {
    const { onBack, onCreateDeck, onOpenDeck, onDeleteDeck, sorceryCards, onToggleMailbox, mailboxUnreadCount, mailboxDropdown, onToggleFriends, friendListData } = this.props;
    const { searchQuery, viewScale, confirmDeleteId } = this.state;
    const filteredDecks = this.getFilteredDecks();

    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#08080a' }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: BG_ATMOSPHERE }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: VIGNETTE }} />

        {/* Header — minimal, just back + title */}
        <div
          className="relative z-10 flex items-center gap-4 px-6 py-3"
          style={{ borderBottom: `1px solid ${GOLD} 0.12)`, background: PANEL_BG, zoom: viewScale }}
        >
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-1.5 rounded transition-all duration-200 hover:opacity-80"
            style={{ ...BEVELED_BTN, color: TEXT_BODY, fontSize: '13px' }}
            data-sound={UI.CANCEL}
            onClick={onBack}
          >
            <span style={{ fontSize: '16px' }}>&larr;</span>
            Back
          </button>
          <h1 className="arena-heading text-lg font-bold" style={{ color: TEXT_PRIMARY, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>Deck Collection</h1>
          <div className="ml-auto flex items-center gap-3">
            <div className="relative">
              <button
                type="button"
                className="relative flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
                style={{ ...BEVELED_BTN, color: `${GOLD_TEXT} 0.7)` }}
                onClick={onToggleMailbox}
              >
                <Mail size={14} />
                Mailbox
                {(mailboxUnreadCount || 0) > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-bold text-white px-1" style={{ background: ACCENT_GOLD, boxShadow: `0 0 8px ${GOLD} 0.5)` }}>
                    {mailboxUnreadCount}
                  </span>
                )}
              </button>
              {mailboxDropdown}
            </div>
            <button
              type="button"
              className="relative flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
              style={{ ...BEVELED_BTN, color: `${GOLD_TEXT} 0.7)` }}
              onClick={onToggleFriends}
            >
              <Users size={14} />
              Friends
              {(friendListData?.pendingCount || 0) > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-red-500 flex items-center justify-center text-[9px] font-bold text-white px-1" style={{ boxShadow: '0 0 8px rgba(239,68,68,0.5)' }}>
                  {friendListData.pendingCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="relative z-10 flex-1 overflow-y-auto" style={{ zoom: viewScale }}>
          <div className="max-w-[1100px] mx-auto px-8 py-6">

            {/* Search row + count */}
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-1 max-w-xs">
                <input
                  type="text"
                  placeholder="Search decks..."
                  value={searchQuery}
                  onInput={(e) => this.setState({ searchQuery: e.target.value })}
                  className="w-full pl-8 pr-3 py-1.5 text-sm outline-none"
                  style={INPUT_STYLE}
                />
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: TEXT_MUTED, fontSize: '13px' }}>&#128269;</span>
              </div>
              <span className="text-xs" style={{ color: TEXT_MUTED }}>
                {filteredDecks.length} deck{filteredDecks.length !== 1 ? 's' : ''}
              </span>
            </div>

            <OrnamentalDivider className="mb-5" />

            {/* Grid */}
            <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>

              {/* New deck */}
              <button
                type="button"
                className="group relative flex flex-col items-center justify-center transition-all duration-200 hover:scale-[1.03]"
                style={{
                  aspectRatio: '63 / 88',
                  background: 'rgba(12, 10, 8, 0.5)',
                  border: `2px dashed ${GOLD} 0.18)`,
                  borderRadius: '8px',
                }}
                onClick={onCreateDeck}
              >
                <FourCorners color={`${GOLD} 0.1)`} radius={8} />
                <span className="text-2xl font-light mb-1 transition-transform duration-200 group-hover:scale-110" style={{ color: ACCENT_GOLD }}>+</span>
                <span className="text-[10px] arena-heading" style={{ color: `${GOLD} 0.4)` }}>New Deck</span>
              </button>

              {/* Deck cards */}
              {filteredDecks.map((deck) => {
                const avatarUrl = getAvatarImageUrl(deck, sorceryCards);
                const isConfirming = confirmDeleteId === deck.id;

                return (
                  <div key={deck.id} className="group cursor-pointer" onClick={() => onOpenDeck(deck.id)}>
                    <div
                      className="relative overflow-hidden transition-all duration-200 hover:scale-[1.03]"
                      style={{
                        aspectRatio: '63 / 88',
                        background: '#0c0a08',
                        borderRadius: '8px',
                        border: `1px solid ${GOLD} 0.18)`,
                        boxShadow: `0 4px 16px rgba(0,0,0,0.4)`,
                      }}
                    >
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={deck.name} className="w-full h-full object-cover object-top" draggable={false} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center" style={{ background: `${GOLD} 0.03)` }}>
                          <span className="text-3xl" style={{ color: `${GOLD} 0.12)` }}>&#9830;</span>
                        </div>
                      )}

                      {/* Bottom info */}
                      <div className="absolute inset-x-0 bottom-0 p-2.5 pt-10" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.5) 55%, transparent 100%)' }}>
                        <div className="arena-heading text-[11px] font-bold truncate" style={{ color: TEXT_PRIMARY }}>{deck.name}</div>
                        <div className="text-[9px] mt-0.5" style={{ color: TEXT_MUTED }}>{deck.cardCount ?? 0} cards</div>
                      </div>

                      {/* Hover border glow */}
                      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-[8px]" style={{ boxShadow: `inset 0 0 0 1px ${GOLD} 0.3), 0 0 16px ${GOLD} 0.08)` }} />

                      {/* Hover actions */}
                      <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <button
                          type="button"
                          className="w-5 h-5 flex items-center justify-center rounded-full"
                          style={{ background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(180,60,60,0.4)', color: '#c45050', fontSize: '10px' }}
                          title="Delete deck"
                          data-sound={UI.CANCEL}
                          onClick={(e) => { e.stopPropagation(); this.setState({ confirmDeleteId: deck.id }); }}
                        >✕</button>
                      </div>

                      {isConfirming ? (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 p-3" style={{ background: 'rgba(0,0,0,0.9)', borderRadius: '8px' }} onClick={(e) => e.stopPropagation()}>
                          <span className="text-[11px] font-semibold" style={{ color: TEXT_PRIMARY }}>Delete this deck?</span>
                          <span className="text-[9px] text-center leading-tight" style={{ color: TEXT_MUTED }}>"{deck.name}"</span>
                          <div className="flex gap-2 mt-1.5">
                            <button type="button" className="px-2.5 py-1 text-[9px] font-bold rounded" style={{ background: 'rgba(180,60,60,0.6)', border: '1px solid rgba(180,60,60,0.5)', color: '#fdd' }} data-sound={UI.CANCEL} onClick={(e) => { e.stopPropagation(); onDeleteDeck(deck.id); this.setState({ confirmDeleteId: null }); }}>Delete</button>
                            <button type="button" className="px-2.5 py-1 text-[9px] rounded" style={{ ...BEVELED_BTN, color: TEXT_BODY }} data-sound={UI.CANCEL} onClick={(e) => { e.stopPropagation(); this.setState({ confirmDeleteId: null }); }}>Cancel</button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Empty state */}
            {filteredDecks.length === 0 && searchQuery.trim() ? (
              <div className="flex flex-col items-center justify-center mt-16">
                <span className="text-sm" style={{ color: TEXT_MUTED }}>No decks match "{searchQuery}"</span>
              </div>
            ) : null}

            {filteredDecks.length === 0 && !searchQuery.trim() ? (
              <div className="flex flex-col items-center justify-center mt-12">
                <span className="text-sm" style={{ color: TEXT_MUTED }}>No decks yet. Create your first deck to get started.</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
}
