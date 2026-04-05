import { Component } from 'preact';
import { fetchInbox, sendMail, claimMail, deleteMail } from '../utils/arena/mailApi';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD,
  PANEL_BG, DIALOG_STYLE, GOLD_BTN, BEVELED_BTN, DANGER_BTN, INPUT_STYLE,
  TAB_ACTIVE, TAB_INACTIVE, COIN_COLOR,
  FourCorners, OrnamentalDivider,
} from '../lib/medievalTheme';

function resolveCardImage(cardId, sorceryCards) {
  if (!cardId || !sorceryCards) return null;
  const card = sorceryCards.find(c => c.unique_id === cardId);
  return card?.printings?.[0]?.image_url || null;
}

function resolveCardName(cardId, sorceryCards) {
  if (!cardId || !sorceryCards) return cardId;
  const card = sorceryCards.find(c => c.unique_id === cardId);
  return card?.name || cardId;
}

function timeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const TAB_KEYS = [
  { key: 'friend', label: 'Friends' },
  { key: 'auction', label: 'Auction' },
  { key: 'news', label: 'News' },
];

export default class Mailbox extends Component {
  constructor(props) {
    super(props);
    this.state = {
      tab: 'friend',
      view: props.initialView === 'compose' ? 'compose' : 'list',
      mail: [],
      loading: true,
      selectedMail: null,
      claiming: false,
      sending: false,
      composeRecipient: null,
      composeSubject: '',
      composeBody: '',
      composeCards: [],
      composeCoins: 0,
      showCardPicker: false,
      error: null,
    };
  }

  componentDidMount() {
    this.loadInbox();
  }

  componentDidUpdate(prevProps) {
    if (!prevProps.open && this.props.open) {
      this.loadInbox();
    }
  }

  loadInbox = async () => {
    this.setState({ loading: true, error: null });
    try {
      const result = await fetchInbox();
      const mail = result.mail || [];
      const nextState = { mail, loading: false };

      if (this.props.selectedMailId) {
        const found = mail.find(m => m.id === this.props.selectedMailId);
        if (found) {
          nextState.selectedMail = found;
          nextState.view = 'detail';
          nextState.tab = found.type || 'friend';
        }
      }

      if (this.props.initialView === 'compose') {
        nextState.view = 'compose';
        if (this.props.composeRecipientId && this.props.friendListData?.friends) {
          const friend = this.props.friendListData.friends.find(
            f => f.id === this.props.composeRecipientId
          );
          if (friend) nextState.composeRecipient = friend;
        }
      }

      this.setState(nextState);
    } catch (err) {
      this.setState({ loading: false, error: err.message });
    }
  };

  openDetail = (mail) => {
    this.setState({ selectedMail: mail, view: 'detail' });
  };

  backToList = () => {
    this.setState({
      view: 'list',
      selectedMail: null,
      error: null,
    });
  };

  openCompose = (recipient) => {
    this.setState({
      view: 'compose',
      composeRecipient: recipient || null,
      composeSubject: '',
      composeBody: '',
      composeCards: [],
      composeCoins: 0,
      showCardPicker: false,
      error: null,
    });
  };

  openReply = (mail) => {
    const friends = this.props.friendListData?.friends || [];
    const sender = friends.find(f => f.id === mail.senderId);
    this.setState({
      view: 'compose',
      composeRecipient: sender || { id: mail.senderId, name: mail.senderName },
      composeSubject: mail.subject?.startsWith('Re: ') ? mail.subject : `Re: ${mail.subject || ''}`,
      composeBody: '',
      composeCards: [],
      composeCoins: 0,
      showCardPicker: false,
      error: null,
    });
  };

  handleClaim = async (mail) => {
    this.setState({ claiming: true, error: null });
    try {
      const result = await claimMail(mail.id);
      const updatedMail = this.state.mail.map(m =>
        m.id === mail.id ? { ...m, claimed: true } : m
      );
      const updatedSelected = { ...mail, claimed: true };
      this.setState({ mail: updatedMail, selectedMail: updatedSelected, claiming: false });

      if (this.props.onProfileUpdate) {
        const updates = {};
        if (result.newBalance != null) updates.coins = result.newBalance;
        if (result.addedCards) {
          const collection = [...(this.props.profile.collection || [])];
          for (const cardId of result.addedCards) {
            const existing = collection.find(c => c.cardId === cardId);
            if (existing) {
              existing.quantity += 1;
            } else {
              collection.push({ cardId, quantity: 1 });
            }
          }
          updates.collection = collection;
        }
        this.props.onProfileUpdate({ ...this.props.profile, ...updates });
      }
    } catch (err) {
      this.setState({ claiming: false, error: err.message });
    }
  };

  handleDelete = async (mail) => {
    this.setState({ error: null });
    try {
      await deleteMail(mail.id);
      const updatedMail = this.state.mail.filter(m => m.id !== mail.id);
      this.setState({ mail: updatedMail, view: 'list', selectedMail: null });
    } catch (err) {
      this.setState({ error: err.message });
    }
  };

  handleSend = async () => {
    const { composeRecipient, composeSubject, composeBody, composeCards, composeCoins } = this.state;
    if (!composeRecipient) return;

    this.setState({ sending: true, error: null });
    try {
      const result = await sendMail({
        recipientId: composeRecipient.id,
        subject: composeSubject,
        body: composeBody,
        cards: composeCards.length > 0 ? composeCards : undefined,
        coins: composeCoins > 0 ? composeCoins : undefined,
      });

      if (this.props.onProfileUpdate && result.newBalance != null) {
        const collection = [...(this.props.profile.collection || [])];
        for (const cardId of composeCards) {
          const existing = collection.find(c => c.cardId === cardId);
          if (existing && existing.quantity > 0) {
            existing.quantity -= 1;
          }
        }
        const filtered = collection.filter(c => c.quantity > 0);
        this.props.onProfileUpdate({
          ...this.props.profile,
          coins: result.newBalance,
          collection: filtered,
        });
      }

      this.props.onSendComplete?.();
      this.setState({ sending: false, view: 'list' });
      this.loadInbox();
    } catch (err) {
      this.setState({ sending: false, error: err.message });
    }
  };

  toggleCardInCompose = (cardId) => {
    this.setState(s => {
      const idx = s.composeCards.indexOf(cardId);
      if (idx >= 0) {
        return { composeCards: s.composeCards.filter((_, i) => i !== idx) };
      }
      if (s.composeCards.length >= 10) return null;
      return { composeCards: [...s.composeCards, cardId] };
    });
  };

  renderTabBar() {
    const { tab, view } = this.state;
    return (
      <div className="flex items-center gap-1 px-3 pt-3 pb-2">
        <div className="flex gap-1 flex-1">
          {TAB_KEYS.map(t => (
            <button
              key={t.key}
              type="button"
              className="px-3 py-1.5 text-[11px] font-medium transition-all cursor-pointer"
              style={tab === t.key ? TAB_ACTIVE : TAB_INACTIVE}
              onClick={() => this.setState({ tab: t.key, view: 'list', selectedMail: null, error: null })}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === 'friend' && view === 'list' && (
          <button
            type="button"
            className="px-2.5 py-1 text-[10px] font-semibold cursor-pointer transition-all"
            style={{ ...BEVELED_BTN, color: ACCENT_GOLD, borderRadius: '6px' }}
            onClick={() => this.openCompose()}
          >
            Compose
          </button>
        )}
      </div>
    );
  }

  renderListView() {
    const { sorceryCards } = this.props;
    const { mail, loading, tab } = this.state;

    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div
            className="w-5 h-5 rounded-full animate-spin"
            style={{ border: `2px solid ${GOLD} 0.2)`, borderTopColor: ACCENT_GOLD }}
          />
        </div>
      );
    }

    const filtered = mail.filter(m => (m.type || 'friend') === tab);

    if (filtered.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
            style={{ background: `${GOLD} 0.04)`, border: `1px solid ${GOLD} 0.1)` }}
          >
            {tab === 'friend' && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: `${GOLD} 0.2)` }}>
                <rect x="2" y="4" width="20" height="16" rx="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            {tab === 'auction' && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: `${GOLD} 0.2)` }}>
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
            {tab === 'news' && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: `${GOLD} 0.2)` }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round"/>
                <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          <div className="text-xs" style={{ color: TEXT_MUTED }}>No messages</div>
        </div>
      );
    }

    return (
      <div className="flex flex-col">
        {filtered.map(m => {
          const hasAttachments = !m.claimed && ((m.cards && m.cards.length > 0) || (m.coins && m.coins > 0));
          return (
            <button
              key={m.id}
              type="button"
              className="flex items-center gap-2.5 px-3 py-2.5 text-left transition-all cursor-pointer"
              style={{ borderBottom: `1px solid ${GOLD} 0.06)` }}
              onMouseEnter={e => { e.currentTarget.style.background = `${GOLD} 0.04)`; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              onClick={() => this.openDetail(m)}
            >
              {tab === 'friend' && (
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-medium"
                  style={{ background: `${GOLD} 0.08)`, border: `1px solid ${GOLD} 0.12)`, color: TEXT_MUTED }}
                >
                  {(m.senderName || '?')[0].toUpperCase()}
                </div>
              )}
              {tab === 'auction' && (
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${GOLD} 0.08)`, border: `1px solid ${GOLD} 0.12)` }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: COIN_COLOR }}>
                    <circle cx="12" cy="12" r="10"/><path d="M12 6v12M8 10h8M8 14h8" strokeLinecap="round"/>
                  </svg>
                </div>
              )}
              {tab === 'news' && (
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${GOLD} 0.08)`, border: `1px solid ${GOLD} 0.12)` }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: `${GOLD} 0.4)` }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium truncate" style={{ color: TEXT_PRIMARY }}>
                    {m.senderName || 'System'}
                  </span>
                  <span className="text-[10px] shrink-0" style={{ color: TEXT_MUTED }}>
                    {timeAgo(m.timestamp)}
                  </span>
                </div>
                <div className="text-[11px] truncate mt-0.5" style={{ color: TEXT_MUTED }}>
                  {m.subject || '(no subject)'}
                </div>
              </div>
              {tab === 'auction' && m.coins > 0 && (
                <span className="text-[10px] font-bold shrink-0" style={{ color: COIN_COLOR }}>
                  {m.coins}
                </span>
              )}
              {hasAttachments && (
                <div
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: ACCENT_GOLD, boxShadow: `0 0 6px ${GOLD} 0.4)` }}
                />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  renderDetailView() {
    const { sorceryCards } = this.props;
    const { selectedMail: m, claiming } = this.state;
    if (!m) return null;

    const hasAttachments = (m.cards && m.cards.length > 0) || (m.coins && m.coins > 0);
    const canClaim = !m.claimed && hasAttachments;
    const isFriend = (m.type || 'friend') === 'friend';

    return (
      <div className="flex flex-col h-full">
        <div className="px-3 pt-3 pb-2">
          <button
            type="button"
            className="text-[11px] cursor-pointer transition-all mb-2"
            style={{ color: TEXT_MUTED }}
            onMouseEnter={e => { e.currentTarget.style.color = TEXT_PRIMARY; }}
            onMouseLeave={e => { e.currentTarget.style.color = TEXT_MUTED; }}
            onClick={this.backToList}
          >
            &larr; Back
          </button>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>
                {m.senderName || 'System'}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>
                {timeAgo(m.timestamp)}
              </div>
            </div>
          </div>
          {m.subject && (
            <div className="text-xs font-medium mt-2" style={{ color: ACCENT_GOLD }}>
              {m.subject}
            </div>
          )}
        </div>

        <OrnamentalDivider className="px-3 my-1" />

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {m.body && (
            <div className="text-xs leading-relaxed whitespace-pre-wrap mb-3" style={{ color: TEXT_BODY }}>
              {m.body}
            </div>
          )}

          {m.cards && m.cards.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: `${GOLD} 0.55)` }}>
                Attached Cards
              </div>
              <div className="flex flex-wrap gap-2">
                {m.cards.map((cardId, i) => {
                  const imgUrl = resolveCardImage(cardId, sorceryCards);
                  const name = resolveCardName(cardId, sorceryCards);
                  return (
                    <div
                      key={`${cardId}-${i}`}
                      className="relative rounded-lg overflow-hidden"
                      style={{ border: `1px solid ${GOLD} 0.15)`, width: 56 }}
                    >
                      {imgUrl ? (
                        <img src={imgUrl} alt={name} className="w-full aspect-[5/7] object-cover" />
                      ) : (
                        <div className="w-full aspect-[5/7] flex items-center justify-center text-[8px]" style={{ background: `${GOLD} 0.04)`, color: TEXT_MUTED }}>
                          {name}
                        </div>
                      )}
                      <div
                        className="absolute bottom-0 left-0 right-0 text-[7px] text-center py-0.5 truncate"
                        style={{ background: 'rgba(0,0,0,0.75)', color: TEXT_BODY }}
                      >
                        {name}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {m.coins > 0 && (
            <div className="flex items-center gap-2 mb-3 px-2.5 py-2 rounded-lg" style={{ background: `${GOLD} 0.06)`, border: `1px solid ${GOLD} 0.12)` }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: COIN_COLOR }}>
                <circle cx="12" cy="12" r="10"/>
              </svg>
              <span className="text-sm font-bold" style={{ color: COIN_COLOR }}>{m.coins}</span>
              <span className="text-[10px]" style={{ color: `${GOLD} 0.5)` }}>coins</span>
            </div>
          )}
        </div>

        <div className="px-3 py-2.5 flex items-center gap-2" style={{ borderTop: `1px solid ${GOLD} 0.08)` }}>
          {canClaim && (
            <button
              type="button"
              disabled={claiming}
              className="px-4 py-1.5 text-[11px] font-semibold cursor-pointer transition-all disabled:opacity-40"
              style={GOLD_BTN}
              onClick={() => this.handleClaim(m)}
            >
              {claiming ? 'Collecting...' : 'Collect'}
            </button>
          )}
          {isFriend && (
            <button
              type="button"
              className="px-3 py-1.5 text-[11px] font-medium cursor-pointer transition-all"
              style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
              onClick={() => this.openReply(m)}
            >
              Reply
            </button>
          )}
          {m.claimed && (
            <button
              type="button"
              className="px-3 py-1.5 text-[10px] cursor-pointer transition-all ml-auto"
              style={DANGER_BTN}
              onClick={() => this.handleDelete(m)}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    );
  }

  renderComposeView() {
    const { friendListData, profile, sorceryCards } = this.props;
    const {
      composeRecipient, composeSubject, composeBody,
      composeCards, composeCoins, showCardPicker, sending,
    } = this.state;

    const friends = friendListData?.friends || [];
    const collection = profile?.collection || [];
    const canSend = composeRecipient && (composeSubject.trim() || composeBody.trim());

    return (
      <div className="flex flex-col h-full">
        <div className="px-3 pt-3 pb-2">
          <button
            type="button"
            className="text-[11px] cursor-pointer transition-all mb-2"
            style={{ color: TEXT_MUTED }}
            onMouseEnter={e => { e.currentTarget.style.color = TEXT_PRIMARY; }}
            onMouseLeave={e => { e.currentTarget.style.color = TEXT_MUTED; }}
            onClick={this.backToList}
          >
            &larr; Back
          </button>
          <div className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>
            New Message
          </div>
        </div>

        <OrnamentalDivider className="px-3 my-1" />

        <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-2.5">
          {/* Recipient */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1" style={{ color: `${GOLD} 0.55)` }}>
              To
            </label>
            {composeRecipient ? (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md" style={{ background: `${GOLD} 0.06)`, border: `1px solid ${GOLD} 0.12)` }}>
                <span className="text-xs font-medium flex-1" style={{ color: TEXT_PRIMARY }}>
                  {composeRecipient.name}
                </span>
                <button
                  type="button"
                  className="text-[10px] cursor-pointer"
                  style={{ color: TEXT_MUTED }}
                  onClick={() => this.setState({ composeRecipient: null })}
                >
                  change
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-1 max-h-[120px] overflow-y-auto rounded-md" style={{ background: 'rgba(0,0,0,0.15)', border: `1px solid ${GOLD} 0.08)` }}>
                {friends.length === 0 ? (
                  <div className="text-[11px] px-2.5 py-3 text-center" style={{ color: TEXT_MUTED }}>
                    No friends to send to
                  </div>
                ) : (
                  friends.map(f => (
                    <button
                      key={f.id}
                      type="button"
                      className="flex items-center gap-2 px-2.5 py-1.5 text-left transition-all cursor-pointer"
                      style={{ color: TEXT_BODY }}
                      onMouseEnter={e => { e.currentTarget.style.background = `${GOLD} 0.06)`; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      onClick={() => this.setState({ composeRecipient: f })}
                    >
                      <div
                        className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-medium shrink-0"
                        style={{ background: `${GOLD} 0.08)`, color: TEXT_MUTED }}
                      >
                        {(f.name || '?')[0].toUpperCase()}
                      </div>
                      <span className="text-xs truncate">{f.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Subject */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1" style={{ color: `${GOLD} 0.55)` }}>
              Subject
            </label>
            <input
              type="text"
              maxLength={100}
              value={composeSubject}
              placeholder="Subject..."
              className="w-full px-2.5 py-1.5 text-xs outline-none"
              style={{ ...INPUT_STYLE, borderRadius: '6px', color: TEXT_PRIMARY }}
              onInput={e => this.setState({ composeSubject: e.target.value })}
            />
          </div>

          {/* Body */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1" style={{ color: `${GOLD} 0.55)` }}>
              Message
            </label>
            <textarea
              maxLength={2000}
              rows={4}
              value={composeBody}
              placeholder="Write your message..."
              className="w-full px-2.5 py-1.5 text-xs outline-none resize-none"
              style={{ ...INPUT_STYLE, borderRadius: '6px', color: TEXT_PRIMARY }}
              onInput={e => this.setState({ composeBody: e.target.value })}
            />
            <div className="text-[9px] text-right mt-0.5" style={{ color: TEXT_MUTED }}>
              {composeBody.length}/2000
            </div>
          </div>

          {/* Attach Cards */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: `${GOLD} 0.55)` }}>
                Attach Cards {composeCards.length > 0 ? `(${composeCards.length}/10)` : ''}
              </label>
              <button
                type="button"
                className="text-[10px] cursor-pointer transition-all"
                style={{ color: ACCENT_GOLD }}
                onClick={() => this.setState(s => ({ showCardPicker: !s.showCardPicker }))}
              >
                {showCardPicker ? 'Hide' : 'Choose Cards'}
              </button>
            </div>
            {composeCards.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {composeCards.map((cardId, i) => {
                  const imgUrl = resolveCardImage(cardId, sorceryCards);
                  const name = resolveCardName(cardId, sorceryCards);
                  return (
                    <div
                      key={`${cardId}-${i}`}
                      className="relative rounded overflow-hidden cursor-pointer"
                      style={{ border: `1px solid ${ACCENT_GOLD}`, width: 40 }}
                      onClick={() => this.toggleCardInCompose(cardId)}
                    >
                      {imgUrl ? (
                        <img src={imgUrl} alt={name} className="w-full aspect-[5/7] object-cover" />
                      ) : (
                        <div className="w-full aspect-[5/7] flex items-center justify-center text-[6px]" style={{ background: `${GOLD} 0.08)`, color: TEXT_MUTED }}>
                          {name}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {showCardPicker && (
              <div
                className="grid grid-cols-5 gap-1 max-h-[160px] overflow-y-auto p-1.5 rounded-lg"
                style={{ background: 'rgba(0,0,0,0.2)', border: `1px solid ${GOLD} 0.08)` }}
              >
                {collection.map(entry => {
                  const imgUrl = resolveCardImage(entry.cardId, sorceryCards);
                  const name = resolveCardName(entry.cardId, sorceryCards);
                  const selectedCount = composeCards.filter(c => c === entry.cardId).length;
                  const isSelected = selectedCount > 0;
                  const canAddMore = selectedCount < entry.quantity && composeCards.length < 10;
                  return (
                    <button
                      key={entry.cardId}
                      type="button"
                      className="relative rounded overflow-hidden transition-all cursor-pointer"
                      style={isSelected
                        ? { border: `1px solid ${ACCENT_GOLD}`, boxShadow: `0 0 8px ${GOLD} 0.2)` }
                        : { border: `1px solid ${GOLD} 0.08)` }
                      }
                      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = `${GOLD} 0.25)`; }}
                      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = `${GOLD} 0.08)`; }}
                      onClick={() => {
                        if (isSelected) {
                          this.toggleCardInCompose(entry.cardId);
                        } else if (canAddMore) {
                          this.toggleCardInCompose(entry.cardId);
                        }
                      }}
                    >
                      {imgUrl ? (
                        <img src={imgUrl} alt={name} className="w-full aspect-[5/7] object-cover" />
                      ) : (
                        <div className="w-full aspect-[5/7] flex items-center justify-center text-[6px]" style={{ background: `${GOLD} 0.04)`, color: TEXT_MUTED }}>
                          {name}
                        </div>
                      )}
                      {entry.quantity > 1 && (
                        <span
                          className="absolute top-0 right-0 text-[7px] font-bold px-1 rounded-bl"
                          style={{ background: 'rgba(0,0,0,0.75)', color: TEXT_BODY }}
                        >
                          x{entry.quantity}
                        </span>
                      )}
                      {isSelected && (
                        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(212,168,67,0.25)' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ color: '#fff' }}>
                            <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
                {collection.length === 0 && (
                  <div className="col-span-5 text-[10px] py-4 text-center" style={{ color: TEXT_MUTED }}>
                    No cards in collection
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Coins */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1" style={{ color: `${GOLD} 0.55)` }}>
              Attach Coins
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max={profile?.coins || 0}
                value={composeCoins || ''}
                placeholder="0"
                className="w-24 px-2.5 py-1.5 text-xs outline-none"
                style={{ ...INPUT_STYLE, borderRadius: '6px', color: TEXT_PRIMARY }}
                onInput={e => {
                  const val = Math.max(0, Math.min(parseInt(e.target.value, 10) || 0, profile?.coins || 0));
                  this.setState({ composeCoins: val });
                }}
              />
              <span className="text-[10px]" style={{ color: TEXT_MUTED }}>
                / {profile?.coins || 0} available
              </span>
            </div>
          </div>
        </div>

        {/* Send footer */}
        <div className="px-3 py-2.5 flex items-center justify-end gap-2" style={{ borderTop: `1px solid ${GOLD} 0.08)` }}>
          {this.state.error && (
            <div className="flex-1 text-[10px] truncate" style={{ color: '#c45050' }}>
              {this.state.error}
            </div>
          )}
          <button
            type="button"
            disabled={!canSend || sending}
            className="px-5 py-1.5 text-[11px] font-semibold cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={GOLD_BTN}
            onClick={this.handleSend}
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    );
  }

  render() {
    const { open, onClose } = this.props;
    const { view, error } = this.state;

    if (!open) return null;

    return (
      <div className="fixed inset-0 z-[60]" onClick={onClose}>
        <div
          className="absolute right-4 flex flex-col"
          style={{
            top: 52,
            width: 380,
            maxHeight: 500,
            ...DIALOG_STYLE,
            overflow: 'hidden',
          }}
          onClick={e => e.stopPropagation()}
        >
          <FourCorners radius={12} />

          {/* Header */}
          <div className="flex items-center justify-between px-3 pt-3 pb-0">
            <span className="text-xs font-bold arena-heading tracking-wide" style={{ color: TEXT_PRIMARY, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
              Mailbox
            </span>
            <button
              type="button"
              className="w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer"
              style={{ color: TEXT_MUTED }}
              onMouseEnter={e => { e.currentTarget.style.color = TEXT_BODY; e.currentTarget.style.background = `${GOLD} 0.08)`; }}
              onMouseLeave={e => { e.currentTarget.style.color = TEXT_MUTED; e.currentTarget.style.background = 'transparent'; }}
              onClick={onClose}
            >
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {view === 'list' && this.renderTabBar()}

          {view === 'list' && error && (
            <div className="mx-3 mb-1 px-2.5 py-1.5 text-[10px] rounded-md" style={{ background: 'rgba(180,60,60,0.08)', border: '1px solid rgba(180,60,60,0.25)', color: '#c45050' }}>
              {error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto" style={{ maxHeight: view === 'list' ? 380 : 420 }}>
            {view === 'list' && this.renderListView()}
            {view === 'detail' && this.renderDetailView()}
            {view === 'compose' && this.renderComposeView()}
          </div>
        </div>
      </div>
    );
  }
}
