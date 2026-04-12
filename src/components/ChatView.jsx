import { Component, createRef } from 'preact';
import { fetchMessages, sendChatMessage, claimChatMessage, markChatRead } from '../utils/arena/chatApi';
import { CoinIcon } from './ui/icons';
import RuneSpinner from './RuneSpinner';
import { playUI, UI } from '../utils/arena/uiSounds';
import CardInspector from './CardInspector';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD, COIN_COLOR,
  PANEL_BG, GOLD_BTN, BEVELED_BTN, INPUT_STYLE, DANGER_BTN,
} from '../lib/medievalTheme';
import { resolveAvatarUrl } from '../utils/arena/avatarUtils';

const SENT_BUBBLE = {
  background: 'rgba(180, 140, 60, 0.06)',
  border: `1px solid ${GOLD} 0.18)`,
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
};
const RECV_BUBBLE = {
  background: 'rgba(255, 255, 255, 0.03)',
  border: '1px solid rgba(255, 255, 255, 0.07)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
};

function resolveCardImage(cardId, sorceryCards) {
  if (!cardId || !Array.isArray(sorceryCards)) return null;
  for (const card of sorceryCards) {
    if (card.unique_id === cardId) {
      const printing = card.printings?.[0];
      if (printing?.image_url) return printing.image_url;
    }
  }
  return null;
}

function resolveCardName(cardId, sorceryCards) {
  if (!cardId || !Array.isArray(sorceryCards)) return cardId;
  for (const card of sorceryCards) {
    if (card.unique_id === cardId) return card.name || cardId;
  }
  return cardId;
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default class ChatView extends Component {
  constructor(props) {
    super(props);
    this.state = {
      messages: [],
      loading: true,
      loadingOlder: false,
      hasOlder: true,
      inputText: '',
      sending: false,
      // Attachment state
      showAttachMenu: false,
      showGoldInput: false,
      attachCards: [],   // [{ cardId, foiling }]
      attachCoins: 0,
      hoveredCard: null,
      inspectedCard: null,
      selectedCards: {}, // { messageId: Set<cardIndex> }
    };
    this.scrollRef = createRef();
    this.bottomRef = createRef();
  }

  componentDidMount() {
    window.addEventListener('keydown', this.handleInspectorKey);
    this.loadMessages();
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this.handleInspectorKey);
  }

  handleInspectorKey = (e) => {
    if (e.repeat) return;
    const tag = e.target?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.key === ' ' || e.code === 'Space') {
      if (this.state.inspectedCard) {
        e.preventDefault();
        playUI(UI.INSPECTOR_CLOSE);
        this.setState({ inspectedCard: null });
      } else if (this.state.hoveredCard) {
        e.preventDefault();
        playUI(UI.INSPECTOR_OPEN);
        this.setState({ inspectedCard: this.state.hoveredCard });
      }
    }
    if (e.key === 'Escape' && this.state.inspectedCard) {
      playUI(UI.INSPECTOR_CLOSE);
      this.setState({ inspectedCard: null });
    }
  };

  componentDidUpdate(prevProps) {
    if (prevProps.friendId !== this.props.friendId) {
      this.setState({ messages: [], loading: true, hasOlder: true, inputText: '', attachCards: [], attachCoins: 0, showAttachMenu: false, showGoldInput: false });
      this.loadMessages();
    }
  }

  loadMessages = async () => {
    try {
      const messages = await fetchMessages(this.props.friendId);
      this.setState({ messages: messages.reverse(), loading: false }, () => {
        this.scrollToBottom();
        this.markAsRead();
      });
    } catch (err) {
      console.error('[ChatView] Failed to load messages:', err);
      this.setState({ loading: false });
    }
  };

  loadOlderMessages = async () => {
    const { messages, loadingOlder, hasOlder } = this.state;
    if (loadingOlder || !hasOlder || messages.length === 0) return;
    this.setState({ loadingOlder: true });
    try {
      const older = await fetchMessages(this.props.friendId, { before: messages[0].id });
      if (older.length === 0) {
        this.setState({ hasOlder: false, loadingOlder: false });
        return;
      }
      this.setState((s) => ({
        messages: [...older.reverse(), ...s.messages],
        loadingOlder: false,
        hasOlder: older.length >= 50,
      }));
    } catch {
      this.setState({ loadingOlder: false });
    }
  };

  markAsRead = () => {
    const { messages } = this.state;
    if (messages.length === 0) return;
    const lastId = messages[messages.length - 1].id;
    markChatRead(this.props.friendId, lastId).catch(() => {});
  };

  scrollToBottom = () => {
    const container = this.scrollRef.current;
    if (container) container.scrollTop = container.scrollHeight;
  };

  handleScroll = (e) => {
    if (e.target.scrollTop < 60) this.loadOlderMessages();
  };

  handleSend = async () => {
    const { inputText, sending, attachCards, attachCoins } = this.state;
    const text = inputText.trim();
    const hasAttachments = attachCards.length > 0 || attachCoins > 0;
    if ((!text && !hasAttachments) || sending) return;

    // Aggregate cards by cardId+foiling
    const cardMap = new Map();
    for (const entry of attachCards) {
      const key = `${entry.cardId}:${entry.foiling}`;
      const existing = cardMap.get(key);
      if (existing) existing.quantity++;
      else cardMap.set(key, { cardId: entry.cardId, foiling: entry.foiling, quantity: 1 });
    }
    const cards = [...cardMap.values()];

    const optimistic = {
      id: `pending-${Date.now()}`,
      senderId: this.props.profile?.id,
      recipientId: this.props.friendId,
      type: hasAttachments ? 'attachment' : 'text',
      body: text || null,
      attachedCards: cards,
      attachedCoins: attachCoins,
      claimed: false,
      metadata: null,
      createdAt: new Date().toISOString(),
      _pending: true,
    };

    this.setState(
      (s) => ({
        messages: [...s.messages, optimistic],
        inputText: '',
        attachCards: [],
        attachCoins: 0,
        showAttachMenu: false,
        showGoldInput: false,
        sending: true,
      }),
      this.scrollToBottom
    );

    try {
      const msg = await sendChatMessage(this.props.friendId, {
        body: text || undefined,
        cards: cards.length > 0 ? cards : undefined,
        coins: attachCoins > 0 ? attachCoins : undefined,
      });
      this.setState((s) => ({
        messages: s.messages.map((m) => (m.id === optimistic.id ? msg : m)),
        sending: false,
      }));
      if (hasAttachments && this.props.onProfileReload) this.props.onProfileReload();
    } catch (err) {
      this.setState((s) => ({
        messages: s.messages.map((m) =>
          m.id === optimistic.id ? { ...m, _error: err.message || 'Failed to send' } : m
        ),
        sending: false,
      }));
    }
  };

  handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.handleSend();
    }
  };

  handleClaim = async (messageId, selectedIndices = null) => {
    try {
      await claimChatMessage(messageId, selectedIndices);
      this.setState((s) => ({
        messages: s.messages.map((m) => {
          if (m.id !== messageId) return m;
          if (!selectedIndices) return { ...m, claimed: true };
          // Partial claim — remove selected cards from the message
          const remaining = (m.attachedCards || []).filter((_, idx) => !selectedIndices.includes(idx));
          return {
            ...m,
            attachedCards: remaining,
            attachedCoins: 0, // coins always claimed
            claimed: remaining.length === 0,
          };
        }),
      }));
      if (this.props.onProfileReload) this.props.onProfileReload();
    } catch (err) {
      console.error('[ChatView] Claim failed:', err);
    }
  };

  toggleCardSelection = (messageId, cardIndex) => {
    this.setState((s) => {
      const key = `${messageId}`;
      const current = s.selectedCards?.[key] || new Set();
      const next = new Set(current);
      if (next.has(cardIndex)) next.delete(cardIndex);
      else next.add(cardIndex);
      return { selectedCards: { ...s.selectedCards, [key]: next } };
    });
  };

  receiveMessage = (msg) => {
    this.setState(
      (s) => ({ messages: [...s.messages, msg] }),
      () => { this.scrollToBottom(); this.markAsRead(); }
    );
  };

  handleClaimed = (data) => {
    this.setState((s) => ({
      messages: s.messages.map((m) => (m.id === data.messageId ? { ...m, claimed: true } : m)),
    }));
  };

  addCard = (cardId, foiling) => {
    this.setState((s) => {
      if (s.attachCards.length >= 10) return null;
      return { attachCards: [...s.attachCards, { cardId, foiling: foiling || 'S' }] };
    });
  };

  removeCard = (index) => {
    this.setState((s) => {
      const next = [...s.attachCards];
      next.splice(index, 1);
      return { attachCards: next };
    });
  };

  renderMessage = (msg) => {
    const isMine = msg.senderId === this.props.profile?.id;
    const hasCards = Array.isArray(msg.attachedCards) && msg.attachedCards.length > 0;
    const hasCoins = (msg.attachedCoins || 0) > 0;
    const hasAttachments = hasCards || hasCoins;
    const canClaim = !isMine && hasAttachments && !msg.claimed;
    const isDraftInvite = msg.type === 'draft-invite';
    const sorceryCards = this.props.sorceryCards;

    return (
      <div
        key={msg.id}
        className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-2`}
      >
        <div
          className="max-w-[75%] rounded-xl px-3 py-2"
          style={{
            ...(isMine ? SENT_BUBBLE : RECV_BUBBLE),
            opacity: msg._pending ? 0.6 : 1,
          }}
        >
          {msg.body && (
            <div className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: TEXT_BODY }}>
              {msg.body}
            </div>
          )}

          {hasCards && (() => {
            const selected = this.state.selectedCards?.[msg.id] || new Set();
            const isCollected = msg.claimed;
            return (
              <>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {msg.attachedCards.map((card, i) => {
                    const imgUrl = resolveCardImage(card.cardId, sorceryCards);
                    const name = resolveCardName(card.cardId, sorceryCards);
                    const isSelected = selected.has(i);
                    return (
                      <div
                        key={`${card.cardId}-${i}`}
                        className="relative rounded-lg overflow-hidden cursor-pointer transition-all hover:scale-[1.03]"
                        style={{
                          width: 68,
                          border: isSelected ? `2px solid ${ACCENT_GOLD}` : `1.5px solid ${isCollected ? 'rgba(255,255,255,0.06)' : `${GOLD} 0.2)`}`,
                          boxShadow: isSelected ? `0 0 10px rgba(212,168,67,0.3)` : isCollected ? 'none' : '0 2px 8px rgba(0,0,0,0.3)',
                          opacity: isCollected ? 0.35 : 1,
                        }}
                        title={`${name}${card.quantity > 1 ? ` x${card.quantity}` : ''}`}
                        onClick={() => { if (canClaim) this.toggleCardSelection(msg.id, i); }}
                        onMouseEnter={() => {
                          const fullCard = sorceryCards?.find(c => c.unique_id === card.cardId);
                          if (fullCard) this.setState({ hoveredCard: { card: fullCard, printing: fullCard.printings?.[0], rarity: fullCard.rarity } });
                        }}
                        onMouseLeave={() => this.setState({ hoveredCard: null })}
                      >
                        {imgUrl ? (
                          <img src={imgUrl} alt={name} className="w-full aspect-[63/88] object-cover" draggable={false} />
                        ) : (
                          <div className="w-full aspect-[63/88] flex items-center justify-center text-[8px] text-center px-0.5" style={{ background: `${GOLD} 0.04)`, color: TEXT_MUTED }}>
                            {name}
                          </div>
                        )}
                        {card.quantity > 1 && (
                          <div className="absolute top-0.5 right-0.5 text-[9px] font-bold px-1 rounded" style={{ background: 'rgba(0,0,0,0.75)', color: TEXT_PRIMARY }}>
                            x{card.quantity}
                          </div>
                        )}
                        {isSelected && (
                          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
                            <span style={{ color: ACCENT_GOLD, fontSize: 16 }}>&#x2714;</span>
                          </div>
                        )}
                        {isCollected && (
                          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
                            <span style={{ color: TEXT_MUTED, fontSize: 14 }}>&#x2714;</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {canClaim && selected.size > 0 && (
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      className="px-3 py-1.5 text-[10px] font-semibold rounded-lg cursor-pointer transition-all"
                      style={{ ...GOLD_BTN, borderRadius: '6px' }}
                      data-sound={UI.CONFIRM}
                      onClick={() => this.handleClaim(msg.id, [...selected])}
                    >
                      Collect {selected.size === msg.attachedCards.length ? 'All' : `${selected.size} Card${selected.size > 1 ? 's' : ''}`}
                    </button>
                    <button
                      type="button"
                      className="px-2 py-1.5 text-[10px] cursor-pointer rounded-lg"
                      style={{ color: TEXT_MUTED }}
                      onClick={() => this.setState((s) => ({ selectedCards: { ...s.selectedCards, [msg.id]: new Set() } }))}
                    >
                      Clear
                    </button>
                  </div>
                )}
                {canClaim && selected.size === 0 && (
                  <div className="text-[9px] mt-1.5" style={{ color: TEXT_MUTED }}>
                    Tap cards to select, then collect
                  </div>
                )}
              </>
            );
          })()}

          {hasCoins && (
            <div className="flex items-center gap-1 mt-1.5">
              <CoinIcon size={12} />
              <span className="text-[11px] font-medium" style={{ color: COIN_COLOR, opacity: msg.claimed ? 0.35 : 1 }}>
                {msg.attachedCoins} {msg.claimed ? '(collected)' : ''}
              </span>
            </div>
          )}

          {hasAttachments && msg.claimed && (
            <div className="text-[9px] mt-1.5 flex items-center gap-1" style={{ color: TEXT_MUTED }}>
              <span style={{ color: ACCENT_GOLD }}>&#x2714;</span> Collected
            </div>
          )}

          {isDraftInvite && msg.metadata && (
            <div
              className="mt-1.5 rounded-lg px-2.5 py-2"
              style={{ background: `${GOLD} 0.06)`, border: `1px solid ${GOLD} 0.12)` }}
            >
              <div className="text-[10px] font-semibold" style={{ color: ACCENT_GOLD }}>
                Draft Invite
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: TEXT_BODY }}>
                {msg.metadata.setLabel || 'Draft'} — {msg.metadata.podSize || '?'} players
              </div>
              {msg.metadata.scheduledAt && (
                <div className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>
                  {new Date(msg.metadata.scheduledAt).toLocaleString()}
                </div>
              )}
            </div>
          )}

          {msg._error && (
            <div className="text-[10px] mt-1" style={{ color: '#e89090' }}>Failed to send</div>
          )}

          <div className="text-[9px] mt-1" style={{ color: TEXT_MUTED, textAlign: isMine ? 'right' : 'left' }}>
            {formatTime(msg.createdAt)}
          </div>
        </div>
      </div>
    );
  };

  renderAttachMenu() {
    return (
      <div
        className="absolute bottom-full left-2.5 mb-2 rounded-xl overflow-hidden z-20"
        style={{
          background: 'rgba(18, 14, 10, 0.98)',
          border: `1px solid ${GOLD} 0.2)`,
          boxShadow: '0 -8px 24px rgba(0,0,0,0.5)',
          minWidth: 160,
        }}
      >
        <button
          type="button"
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs cursor-pointer transition-all hover:bg-white/5"
          style={{ color: TEXT_PRIMARY }}
          onClick={() => {
            this.setState({ showAttachMenu: false });
            this.props.onOpenCardPicker?.();
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 15l6-6 4 4 4-4 4 4" />
          </svg>
          Send Cards
        </button>
        <button
          type="button"
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs cursor-pointer transition-all hover:bg-white/5"
          style={{ color: COIN_COLOR }}
          onClick={() => this.setState({ showAttachMenu: false, showGoldInput: true })}
        >
          <CoinIcon size={15} />
          Send Gold
        </button>
      </div>
    );
  }

  renderGoldInput() {
    const maxCoins = this.props.profile?.coins || 0;
    const { attachCoins } = this.state;
    return (
      <div className="shrink-0 px-2.5 py-1.5 flex items-center gap-2">
        <CoinIcon size={14} />
        <input
          type="number"
          min={0}
          max={maxCoins}
          value={attachCoins || ''}
          placeholder="Enter amount"
          className="flex-1 px-3 py-1.5 text-xs rounded-full leading-5 outline-none"
          style={{
            background: 'rgba(212,168,67,0.06)',
            border: `1px solid ${GOLD} 0.2)`,
            borderRadius: '20px',
            color: COIN_COLOR,
            height: '32px',
          }}
          onInput={(e) => {
            const val = Math.max(0, Math.min(maxCoins, parseInt(e.target.value, 10) || 0));
            this.setState({ attachCoins: val });
          }}
        />
        <span className="text-[10px] shrink-0" style={{ color: TEXT_MUTED }}>/ {maxCoins}</span>
        <button
          type="button"
          className="w-6 h-6 rounded-full flex items-center justify-center cursor-pointer shrink-0"
          style={{ color: TEXT_MUTED, background: 'rgba(255,255,255,0.04)' }}
          onClick={() => this.setState({ showGoldInput: false, attachCoins: 0 })}
        >
          <svg width="10" height="10" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
      </div>
    );
  }

  render() {
    const { friendName, friendAvatar, online, onBack, sorceryCards } = this.props;
    const avatarUrl = resolveAvatarUrl({ profileAvatar: friendAvatar }, sorceryCards);
    const { messages, loading, loadingOlder, inputText, showAttachMenu, showGoldInput, attachCards, attachCoins } = this.state;
    const hasAttachments = attachCards.length > 0 || attachCoins > 0;
    const canSend = inputText.trim() || hasAttachments;

    return (
      <div className="flex flex-col h-full">
        {/* Header — clean, no separator */}
        <div className="flex items-center gap-2.5 px-3 py-2 shrink-0">
          <button
            type="button"
            className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-all hover:bg-white/5"
            style={{ color: TEXT_MUTED }}
            data-sound={UI.CANCEL}
            onClick={onBack}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="relative">
            {avatarUrl ? (
              <img src={avatarUrl} alt={friendName} className="w-8 h-8 rounded-full object-cover object-top" style={{ border: `1px solid ${GOLD} 0.2)` }} />
            ) : (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: `${GOLD} 0.1)`, border: `1px solid ${GOLD} 0.2)`, color: TEXT_PRIMARY }}
              >
                {(friendName || '?')[0].toUpperCase()}
              </div>
            )}
            {online && (
              <div
                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                style={{ background: '#4ade80', border: '2px solid #0e0a06' }}
              />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold" style={{ color: TEXT_PRIMARY }}>{friendName}</div>
            <div className="text-[9px]" style={{ color: online ? '#4ade80' : TEXT_MUTED }}>
              {online ? 'Online' : 'Offline'}
            </div>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={this.scrollRef}
          className="flex-1 overflow-y-auto px-3 py-2 min-h-0"
          onScroll={this.handleScroll}
        >
          {loadingOlder && (
            <div className="flex justify-center py-2"><RuneSpinner size={16} /></div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-12"><RuneSpinner size={28} /></div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-xs" style={{ color: TEXT_MUTED }}>No messages yet</p>
              <p className="text-[10px] mt-1" style={{ color: TEXT_MUTED }}>Say hello to {friendName}!</p>
            </div>
          ) : (
            messages.map((msg) => this.renderMessage(msg))
          )}
          <div ref={this.bottomRef} />
        </div>

        {/* Attachment preview — floating above input, overlapping chat */}
        {hasAttachments && (
          <div className="relative shrink-0" style={{ zIndex: 5 }}>
            <div
              className="absolute bottom-0 left-0 right-0 px-3 pb-2 pt-3 flex gap-2.5 overflow-x-auto"
              style={{ scrollbarWidth: 'none' }}
            >
              {attachCards.map((card, i) => {
                const imgUrl = resolveCardImage(card.cardId, this.props.sorceryCards);
                const name = resolveCardName(card.cardId, this.props.sorceryCards);
                return (
                  <div key={i} className="relative shrink-0">
                    <div
                      className="rounded-xl"
                      style={{ overflow: 'hidden' }}
                      style={{
                        width: 72,
                        height: Math.round(72 * 88 / 63),
                        border: `1.5px solid ${GOLD} 0.3)`,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)',
                      }}
                    >
                      {imgUrl ? (
                        <img src={imgUrl} alt={name} className="w-full h-full object-cover" draggable={false} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[8px] text-center px-1" style={{ background: `${GOLD} 0.06)`, color: TEXT_MUTED }}>{name}</div>
                      )}
                    </div>
                    <button
                      type="button"
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center cursor-pointer"
                      style={{ background: '#b04040', color: '#fff', fontSize: 11, fontWeight: 700, border: '2px solid #0e0a06' }}
                      onClick={() => this.removeCard(i)}
                    >
                      &times;
                    </button>
                  </div>
                );
              })}
              {attachCoins > 0 && (
                <div className="flex items-center gap-1.5 px-3 rounded-xl shrink-0 self-end" style={{ height: 36, background: `${GOLD} 0.1)`, border: `1.5px solid ${GOLD} 0.25)`, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
                  <CoinIcon size={16} />
                  <span className="text-sm font-bold" style={{ color: COIN_COLOR }}>{attachCoins}</span>
                </div>
              )}
            </div>
            {/* Spacer to push input bar down — half the card height so cards overlap chat */}
            <div style={{ height: Math.round(72 * 88 / 63) / 2 + 16 }} />
          </div>
        )}

        {/* Gold amount input */}
        {showGoldInput && this.renderGoldInput()}

        {/* Input bar — all elements aligned on one line */}
        <div className="shrink-0 px-2.5 py-2 flex items-center gap-2 relative">
          {/* Popover menu */}
          {showAttachMenu && this.renderAttachMenu()}
          {/* Backdrop to close menu */}
          {showAttachMenu && <div className="fixed inset-0 z-10" onClick={() => this.setState({ showAttachMenu: false })} />}

          {/* Plus button (circular) */}
          <button
            type="button"
            className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all shrink-0 relative z-20"
            style={{
              background: showAttachMenu ? `${GOLD} 0.15)` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${showAttachMenu ? ACCENT_GOLD : 'rgba(255,255,255,0.08)'}`,
              color: showAttachMenu ? ACCENT_GOLD : TEXT_MUTED,
            }}
            title="Attach cards or coins"
            onClick={() => this.setState((s) => ({ showAttachMenu: !s.showAttachMenu, showGoldInput: false }))}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>

          {/* Input field */}
          <textarea
            className="flex-1 px-3 py-1.5 text-xs rounded-full resize-none leading-5"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '20px',
              color: TEXT_BODY,
              maxHeight: '80px',
              minHeight: '32px',
              height: '32px',
              outline: 'none',
            }}
            placeholder="Type a message..."
            maxLength={500}
            rows={1}
            value={inputText}
            onInput={(e) => {
              this.setState({ inputText: e.target.value });
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px';
            }}
            onKeyDown={this.handleKeyDown}
          />

          {/* Send button (circular) */}
          <button
            type="button"
            className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all shrink-0"
            style={{
              background: canSend ? `linear-gradient(180deg, rgba(212,168,67,0.9) 0%, rgba(160,120,40,0.9) 100%)` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${canSend ? 'rgba(212,168,67,0.5)' : 'rgba(255,255,255,0.08)'}`,
              color: canSend ? '#0e0a06' : TEXT_MUTED,
              opacity: canSend ? 1 : 0.5,
            }}
            data-sound={UI.CONFIRM}
            disabled={!canSend}
            onClick={this.handleSend}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>

        {/* Card Inspector */}
        {this.state.inspectedCard && (
          <CardInspector
            card={this.state.inspectedCard.card}
            imageUrl={this.state.inspectedCard.printing?.image_url}
            rarity={this.state.inspectedCard.rarity}
            foiling={this.state.inspectedCard.printing?.foiling}
            onClose={() => { playUI(UI.INSPECTOR_CLOSE); this.setState({ inspectedCard: null }); }}
          />
        )}
      </div>
    );
  }
}
