import { Component } from 'preact';
import { motion, AnimatePresence } from 'framer-motion';
import RuneSpinner from './RuneSpinner';
import { fetchInbox, sendMail, claimMail, deleteMail } from '../utils/arena/mailApi';
import { loadArenaProfile } from '../utils/arena/profileApi';
import { refreshMailbox } from '../utils/presenceManager';
import { playUI, UI } from '../utils/arena/uiSounds';
import VikingOrnament from './VikingOrnament';
import { Select } from './ui/select';
import { CoinIcon } from './ui/icons';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD,
  PANEL_BG, DIALOG_STYLE, GOLD_BTN, BEVELED_BTN, DANGER_BTN, INPUT_STYLE,
  TAB_ACTIVE, TAB_INACTIVE, COIN_COLOR,
  FourCorners, OrnamentalDivider,
  getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';

// The mailbox dialog has a centerpiece Viking ornament rendered behind
// its content. Most shared theme styles use semi-transparent backgrounds
// (e.g. INPUT_STYLE = rgba(0,0,0,0.25), GOLD_BTN gradient at 0.85-0.9
// alpha), which let the ornament strokes bleed through any input or
// button rendered on top. To fix that, we layer an opaque base color
// underneath the existing styles by setting backgroundColor AFTER the
// spread of the shared style. The CSS `background` shorthand resets
// background-color to transparent; the explicit backgroundColor that
// follows reinstates a fully opaque base layer that the gradients and
// textures composite on top of, hiding the ornament behind them.
const SOLID_BASE = '#0e0a06';
const SOLID_GOLD_BASE = '#3a2812';

// Medieval "carved stone well" input style. Uses the project's shared
// stone / chisel / scratches / cracks textures on top of a deep dark
// base, with a thin gold rim and a heavy inset shadow so the field
// reads as if it were chiselled INTO the panel rather than sitting on
// top of it. Blend modes keep the textures subtle — you want to feel
// the surface, not see the tiles. Both <input> and <textarea> use this.
const MAILBOX_INPUT_STYLE = {
  backgroundImage: [
    "url('/tex-stone.webp')",
    "url('/tex-chisel.webp')",
    "url('/tex-scratches.webp')",
    "url('/tex-cracks.webp')",
    'linear-gradient(180deg, rgba(18,12,6,0.98) 0%, rgba(8,5,2,0.98) 100%)',
  ].join(', '),
  backgroundBlendMode: 'soft-light, soft-light, overlay, multiply, normal',
  backgroundColor: SOLID_BASE,
  backgroundSize: '260px, 320px, 200px, 380px, 100% 100%',
  backgroundRepeat: 'repeat, repeat, repeat, repeat, no-repeat',
  border: `1px solid ${GOLD} 0.32)`,
  borderRadius: '6px',
  color: TEXT_PRIMARY,
  boxShadow: [
    'inset 0 3px 10px rgba(0,0,0,0.85)',
    'inset 0 -1px 0 rgba(212,168,67,0.10)',
    'inset 0 0 0 1px rgba(0,0,0,0.35)',
    '0 1px 0 rgba(212,168,67,0.06)',
  ].join(', '),
  textShadow: '0 1px 1px rgba(0,0,0,0.55)',
  fontFamily: 'inherit',
};
const MAILBOX_GOLD_BTN = { ...GOLD_BTN, backgroundColor: SOLID_GOLD_BASE };
const MAILBOX_BEVELED_BTN = { ...BEVELED_BTN, backgroundColor: SOLID_BASE };
const MAILBOX_DANGER_BTN = { ...DANGER_BTN, backgroundColor: SOLID_BASE };
// TAB_ACTIVE/TAB_INACTIVE both use mostly-transparent backgrounds
// (rgba(GOLD, 0.12) and `transparent` respectively). Add an opaque base
// underneath so the centerpiece ornament can't bleed through the tab bar.
const MAILBOX_TAB_ACTIVE = { ...TAB_ACTIVE, backgroundColor: SOLID_GOLD_BASE };
const MAILBOX_TAB_INACTIVE = { ...TAB_INACTIVE, backgroundColor: SOLID_BASE };

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
  { key: 'all', label: 'All' },
  { key: 'friend', label: 'Friends' },
  { key: 'auction', label: 'Auction' },
  { key: 'news', label: 'News' },
];

export default class Mailbox extends Component {
  constructor(props) {
    super(props);
    this.state = {
      tab: 'all',
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
      cardPickerSearch: '',
      error: null,
      viewScale: getViewportScale(),
    };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
    this.loadInbox();
  }

  componentWillUnmount() {
    this._unmounted = true;
    this.unsubScale?.();
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
      // Server returns an array directly; older versions wrapped it in {mail: [...]}
      const mail = Array.isArray(result) ? result : (result?.mail || []);
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

  handleSlotCollect = (mail, slotKey, animData, allCards, hasCoins) => {
    playUI(UI.MAIL_COLLECT);
    const claimedSlots = new Set(this.state.claimedSlots || []);
    claimedSlots.add(slotKey);

    this.setState({ claimedSlots, collectAnim: animData });
    clearTimeout(this._collectAnimTimer);
    this._collectAnimTimer = setTimeout(() => this.setState({ collectAnim: null }), 1800);

    // Check if all slots are now collected
    const allCardsClaimed = allCards.every((_, i) => claimedSlots.has(`card-${i}`));
    const coinsClaimed = !hasCoins || claimedSlots.has('coins');
    if (allCardsClaimed && coinsClaimed) {
      // Auto-claim after animation starts
      setTimeout(() => {
        this.handleClaim(mail);
      }, 600);
    }
  };

  handleClaim = async (mail) => {
    this.setState({ claiming: true, error: null });
    try {
      await claimMail(mail.id);

      // Reload the full profile from the server to pick up updated coins + collection
      const token = this.props.profile?.serverToken;
      if (token && this.props.onProfileUpdate) {
        const fresh = await loadArenaProfile(token).catch(() => null);
        if (fresh) {
          this.props.onProfileUpdate({
            ...this.props.profile,
            coins: fresh.coins ?? this.props.profile.coins,
            collection: fresh.collection ?? this.props.profile.collection,
          });
        }
      }

      // Auto-delete auction mail after a short delay
      const isAuction = mail.type === 'auction';
      const updatedMail = this.state.mail.map((m) =>
        m.id === mail.id ? { ...m, claimed: true } : m,
      );
      this.setState({
        mail: updatedMail,
        selectedMail: { ...mail, claimed: true },
        claiming: false,
      });

      // Refresh the mailbox unread badge in the parent
      refreshMailbox();

      if (isAuction) {
        setTimeout(async () => {
          await deleteMail(mail.id).catch(() => {});
          const remaining = this.state.mail.filter((m) => m.id !== mail.id);
          this.setState({ mail: remaining, selectedMail: null, view: 'list', claimedSlots: new Set() });
          refreshMailbox();
        }, 2000);
      }
    } catch (err) {
      this.setState({ claiming: false, error: err.message });
    }
  };

  handleDelete = async (mail) => {
    playUI(UI.MAIL_DELETE);
    this.setState({ error: null });
    try {
      await deleteMail(mail.id);
      const updatedMail = this.state.mail.filter((m) => m.id !== mail.id);
      this.setState({ mail: updatedMail, view: 'list', selectedMail: null });
      refreshMailbox();
    } catch (err) {
      this.setState({ error: err.message });
    }
  };

  handleSend = async () => {
    const { composeRecipient, composeSubject, composeBody, composeCards, composeCoins } = this.state;
    if (!composeRecipient) return;

    // composeCards is an array of { cardId, foiling } items where each
    // entry represents one copy. Aggregate into the server's
    // { cardId, foiling, quantity } payload.
    const cardPayload = [];
    for (const entry of composeCards) {
      const existing = cardPayload.find(
        (c) => c.cardId === entry.cardId && c.foiling === entry.foiling
      );
      if (existing) existing.quantity++;
      else cardPayload.push({ cardId: entry.cardId, foiling: entry.foiling, quantity: 1 });
    }

    this.setState({ sending: true, error: null });
    try {
      await sendMail({
        recipientId: composeRecipient.id,
        subject: composeSubject,
        body: composeBody,
        cards: cardPayload.length > 0 ? cardPayload : undefined,
        coins: composeCoins > 0 ? composeCoins : undefined,
      });

      // Reload the full profile from the server so coins + collection
      // reflect the deductions. Avoids local recomputation drift.
      const token = this.props.profile?.serverToken;
      if (token && this.props.onProfileUpdate) {
        const fresh = await loadArenaProfile(token).catch(() => null);
        if (fresh) {
          this.props.onProfileUpdate({
            ...this.props.profile,
            coins: fresh.coins ?? this.props.profile.coins,
            collection: fresh.collection ?? this.props.profile.collection,
          });
        }
      }

      playUI(UI.MAIL_SEND);
      this.props.onSendComplete?.();
      this.setState({ sending: false, view: 'list' });
      this.loadInbox();
    } catch (err) {
      this.setState({ sending: false, error: err.message });
    }
  };

  addCardToCompose = (cardId, foiling = 'S') => {
    this.setState(s => {
      if (s.composeCards.length >= 10) return null;
      return { composeCards: [...s.composeCards, { cardId, foiling }] };
    });
  };

  removeCardFromCompose = (cardId, foiling = 'S') => {
    this.setState(s => {
      const idx = s.composeCards.findLastIndex(
        (c) => c.cardId === cardId && c.foiling === foiling
      );
      if (idx < 0) return null;
      const next = [...s.composeCards];
      next.splice(idx, 1);
      return { composeCards: next };
    });
  };

  renderTabBar() {
    const { tab, view } = this.state;
    return (
      <div className="flex gap-1 px-3 pt-3 pb-2">
        {TAB_KEYS.map(t => (
          <button
            key={t.key}
            type="button"
            className="flex-1 py-1.5 text-[11px] font-medium text-center transition-all cursor-pointer"
            style={tab === t.key ? MAILBOX_TAB_ACTIVE : MAILBOX_TAB_INACTIVE}
            onClick={() => this.setState({ tab: t.key, view: 'list', selectedMail: null, error: null })}
          >
            {t.label}
          </button>
        ))}
      </div>
    );
  }

  renderListView() {
    const { sorceryCards } = this.props;
    const { mail, loading, tab } = this.state;

    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <RuneSpinner size={48} />
        </div>
      );
    }

    const filtered = tab === 'all' ? mail : mail.filter(m => (m.type || 'friend') === tab);

    if (filtered.length === 0) {
      return null;
    }

    return (
      <div className="flex flex-col">
        {filtered.map(m => {
          const hasAttachments = !m.claimed && (((m.attachedCards || m.cards || []).length > 0) || ((m.attachedCoins || m.coins || 0) > 0));
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
                    {timeAgo(m.createdAt)}
                  </span>
                </div>
                <div className="text-[11px] truncate mt-0.5" style={{ color: TEXT_MUTED }}>
                  {m.subject || '(no subject)'}
                </div>
              </div>
              {tab === 'auction' && (m.attachedCoins || m.coins || 0) > 0 && (
                <span className="text-[10px] font-bold shrink-0 flex items-center gap-1" style={{ color: COIN_COLOR }}>
                  <CoinIcon size={10} />
                  {m.attachedCoins || m.coins || 0}
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

    const cards = m.attachedCards || m.cards || [];
    const coins = m.attachedCoins || m.coins || 0;
    const hasAttachments = cards.length > 0 || coins > 0;
    const canClaim = !m.claimed && hasAttachments;
    const isFriend = (m.type || 'friend') === 'friend';

    const claimedSlots = this.state.claimedSlots || new Set();
    // Once claimed on server, treat ALL slots as collected
    const effectiveClaimed = m.claimed ? true : false;
    const allSlotsClaimed = canClaim && cards.every((_, i) => claimedSlots.has(`card-${i}`)) && (coins <= 0 || claimedSlots.has('coins'));

    return (
      <div className="relative flex flex-col h-full">
        {/* Header */}
        <div className="px-3 pt-3 pb-2 shrink-0">
          <button
            type="button"
            className="text-[11px] cursor-pointer transition-all mb-2"
            style={{ color: TEXT_MUTED }}
            onMouseEnter={e => { e.currentTarget.style.color = TEXT_PRIMARY; }}
            onMouseLeave={e => { e.currentTarget.style.color = TEXT_MUTED; }}
            data-sound={UI.CANCEL}
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
                {timeAgo(m.createdAt)}
              </div>
            </div>
          </div>
          {m.subject && (
            <div className="text-xs font-medium mt-2" style={{ color: ACCENT_GOLD }}>
              {m.subject}
            </div>
          )}
        </div>

        <OrnamentalDivider className="px-3 my-1 shrink-0" />

        {/* Body + Attachments (scrollable together) */}
        <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
          {m.body && (
            <div className="text-xs leading-relaxed whitespace-pre-wrap mb-3" style={{ color: TEXT_BODY }}>
              {m.body}
            </div>
          )}

          {/* Attachment grid — inline after text */}
          {hasAttachments && (
            <div className="py-3 mt-2" style={{ borderTop: `1px solid ${GOLD} 0.08)` }}>
            <div className="text-[9px] font-semibold uppercase tracking-widest mb-2" style={{ color: `${GOLD} 0.45)` }}>
              {effectiveClaimed ? 'Collected' : 'Attachments — click to collect'}
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {cards.map((cardId, i) => {
                const resolvedId = typeof cardId === 'string' ? cardId : cardId?.cardId || '';
                const imgUrl = resolveCardImage(resolvedId, sorceryCards);
                const name = resolveCardName(resolvedId, sorceryCards);
                const slotKey = `card-${i}`;
                const collected = effectiveClaimed || claimedSlots.has(slotKey);
                return (
                  <button
                    key={`${resolvedId}-${i}`}
                    type="button"
                    disabled={effectiveClaimed || collected}
                    className="relative rounded-lg overflow-hidden transition-all duration-200"
                    style={{
                      border: `1px solid ${collected ? `${GOLD} 0.15)` : `${GOLD} 0.12)`}`,
                      opacity: collected ? 0.3 : 1,
                      cursor: (effectiveClaimed || collected) ? 'default' : 'pointer',
                      transform: collected && !effectiveClaimed ? 'scale(0.85)' : 'scale(1)',
                      filter: collected ? 'grayscale(0.8)' : 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (!collected && !effectiveClaimed) {
                        e.currentTarget.style.transform = 'scale(1.08)';
                        e.currentTarget.style.borderColor = ACCENT_GOLD;
                        e.currentTarget.style.boxShadow = `0 0 12px ${GOLD} 0.3)`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!collected && !effectiveClaimed) {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.borderColor = `${GOLD} 0.12)`;
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                    onClick={() => {
                      if (effectiveClaimed || collected) return;
                      this.handleSlotCollect(m, slotKey, { type: 'card', name, imgUrl }, cards, coins > 0);
                    }}
                  >
                    {imgUrl ? (
                      <img src={imgUrl} alt={name} className="w-full aspect-[63/88] object-cover" />
                    ) : (
                      <div className="w-full aspect-[63/88] flex items-center justify-center text-[8px]" style={{ background: `${GOLD} 0.04)`, color: TEXT_MUTED }}>
                        {name}
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 text-[7px] text-center py-0.5 truncate" style={{ background: 'rgba(0,0,0,0.8)', color: TEXT_BODY }}>
                      {name}
                    </div>
                    {collected && !effectiveClaimed && (
                      <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
                        <span className="text-sm" style={{ color: ACCENT_GOLD }}>✓</span>
                      </div>
                    )}
                  </button>
                );
              })}
              {coins > 0 && (
                <button
                  type="button"
                  disabled={effectiveClaimed || claimedSlots.has('coins')}
                  className="relative rounded-lg overflow-hidden flex flex-col items-center justify-center gap-1 transition-all duration-200"
                  style={{
                    border: `1px solid ${(effectiveClaimed || claimedSlots.has('coins')) ? `${GOLD} 0.15)` : `${GOLD} 0.12)`}`,
                    background: `${GOLD} 0.04)`,
                    opacity: (effectiveClaimed || claimedSlots.has('coins')) ? 0.3 : 1,
                    cursor: (effectiveClaimed || claimedSlots.has('coins')) ? 'default' : 'pointer',
                    aspectRatio: '63 / 88',
                    transform: (claimedSlots.has('coins') && !effectiveClaimed) ? 'scale(0.85)' : 'scale(1)',
                    filter: claimedSlots.has('coins') ? 'grayscale(0.8)' : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!claimedSlots.has('coins') && !effectiveClaimed) {
                      e.currentTarget.style.transform = 'scale(1.08)';
                      e.currentTarget.style.borderColor = ACCENT_GOLD;
                      e.currentTarget.style.boxShadow = `0 0 12px ${GOLD} 0.3)`;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!claimedSlots.has('coins') && !effectiveClaimed) {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.borderColor = `${GOLD} 0.12)`;
                      e.currentTarget.style.boxShadow = 'none';
                    }
                  }}
                  onClick={() => {
                    if (effectiveClaimed || claimedSlots.has('coins')) return;
                    this.handleSlotCollect(m, 'coins', { type: 'coins', amount: coins }, cards, true);
                  }}
                >
                  <CoinIcon size={26} />
                  <span className="text-xs font-bold" style={{ color: COIN_COLOR }}>{coins}</span>
                  <span className="text-[7px]" style={{ color: TEXT_MUTED }}>gold</span>
                  {claimedSlots.has('coins') && !effectiveClaimed && (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
                      <span className="text-sm" style={{ color: ACCENT_GOLD }}>✓</span>
                    </div>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
        </div>


        {/* Collection animation overlay */}
        <AnimatePresence>
          {this.state.collectAnim && (
            <motion.div
              className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              style={{ background: 'rgba(0,0,0,0.65)' }}
            >
              {this.state.collectAnim.type === 'card' && this.state.collectAnim.imgUrl ? (
                <motion.img
                  src={this.state.collectAnim.imgUrl}
                  alt=""
                  className="rounded-xl"
                  initial={{ scale: 0.3, opacity: 0 }}
                  animate={{ scale: [0.3, 1.15, 0.95, 1.05, 1], opacity: 1 }}
                  exit={{ scale: 0.7, opacity: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  style={{
                    width: '40%',
                    maxWidth: 160,
                    aspectRatio: '63 / 88',
                    objectFit: 'cover',
                    boxShadow: `0 0 40px ${GOLD} 0.4), 0 20px 60px rgba(0,0,0,0.6)`,
                    border: `2px solid ${ACCENT_GOLD}`,
                  }}
                />
              ) : this.state.collectAnim.type === 'coins' ? (
                <motion.span
                  className="w-16 h-16 rounded-full"
                  initial={{ scale: 0.3, opacity: 0 }}
                  animate={{ scale: [0.3, 1.15, 0.95, 1.05, 1], opacity: 1 }}
                  exit={{ scale: 0.7, opacity: 0 }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                  style={{
                    background: `radial-gradient(circle at 35% 35%, #ffe680, ${COIN_COLOR}, #b8860b)`,
                    boxShadow: `0 0 40px ${GOLD} 0.5), 0 20px 60px rgba(0,0,0,0.6)`,
                    border: `2px solid ${ACCENT_GOLD}`,
                  }}
                />
              ) : null}
              <motion.div
                className="mt-4 text-sm font-bold arena-heading tracking-wide"
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -8, opacity: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                style={{
                  color: ACCENT_GOLD,
                  textShadow: `0 0 20px ${GOLD} 0.5), 0 2px 4px rgba(0,0,0,0.8)`,
                }}
              >
                {this.state.collectAnim.type === 'coins'
                  ? `+ ${this.state.collectAnim.amount} Gold`
                  : `Received: ${this.state.collectAnim.name}`
                }
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Delete confirmation modal */}
        {this.state.confirmDeleteMail?.id === m.id && (
          <div className="absolute inset-0 z-10 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', borderRadius: 'inherit' }}>
            <div className="p-4 mx-4 rounded-lg" style={{ background: PANEL_BG, border: `1px solid ${GOLD} 0.3)` }}>
              <div className="text-xs font-semibold mb-2" style={{ color: TEXT_PRIMARY }}>
                This letter has uncollected attachments
              </div>
              <div className="text-[11px] mb-3" style={{ color: TEXT_MUTED }}>
                {cards.length > 0 && `${cards.length} card${cards.length > 1 ? 's' : ''}`}
                {cards.length > 0 && coins > 0 && ' and '}
                {coins > 0 && `${coins} gold`}
                {' will be lost forever. Are you sure?'}
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  className="px-3 py-1 text-[10px] cursor-pointer transition-all"
                  style={{ ...MAILBOX_BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
                  data-sound={UI.CANCEL}
                  onClick={() => this.setState({ confirmDeleteMail: null })}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-3 py-1 text-[10px] cursor-pointer transition-all"
                  style={MAILBOX_DANGER_BTN}
                  data-sound={UI.CANCEL}
                  onClick={() => {
                    this.setState({ confirmDeleteMail: null });
                    this.handleDelete(m);
                  }}
                >
                  Delete Anyway
                </button>
              </div>
            </div>
          </div>
        )}
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

    // Friends list mapped into the shared Select component's option
    // shape. The Select handles searchable typeahead, arrow-key
    // navigation, Enter-to-pick, and click selection — all the
    // autocomplete behavior we need lives in one shared component.
    const recipientOptions = friends.map((f) => ({ value: f.id, label: f.name || 'Unknown' }));

    return (
      <div className="flex flex-col h-full">
        <div className="px-3 pt-3 pb-2">
          <button
            type="button"
            className="text-[11px] cursor-pointer transition-all mb-2"
            style={{ color: TEXT_MUTED }}
            onMouseEnter={e => { e.currentTarget.style.color = TEXT_PRIMARY; }}
            onMouseLeave={e => { e.currentTarget.style.color = TEXT_MUTED; }}
            data-sound={UI.CANCEL}
            onClick={this.backToList}
          >
            &larr; Back
          </button>
          <div className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>
            New Message
          </div>
        </div>

        <OrnamentalDivider className="px-3 my-1" />

        <div className="flex-1 overflow-hidden px-3 py-2 flex flex-col gap-2.5">
          {/* Recipient — shared shadcn Select with searchable typeahead.
              Click the field to open the dropdown, type to filter,
              arrow keys / Enter to pick. All autocomplete behavior is
              encapsulated in src/components/ui/select.jsx. */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1" style={{ color: `${GOLD} 0.55)` }}>
              To
            </label>
            {friends.length === 0 ? (
              <div
                className="text-[11px] px-2.5 py-2 text-center rounded-md"
                style={{ background: SOLID_BASE, border: `1px solid ${GOLD} 0.18)`, color: TEXT_MUTED }}
              >
                No friends to send to
              </div>
            ) : (
              <Select
                ariaLabel="Recipient"
                options={recipientOptions}
                value={composeRecipient?.id || ''}
                onValueChange={(id) => {
                  const friend = friends.find((f) => f.id === id);
                  this.setState({ composeRecipient: friend || null });
                }}
                placeholder="Choose a friend..."
                searchable
                menuSearchPlaceholder="Type to filter friends..."
                noOptionsMessage="No matching friends"
              />
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
              style={{ ...MAILBOX_INPUT_STYLE, borderRadius: '6px', color: TEXT_PRIMARY }}
              onInput={e => this.setState({ composeSubject: e.target.value })}
            />
          </div>

          {/* Body */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1" style={{ color: `${GOLD} 0.55)` }}>
              Message
            </label>
            <textarea
              maxLength={256}
              rows={3}
              value={composeBody}
              placeholder="Write your message..."
              className="w-full px-2.5 py-1.5 text-xs outline-none resize-none"
              style={{ ...MAILBOX_INPUT_STYLE, borderRadius: '6px', color: TEXT_PRIMARY }}
              onInput={e => this.setState({ composeBody: e.target.value })}
            />
            <div className="text-[9px] text-right mt-0.5" style={{ color: TEXT_MUTED }}>
              {composeBody.length}/256
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
                onClick={() => this.setState(s => ({ showCardPicker: !s.showCardPicker, cardPickerSearch: '' }))}
              >
                {showCardPicker ? 'Close Picker' : 'Choose Cards'}
              </button>
            </div>
            {composeCards.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {composeCards.map((entry, i) => {
                  const { cardId, foiling } = entry;
                  const imgUrl = resolveCardImage(cardId, sorceryCards);
                  const name = resolveCardName(cardId, sorceryCards);
                  const isFoil = foiling === 'F' || foiling === 'R';
                  const borderColor = foiling === 'R' ? '#c480e0' : ACCENT_GOLD;
                  return (
                    <div
                      key={`${cardId}-${foiling}-${i}`}
                      className="relative rounded overflow-hidden cursor-pointer"
                      style={{ border: `1px solid ${borderColor}`, width: 36 }}
                      title={`${name}${isFoil ? ` (${foiling === 'R' ? 'Rainbow Foil' : 'Foil'})` : ''} — click to remove`}
                      onClick={() => this.removeCardFromCompose(cardId, foiling)}
                    >
                      {imgUrl ? (
                        <img src={imgUrl} alt={name} className="w-full aspect-[5/7] object-cover" />
                      ) : (
                        <div className="w-full aspect-[5/7] flex items-center justify-center text-[6px]" style={{ background: `${GOLD} 0.08)`, color: TEXT_MUTED }}>
                          {name}
                        </div>
                      )}
                      {isFoil && (
                        <span
                          className="absolute top-0 right-0 text-[6px] font-bold px-0.5 rounded-bl"
                          style={{ background: 'rgba(0,0,0,0.85)', color: borderColor }}
                        >
                          {foiling === 'R' ? 'RF' : 'F'}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Coins */}
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1" style={{ color: `${GOLD} 0.55)` }}>
              Attach Coins
            </label>
            <div className="flex items-center gap-2">
              <CoinIcon size={14} />
              <input
                type="number"
                min="0"
                max={profile?.coins || 0}
                value={composeCoins || ''}
                placeholder="0"
                className="w-24 px-2.5 py-1.5 text-xs outline-none"
                style={{ ...MAILBOX_INPUT_STYLE, borderRadius: '6px', color: TEXT_PRIMARY }}
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

      </div>
    );
  }

  render() {
    const { open, onClose } = this.props;
    const { view, error } = this.state;

    return (
      <AnimatePresence>
        {!open ? null : (
      <>
        <div className="fixed inset-0 z-[59]" onClick={onClose} />
        <motion.div
          className="absolute flex flex-col z-[60]"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          style={{
            top: 'calc(100% + 8px)',
            right: 0,
            width: 400,
            maxHeight: 'min(580px, calc(100vh - 80px))',
            height: 580,
            transformOrigin: 'top right',
            ...DIALOG_STYLE,
          }}
          onClick={e => e.stopPropagation()}
        >
          <FourCorners radius={12} />
          <VikingOrnament ornament="broa016" variant="centerpiece" opacity={0.04} />

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
              data-sound={UI.CANCEL}
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

          <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
            {view === 'list' && this.renderListView()}
            {view === 'detail' && this.renderDetailView()}
            {view === 'compose' && this.renderComposeView()}
          </div>

          {/* Pinned footer — always at bottom */}
          <div className="shrink-0 px-3 py-2.5 flex items-center justify-end gap-2" style={{ borderTop: `1px solid ${GOLD} 0.08)` }}>
            {view === 'list' && (this.state.tab === 'all' || this.state.tab === 'friend') ? (
              <button
                type="button"
                className="px-4 py-1.5 text-[11px] font-semibold cursor-pointer transition-all"
                style={{ ...MAILBOX_GOLD_BTN, borderRadius: '6px' }}
                data-sound={UI.CONFIRM}
                onClick={() => this.openCompose()}
              >
                Compose
              </button>
            ) : null}
            {view === 'detail' && this.state.selectedMail ? (() => {
              const m = this.state.selectedMail;
              const isFriend = (m.type || 'friend') === 'friend';
              const cards = m.attachedCards || m.cards || [];
              const coins = m.attachedCoins || m.coins || 0;
              const hasAtt = cards.length > 0 || coins > 0;
              return (
                <>
                  {isFriend && (
                    <button
                      type="button"
                      className="px-3 py-1.5 text-[11px] font-medium cursor-pointer transition-all"
                      style={{ ...MAILBOX_BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
                      onClick={() => this.openReply(m)}
                    >
                      Reply
                    </button>
                  )}
                  <button
                    type="button"
                    className="px-3 py-1.5 text-[10px] cursor-pointer transition-all ml-auto"
                    style={MAILBOX_DANGER_BTN}
                    data-sound={UI.CANCEL}
                    onClick={() => {
                      if (hasAtt && !m.claimed) {
                        this.setState({ confirmDeleteMail: m });
                      } else {
                        this.handleDelete(m);
                      }
                    }}
                  >
                    Delete
                  </button>
                </>
              );
            })() : null}
            {view === 'compose' ? (
              <>
                {this.state.error ? (
                  <div className="flex-1 text-[10px] truncate" style={{ color: '#c45050' }}>
                    {this.state.error}
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={!(this.state.composeRecipient && (this.state.composeSubject.trim() || this.state.composeBody.trim())) || this.state.sending}
                  className="px-5 py-1.5 text-[11px] font-semibold cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ ...MAILBOX_GOLD_BTN, borderRadius: '6px' }}
                  data-sound={UI.CONFIRM}
                  onClick={this.handleSend}
                >
                  {this.state.sending ? 'Sending...' : 'Send'}
                </button>
              </>
            ) : null}
          </div>

          {/* Card picker — anchored to left of this panel */}
          <AnimatePresence>
            {this.state.view === 'compose' && this.state.showCardPicker ? this.renderCardPicker() : null}
          </AnimatePresence>
        </motion.div>
      </>
        )}
      </AnimatePresence>
    );
  }

  renderCardPicker() {
    const { profile, sorceryCards } = this.props;
    const { composeCards, cardPickerSearch, viewScale } = this.state;
    const collection = profile?.collection || [];

    // Each (cardId, foiling) pair becomes its own tile so the sender can
    // pick the foil version explicitly. The collection from the server
    // is already structured this way.
    const searchLower = cardPickerSearch.toLowerCase();
    const filtered = searchLower
      ? collection.filter(entry => {
          const name = resolveCardName(entry.cardId, sorceryCards);
          return name.toLowerCase().includes(searchLower);
        })
      : collection;

    return (
      <motion.div
        key="card-picker"
        className="absolute flex flex-col"
        initial={{ opacity: 0, x: 12, scale: 0.96 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 12, scale: 0.96 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        style={{
          top: 0,
          right: '100%',
          marginRight: 8,
          width: 320,
          height: '100%',
          transformOrigin: 'top right',
          ...DIALOG_STYLE,
        }}
        onClick={e => e.stopPropagation()}
      >
        <FourCorners radius={12} />

        {/* Header */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold arena-heading" style={{ color: TEXT_PRIMARY }}>
              Attach Cards
            </span>
            <span className="text-[10px] tabular-nums" style={{ color: TEXT_MUTED }}>
              {composeCards.length}/10 selected
            </span>
          </div>
          <input
            type="text"
            placeholder="Search cards..."
            value={cardPickerSearch}
            className="w-full px-2.5 py-1.5 text-xs outline-none"
            style={{ ...INPUT_STYLE, borderRadius: '6px', color: TEXT_PRIMARY }}
            onInput={e => this.setState({ cardPickerSearch: e.target.value })}
          />
        </div>

        <OrnamentalDivider className="px-4 my-1" />

        {/* Card grid */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <div className="grid grid-cols-4 gap-2">
            {filtered.map(entry => {
              const foiling = entry.foiling || 'S';
              const imgUrl = resolveCardImage(entry.cardId, sorceryCards);
              const name = resolveCardName(entry.cardId, sorceryCards);
              const selectedCount = composeCards.filter(
                c => c.cardId === entry.cardId && c.foiling === foiling
              ).length;
              const isSelected = selectedCount > 0;
              const canAddMore = selectedCount < entry.quantity && composeCards.length < 10;
              const isFoil = foiling === 'F' || foiling === 'R';
              const foilColor = foiling === 'R' ? '#c480e0' : ACCENT_GOLD;
              return (
                <div key={`${entry.cardId}-${foiling}`} className="relative">
                  <button
                    type="button"
                    className="relative w-full rounded-lg overflow-hidden transition-all cursor-pointer"
                    style={isSelected
                      ? { border: `2px solid ${isFoil ? foilColor : ACCENT_GOLD}`, boxShadow: `0 0 10px ${GOLD} 0.25)` }
                      : { border: `2px solid ${isFoil ? foilColor + '55' : `${GOLD} 0.1)`}` }
                    }
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = isFoil ? foilColor : `${GOLD} 0.3)`; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = isFoil ? foilColor + '55' : `${GOLD} 0.1)`; }}
                    onClick={() => { if (canAddMore) this.addCardToCompose(entry.cardId, foiling); }}
                  >
                    {imgUrl ? (
                      <img src={imgUrl} alt={name} className="w-full aspect-[5/7] object-cover" />
                    ) : (
                      <div className="w-full aspect-[5/7] flex items-center justify-center text-[8px] p-1 text-center" style={{ background: `${GOLD} 0.04)`, color: TEXT_MUTED }}>
                        {name}
                      </div>
                    )}
                    <span
                      className="absolute top-1 right-1 text-[8px] font-bold px-1 py-0.5 rounded"
                      style={{ background: 'rgba(0,0,0,0.8)', color: TEXT_BODY }}
                    >
                      x{entry.quantity - selectedCount}
                    </span>
                    {isFoil && (
                      <span
                        className="absolute top-1 left-1 text-[8px] font-bold px-1 py-0.5 rounded"
                        style={{ background: 'rgba(0,0,0,0.8)', color: foilColor }}
                      >
                        {foiling === 'R' ? 'RF' : 'F'}
                      </span>
                    )}
                    {isSelected && (
                      <div className="absolute bottom-7 left-1 min-w-[18px] h-[18px] rounded flex items-center justify-center text-[9px] font-bold" style={{ background: ACCENT_GOLD, color: '#1a1408', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
                        {selectedCount}
                      </div>
                    )}
                    <div
                      className="absolute bottom-0 left-0 right-0 text-[7px] text-center py-0.5 truncate px-0.5"
                      style={{ background: 'rgba(0,0,0,0.75)', color: TEXT_BODY }}
                    >
                      {name}
                    </div>
                  </button>
                  {isSelected && (
                    <button
                      type="button"
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold cursor-pointer z-10"
                      style={{ background: '#c45050', color: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
                      onClick={() => this.removeCardFromCompose(entry.cardId, foiling)}
                    >
                      −
                    </button>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-4 text-[10px] py-8 text-center" style={{ color: TEXT_MUTED }}>
                {cardPickerSearch ? 'No cards match your search' : 'No cards in collection'}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  }
}
