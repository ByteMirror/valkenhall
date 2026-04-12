import { Component } from 'preact';
import { UI } from '../utils/arena/uiSounds';
import { cn } from '../lib/utils';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, PANEL_BG, ACCENT_GOLD,
  BG_ATMOSPHERE, VIGNETTE, DIALOG_STYLE, BEVELED_BTN, GOLD_BTN, INPUT_STYLE,
  FourCorners, OrnamentalDivider,
  getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';

function getAvatarFromDeck(deck, sorceryCards) {
  if (!deck?.cards || !sorceryCards) return null;
  for (const entry of deck.cards) {
    const card = sorceryCards.find((c) => c.unique_id === entry.cardId);
    if (card?.type === 'Avatar') return card;
  }
  return null;
}

function getAvatarImageUrl(card) {
  return card?.printings?.[0]?.image_url || null;
}

export default class ArenaDeckSelect extends Component {
  constructor(props) {
    super(props);
    this.state = {
      selected: null,
      searchQuery: '',
      avatarFilter: null,
      viewScale: getViewportScale(),
    };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
  }

  componentWillUnmount() {
    this.unsubScale?.();
  }

  getAvailableAvatars() {
    const { decks, sorceryCards } = this.props;
    const avatarMap = new Map();
    for (const deck of decks) {
      const avatar = getAvatarFromDeck(deck, sorceryCards);
      if (avatar && !avatarMap.has(avatar.unique_id)) {
        avatarMap.set(avatar.unique_id, avatar);
      }
    }
    return Array.from(avatarMap.values());
  }

  getFilteredDecks() {
    const { decks, sorceryCards } = this.props;
    const { searchQuery, avatarFilter } = this.state;
    const q = searchQuery.toLowerCase().trim();

    return decks.filter((deck) => {
      if (q && !deck.name.toLowerCase().includes(q)) return false;
      if (avatarFilter) {
        const avatar = getAvatarFromDeck(deck, sorceryCards);
        if (!avatar || avatar.unique_id !== avatarFilter) return false;
      }
      return true;
    });
  }

  render() {
    const { decks, sorceryCards, onConfirm, onCancel } = this.props;
    const { selected, searchQuery, avatarFilter, viewScale } = this.state;

    const avatars = this.getAvailableAvatars();
    const filtered = this.getFilteredDecks();
    const selectedDeck = selected ? decks.find((d) => d.id === selected) : null;
    const selectedAvatar = selectedDeck ? getAvatarFromDeck(selectedDeck, sorceryCards) : null;
    const selectedAvatarUrl = selectedAvatar ? getAvatarImageUrl(selectedAvatar) : null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: BG_ATMOSPHERE, zoom: viewScale }}>
        <div className="fixed inset-0 pointer-events-none" style={{ background: VIGNETTE }} />

        <div className="relative w-full max-w-4xl mx-4 flex flex-col" style={{ ...DIALOG_STYLE, height: 'min(640px, calc(100vh - 80px))' }}>
          <FourCorners radius={12} />

          {/* Header */}
          <div className="px-6 pt-6 pb-4 shrink-0" style={{ borderBottom: `1px solid ${GOLD} 0.12)` }}>
            <h1 className="text-2xl font-bold arena-heading text-center mb-1" style={{ color: TEXT_PRIMARY, textShadow: '0 2px 4px rgba(0,0,0,0.5), 0 0 20px rgba(200,160,60,0.1)' }}>Choose Your Deck</h1>
            <p className="text-center text-sm" style={{ color: TEXT_MUTED }}>Select a deck for ranked play. You won't be able to change it during the match.</p>
          </div>

          {/* Toolbar: search + avatar filter */}
          {decks.length > 0 ? (
            <div className="px-6 py-3 shrink-0 flex items-center gap-3" style={{ borderBottom: `1px solid ${GOLD} 0.08)` }}>
              {/* Search */}
              <div className="relative flex-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: `${GOLD} 0.25)` }}>
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                </svg>
                <input
                  type="text"
                  placeholder="Search decks..."
                  value={searchQuery}
                  onInput={(e) => this.setState({ searchQuery: e.target.value })}
                  className="w-full pl-9 pr-3 py-2 text-sm outline-none"
                  style={{ ...INPUT_STYLE, borderRadius: '6px', color: TEXT_PRIMARY }}
                />
              </div>

              {/* Avatar filter chips */}
              {avatars.length > 1 ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[9px] uppercase tracking-widest font-semibold mr-1" style={{ color: `${GOLD} 0.35)` }}>Avatar</span>
                  {/* "All" chip */}
                  <button
                    type="button"
                    className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-all cursor-pointer"
                    style={!avatarFilter
                      ? { color: TEXT_PRIMARY, background: `${GOLD} 0.12)`, border: `1px solid ${GOLD} 0.3)`, borderRadius: '4px' }
                      : { color: TEXT_MUTED, background: 'transparent', border: `1px solid ${GOLD} 0.08)`, borderRadius: '4px' }
                    }
                    onClick={() => this.setState({ avatarFilter: null })}
                  >
                    All
                  </button>
                  {avatars.map((avatar) => {
                    const imgUrl = getAvatarImageUrl(avatar);
                    const isActive = avatarFilter === avatar.unique_id;
                    return (
                      <button
                        key={avatar.unique_id}
                        type="button"
                        className="flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium transition-all cursor-pointer"
                        style={isActive
                          ? { color: TEXT_PRIMARY, background: `${GOLD} 0.12)`, border: `1px solid ${GOLD} 0.3)`, borderRadius: '4px' }
                          : { color: TEXT_MUTED, background: 'transparent', border: `1px solid ${GOLD} 0.08)`, borderRadius: '4px' }
                        }
                        onClick={() => this.setState({ avatarFilter: isActive ? null : avatar.unique_id })}
                        title={avatar.name}
                      >
                        {imgUrl ? (
                          <img src={imgUrl} alt="" className="w-5 h-5 rounded object-cover object-top" />
                        ) : null}
                        <span className="truncate max-w-[60px]">{avatar.name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Deck grid */}
          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
            {decks.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-sm" style={{ color: TEXT_MUTED }}>You don't have any decks. Build one first in the Deck Builder.</div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-sm" style={{ color: TEXT_MUTED }}>No decks match your search.</div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {filtered.map((deck) => {
                  const avatar = getAvatarFromDeck(deck, sorceryCards);
                  const avatarUrl = avatar ? getAvatarImageUrl(avatar) : null;
                  const isSelected = selected === deck.id;
                  const cardCount = deck.cards?.length || 0;

                  return (
                    <button
                      key={deck.id}
                      type="button"
                      className="relative flex items-center gap-4 p-3 text-left cursor-pointer transition-all"
                      style={isSelected
                        ? { background: `${GOLD} 0.1)`, border: `2px solid ${ACCENT_GOLD}`, borderRadius: '8px', boxShadow: `0 0 20px ${GOLD} 0.15), inset 0 1px 0 ${GOLD} 0.1)` }
                        : { background: PANEL_BG, border: `1px solid ${GOLD} 0.15)`, borderRadius: '8px' }
                      }
                      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.borderColor = `${GOLD} 0.35)`; }}
                      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.borderColor = `${GOLD} 0.15)`; }}
                      onClick={() => this.setState({ selected: deck.id })}
                    >
                      <FourCorners color={isSelected ? ACCENT_GOLD : `${GOLD} 0.3)`} />

                      {/* Avatar thumbnail */}
                      <div className="shrink-0">
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt={avatar?.name || ''}
                            className="w-16 h-16 rounded-lg object-cover object-top"
                            style={{ border: `1px solid ${isSelected ? ACCENT_GOLD : `${GOLD} 0.2)`}`, boxShadow: isSelected ? `0 0 12px ${GOLD} 0.2)` : 'none' }}
                          />
                        ) : deck.previewUrl ? (
                          <img
                            src={deck.previewUrl}
                            alt=""
                            className="w-16 h-16 rounded-lg object-cover object-left"
                            style={{ border: `1px solid ${GOLD} 0.2)` }}
                          />
                        ) : (
                          <div
                            className="w-16 h-16 rounded-lg flex items-center justify-center text-lg"
                            style={{ background: `${GOLD} 0.06)`, border: `1px solid ${GOLD} 0.15)`, color: `${GOLD} 0.25)` }}
                          >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <rect x="3" y="2" width="18" height="20" rx="3"/><path d="M7 8h10M7 12h6" strokeLinecap="round"/>
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* Deck info */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold truncate arena-heading" style={{ color: isSelected ? TEXT_PRIMARY : TEXT_BODY }}>{deck.name}</div>
                        <div className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>{cardCount} cards</div>
                        {avatar ? (
                          <div className="text-[10px] mt-1" style={{ color: `${GOLD} 0.4)` }}>{avatar.name}</div>
                        ) : null}
                      </div>

                      {/* Selected indicator */}
                      {isSelected ? (
                        <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: ACCENT_GOLD }}>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3.5 7l2.5 2.5 4.5-5" stroke="#1a1408" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <OrnamentalDivider />

          {/* Selected deck preview + actions */}
          <div className="px-6 py-4 shrink-0 flex items-center gap-4">
            {/* Selected deck info */}
            <div className="flex-1 min-w-0">
              {selectedDeck ? (
                <div className="flex items-center gap-3">
                  {selectedAvatarUrl ? (
                    <img src={selectedAvatarUrl} alt="" className="w-10 h-10 rounded-lg object-cover object-top" style={{ border: `1px solid ${GOLD} 0.3)` }} />
                  ) : null}
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate" style={{ color: TEXT_PRIMARY }}>{selectedDeck.name}</div>
                    <div className="text-[10px]" style={{ color: TEXT_MUTED }}>{selectedDeck.cards?.length || 0} cards{selectedAvatar ? ` · ${selectedAvatar.name}` : ''}</div>
                  </div>
                </div>
              ) : (
                <div className="text-sm" style={{ color: TEXT_MUTED }}>No deck selected</div>
              )}
            </div>

            {/* Actions */}
            <button
              type="button"
              className="px-6 py-2.5 text-sm cursor-pointer transition-all"
              style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.5)`; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.3)`; }}
              data-sound={UI.CANCEL}
              onClick={onCancel}
            >
              Cancel
            </button>
            {decks.length > 0 ? (
              <button
                type="button"
                disabled={!selected}
                data-sound={UI.CONFIRM}
                className="px-8 py-2.5 text-sm font-semibold arena-heading cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={selected ? GOLD_BTN : { ...BEVELED_BTN, color: TEXT_MUTED, borderRadius: '6px' }}
                onMouseEnter={(e) => { if (selected) { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 0 30px rgba(212,168,67,0.3), inset 0 1px 0 rgba(255,255,255,0.2)'; } }}
                onMouseLeave={(e) => { if (selected) { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = GOLD_BTN.boxShadow; } }}
                onClick={() => onConfirm(selected)}
              >
                Find Match
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
}
