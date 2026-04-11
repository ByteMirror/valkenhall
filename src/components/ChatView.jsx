import { Component, createRef } from 'preact';
import { fetchMessages, sendChatMessage, claimChatMessage, markChatRead } from '../utils/arena/chatApi';
import { CoinIcon } from './ui/icons';
import RuneSpinner from './RuneSpinner';
import { UI } from '../utils/arena/uiSounds';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD, COIN_COLOR,
  PANEL_BG, GOLD_BTN, BEVELED_BTN, INPUT_STYLE, DANGER_BTN,
} from '../lib/medievalTheme';

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
      showAttachPanel: false,
      attachCards: [],   // [{ cardId, foiling }]
      attachCoins: 0,
      cardSearch: '',
    };
    this.scrollRef = createRef();
    this.bottomRef = createRef();
  }

  componentDidMount() {
    this.loadMessages();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.friendId !== this.props.friendId) {
      this.setState({ messages: [], loading: true, hasOlder: true, inputText: '', attachCards: [], attachCoins: 0, showAttachPanel: false });
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
    this.bottomRef.current?.scrollIntoView({ behavior: 'auto' });
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
        showAttachPanel: false,
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

  handleClaim = async (messageId) => {
    try {
      await claimChatMessage(messageId);
      this.setState((s) => ({
        messages: s.messages.map((m) => (m.id === messageId ? { ...m, claimed: true } : m)),
      }));
      if (this.props.onProfileReload) this.props.onProfileReload();
    } catch (err) {
      console.error('[ChatView] Claim failed:', err);
    }
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

          {hasCards && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {msg.attachedCards.map((card, i) => {
                const imgUrl = resolveCardImage(card.cardId, sorceryCards);
                const name = resolveCardName(card.cardId, sorceryCards);
                return (
                  <div
                    key={`${card.cardId}-${i}`}
                    className="relative rounded overflow-hidden"
                    style={{
                      width: 44,
                      border: `1px solid ${GOLD} 0.15)`,
                      opacity: msg.claimed ? 0.4 : 1,
                    }}
                    title={`${name}${card.quantity > 1 ? ` x${card.quantity}` : ''}`}
                  >
                    {imgUrl ? (
                      <img src={imgUrl} alt={name} className="w-full aspect-[63/88] object-cover" />
                    ) : (
                      <div className="w-full aspect-[63/88] flex items-center justify-center text-[7px]" style={{ background: `${GOLD} 0.04)`, color: TEXT_MUTED }}>
                        {name}
                      </div>
                    )}
                    {card.quantity > 1 && (
                      <div className="absolute top-0 right-0 text-[8px] font-bold px-0.5" style={{ background: 'rgba(0,0,0,0.7)', color: TEXT_PRIMARY }}>
                        x{card.quantity}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {hasCoins && (
            <div className="flex items-center gap-1 mt-1.5">
              <CoinIcon size={12} />
              <span className="text-[11px] font-medium" style={{ color: COIN_COLOR, opacity: msg.claimed ? 0.4 : 1 }}>
                {msg.attachedCoins}
              </span>
            </div>
          )}

          {canClaim && (
            <button
              type="button"
              className="mt-1.5 px-2.5 py-1 text-[10px] font-semibold rounded cursor-pointer transition-all"
              style={{ ...GOLD_BTN, borderRadius: '4px' }}
              data-sound={UI.CONFIRM}
              onClick={() => this.handleClaim(msg.id)}
            >
              Collect
            </button>
          )}
          {hasAttachments && msg.claimed && (
            <div className="text-[10px] mt-1 flex items-center gap-1" style={{ color: TEXT_MUTED }}>
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

  renderAttachmentPanel() {
    const { profile, sorceryCards } = this.props;
    const { attachCards, attachCoins, cardSearch } = this.state;
    const collection = profile?.collection || [];
    const maxCoins = profile?.coins || 0;

    // Build card list from collection
    const searchLower = cardSearch.toLowerCase();
    const available = collection
      .filter((c) => c.quantity > 0)
      .map((c) => {
        const name = resolveCardName(c.cardId, sorceryCards);
        return { ...c, name };
      })
      .filter((c) => !searchLower || c.name.toLowerCase().includes(searchLower))
      .slice(0, 40);

    return (
      <div
        className="shrink-0 px-3 py-2 overflow-y-auto"
        style={{
          maxHeight: '200px',
          borderTop: `1px solid ${GOLD} 0.12)`,
          background: 'rgba(12, 10, 8, 0.95)',
        }}
      >
        {/* Coins */}
        <div className="flex items-center gap-2 mb-2">
          <CoinIcon size={14} />
          <input
            type="number"
            min={0}
            max={maxCoins}
            value={attachCoins || ''}
            placeholder="0"
            className="w-20 px-2 py-1 text-xs rounded"
            style={{ ...INPUT_STYLE, color: COIN_COLOR, backgroundColor: '#0e0a06' }}
            onInput={(e) => {
              const val = Math.max(0, Math.min(maxCoins, parseInt(e.target.value, 10) || 0));
              this.setState({ attachCoins: val });
            }}
          />
          <span className="text-[10px]" style={{ color: TEXT_MUTED }}>/ {maxCoins}</span>
        </div>

        {/* Card search */}
        <input
          type="text"
          placeholder="Search cards..."
          value={cardSearch}
          className="w-full px-2 py-1 text-xs rounded mb-2"
          style={{ ...INPUT_STYLE, color: TEXT_BODY, backgroundColor: '#0e0a06' }}
          onInput={(e) => this.setState({ cardSearch: e.target.value })}
        />

        {/* Card grid */}
        <div className="grid grid-cols-6 gap-1">
          {available.map((c, i) => {
            const imgUrl = resolveCardImage(c.cardId, sorceryCards);
            return (
              <button
                key={`${c.cardId}-${c.foiling || 'S'}-${i}`}
                type="button"
                className="relative rounded overflow-hidden cursor-pointer transition-all"
                style={{
                  border: `1px solid ${GOLD} 0.1)`,
                  opacity: attachCards.length >= 10 ? 0.4 : 1,
                }}
                title={`${c.name} (${c.quantity}x)`}
                onClick={() => this.addCard(c.cardId, c.foiling || 'S')}
                disabled={attachCards.length >= 10}
              >
                {imgUrl ? (
                  <img src={imgUrl} alt={c.name} className="w-full aspect-[63/88] object-cover" />
                ) : (
                  <div className="w-full aspect-[63/88] flex items-center justify-center text-[6px]" style={{ background: `${GOLD} 0.04)`, color: TEXT_MUTED }}>
                    {c.name}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        {available.length === 0 && (
          <div className="text-center py-2 text-[10px]" style={{ color: TEXT_MUTED }}>
            {cardSearch ? 'No matching cards' : 'No cards in collection'}
          </div>
        )}
      </div>
    );
  }

  render() {
    const { friendName, online, onBack } = this.props;
    const { messages, loading, loadingOlder, inputText, showAttachPanel, attachCards, attachCoins } = this.state;
    const hasAttachments = attachCards.length > 0 || attachCoins > 0;
    const canSend = inputText.trim() || hasAttachments;

    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 px-3 py-2.5 shrink-0" style={{ borderBottom: `1px solid ${GOLD} 0.08)` }}>
          <button
            type="button"
            className="text-[11px] cursor-pointer transition-all"
            style={{ color: TEXT_MUTED }}
            onMouseEnter={(e) => { e.currentTarget.style.color = TEXT_PRIMARY; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = TEXT_MUTED; }}
            data-sound={UI.CANCEL}
            onClick={onBack}
          >
            &larr;
          </button>
          <div className="relative">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: `${GOLD} 0.1)`, border: `1px solid ${GOLD} 0.2)`, color: TEXT_PRIMARY }}
            >
              {(friendName || '?')[0].toUpperCase()}
            </div>
            {online && (
              <div
                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                style={{ background: '#4ade80', border: '2px solid #0e0a06' }}
              />
            )}
          </div>
          <div>
            <div className="text-xs font-medium" style={{ color: TEXT_PRIMARY }}>{friendName}</div>
            <div className="text-[10px]" style={{ color: online ? '#4ade80' : TEXT_MUTED }}>
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

        {/* Attachment preview strip */}
        {hasAttachments && (
          <div className="shrink-0 px-3 py-1.5 flex items-center gap-1.5 flex-wrap" style={{ borderTop: `1px solid ${GOLD} 0.08)`, background: 'rgba(12, 10, 8, 0.6)' }}>
            {attachCards.map((card, i) => {
              const imgUrl = resolveCardImage(card.cardId, this.props.sorceryCards);
              const name = resolveCardName(card.cardId, this.props.sorceryCards);
              return (
                <div key={i} className="relative group">
                  <div
                    className="w-8 h-11 rounded overflow-hidden"
                    style={{ border: `1px solid ${GOLD} 0.2)` }}
                    title={name}
                  >
                    {imgUrl ? (
                      <img src={imgUrl} alt={name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[6px]" style={{ background: `${GOLD} 0.04)`, color: TEXT_MUTED }}>{name}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] cursor-pointer"
                    style={{ background: '#b04040', color: '#fff', border: '1px solid rgba(0,0,0,0.3)' }}
                    onClick={() => this.removeCard(i)}
                  >
                    &times;
                  </button>
                </div>
              );
            })}
            {attachCoins > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 rounded" style={{ background: `${GOLD} 0.08)`, border: `1px solid ${GOLD} 0.15)` }}>
                <CoinIcon size={10} />
                <span className="text-[10px] font-medium" style={{ color: COIN_COLOR }}>{attachCoins}</span>
              </div>
            )}
          </div>
        )}

        {/* Attachment picker panel */}
        {showAttachPanel && this.renderAttachmentPanel()}

        {/* Input bar */}
        <div
          className="shrink-0 px-3 py-2 flex items-end gap-2"
          style={{ borderTop: `1px solid ${GOLD} 0.08)` }}
        >
          {/* Attach button */}
          <button
            type="button"
            className="px-2 py-2 text-xs cursor-pointer transition-all shrink-0 rounded"
            style={{
              ...(showAttachPanel ? { background: `${GOLD} 0.12)`, border: `1px solid ${ACCENT_GOLD}`, color: ACCENT_GOLD } : { ...BEVELED_BTN, color: TEXT_MUTED }),
              borderRadius: '6px',
            }}
            title="Attach cards or coins"
            onClick={() => this.setState((s) => ({ showAttachPanel: !s.showAttachPanel }))}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          <textarea
            className="flex-1 px-3 py-2 text-xs rounded-lg resize-none"
            style={{ ...INPUT_STYLE, color: TEXT_BODY, backgroundColor: '#0e0a06', maxHeight: '80px', minHeight: '36px' }}
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
          <button
            type="button"
            className="px-3 py-2 text-xs font-semibold cursor-pointer transition-all shrink-0"
            style={{
              ...GOLD_BTN,
              borderRadius: '6px',
              opacity: canSend ? 1 : 0.4,
              pointerEvents: canSend ? 'auto' : 'none',
            }}
            data-sound={UI.CONFIRM}
            onClick={this.handleSend}
          >
            Send
          </button>
        </div>
      </div>
    );
  }
}
