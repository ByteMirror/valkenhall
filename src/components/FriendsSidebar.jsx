import { Component } from 'preact';
import { cn } from '../lib/utils';
import { searchPlayers, sendFriendRequest, acceptFriendRequest, declineFriendRequest, removeFriend } from '../utils/friendsApi';
import { formatRank, TIER_COLORS } from '../utils/arena/rankUtils';
import { levelFromXp } from '../utils/arena/profileDefaults';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, PANEL_BG, ACCENT_GOLD,
  GOLD_BTN, DANGER_BTN, BEVELED_BTN, INPUT_STYLE,
  TAB_ACTIVE, TAB_INACTIVE, COIN_COLOR,
  FourCorners, OrnamentalDivider, SECTION_HEADER_STYLE,
  getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';

function resolveAvatarUrl(cardId, sorceryCards) {
  if (!cardId || !sorceryCards) return null;
  const card = sorceryCards.find((c) => c.unique_id === cardId);
  return card?.printings?.[0]?.image_url || null;
}

const ACTIVITY_LABELS = {
  hub: 'In Hub',
  store: 'In Store',
  deckbuilder: 'Deck Builder',
  'in-match': 'In Match',
  'pack-opening': 'Opening Packs',
  'deck-select': 'Selecting Deck',
  matchmaking: 'In Queue',
  'auction-house': 'Auction House',
};

const ACTIVITY_STYLES = {
  'in-match': { color: '#c45050', background: 'rgba(180,60,60,0.1)', border: '1px solid rgba(180,60,60,0.2)' },
  matchmaking: { color: ACCENT_GOLD, background: `${GOLD} 0.08)`, border: `1px solid ${GOLD} 0.2)` },
};

const DEFAULT_ACTIVITY_STYLE = { color: `${GOLD} 0.6)`, background: `${GOLD} 0.06)`, border: `1px solid ${GOLD} 0.15)` };

const SIDEBAR_STYLE = {
  background: PANEL_BG,
  borderLeft: `1px solid ${GOLD} 0.15)`,
  boxShadow: '-20px 0 60px rgba(0,0,0,0.5), 0 0 30px rgba(180,140,60,0.03)',
};

export default class FriendsSidebar extends Component {
  constructor(props) {
    super(props);
    this.state = {
      searchQuery: '',
      searchResults: null,
      searchLoading: false,
      activeTab: 'friends',
      viewScale: getViewportScale(),
    };
    this.searchTimeout = null;
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
  }

  componentWillUnmount() {
    clearTimeout(this.searchTimeout);
    this.unsubScale?.();
  }

  handleSearch = (e) => {
    const query = e.target.value;
    this.setState({ searchQuery: query });

    clearTimeout(this.searchTimeout);
    if (query.trim().length < 2) {
      this.setState({ searchResults: null });
      return;
    }

    this.searchTimeout = setTimeout(async () => {
      this.setState({ searchLoading: true });
      try {
        const results = await searchPlayers(query.trim());
        this.setState({ searchResults: results, searchLoading: false });
      } catch {
        this.setState({ searchResults: [], searchLoading: false });
      }
    }, 300);
  };

  handleSendRequest = async (targetId) => {
    try {
      const result = await sendFriendRequest(targetId);
      this.setState((s) => ({
        searchResults: s.searchResults?.map((r) =>
          r.id === targetId ? { ...r, requestSent: true, autoAccepted: result.autoAccepted } : r
        ),
      }));
    } catch {}
  };

  handleAccept = async (senderId) => {
    try {
      await acceptFriendRequest(senderId);
    } catch {}
  };

  handleDecline = async (senderId) => {
    try {
      await declineFriendRequest(senderId);
    } catch {}
  };

  handleRemove = async (friendId) => {
    try {
      await removeFriend(friendId);
      this.setState({ showRemoveConfirm: null, expandedFriend: null });
    } catch {}
  };

  render() {
    const { open, onClose, friendListData, onViewProfile, sorceryCards } = this.props;
    const { searchQuery, searchResults, searchLoading, activeTab } = this.state;

    if (!open) return null;

    const friends = friendListData?.friends || [];
    const pendingRequests = friendListData?.pendingRequests || [];
    const onlineFriends = friends.filter((f) => f.online);
    const offlineFriends = friends.filter((f) => !f.online);
    const totalFriends = friends.length;
    const pendingCount = pendingRequests.length;

    return (
      <div className="fixed inset-0 z-[70]" style={{ zoom: this.state.viewScale }} onClick={onClose}>
        <div
          className="absolute top-0 right-0 h-full w-[340px] flex flex-col animate-[slideInRight_0.25s_cubic-bezier(0.16,1,0.3,1)]"
          style={SIDEBAR_STYLE}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 py-4" style={{ borderBottom: `1px solid ${GOLD} 0.1)` }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold arena-heading tracking-wide" style={{ color: TEXT_PRIMARY, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>Friends</h2>
              <button
                type="button"
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                style={{ color: TEXT_MUTED }}
                onMouseEnter={(e) => { e.currentTarget.style.color = TEXT_BODY; e.currentTarget.style.background = `${GOLD} 0.08)`; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = TEXT_MUTED; e.currentTarget.style.background = 'transparent'; }}
                onClick={onClose}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
            {/* Tab bar */}
            <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: `${GOLD} 0.04)` }}>
              <button
                type="button"
                className="flex-1 rounded-md py-1.5 text-[11px] font-medium transition-all cursor-pointer"
                style={activeTab === 'friends' ? { background: `${GOLD} 0.12)`, color: ACCENT_GOLD } : { color: TEXT_MUTED }}
                onClick={() => this.setState({ activeTab: 'friends' })}
              >
                Friends{totalFriends > 0 ? ` (${totalFriends})` : ''}
              </button>
              <button
                type="button"
                className="flex-1 rounded-md py-1.5 text-[11px] font-medium transition-all relative cursor-pointer"
                style={activeTab === 'search' ? { background: `${GOLD} 0.12)`, color: ACCENT_GOLD } : { color: TEXT_MUTED }}
                onClick={() => this.setState({ activeTab: 'search' })}
              >
                Add Friends
              </button>
              {pendingCount > 0 ? (
                <button
                  type="button"
                  className="flex-1 rounded-md py-1.5 text-[11px] font-medium transition-all relative cursor-pointer"
                  style={activeTab === 'requests' ? { background: `${GOLD} 0.12)`, color: ACCENT_GOLD } : { color: TEXT_MUTED }}
                  onClick={() => this.setState({ activeTab: 'requests' })}
                >
                  Requests
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold px-1" style={{ background: '#c45050', color: '#fff' }}>{pendingCount}</span>
                </button>
              ) : null}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {/* === FRIENDS TAB === */}
            {activeTab === 'friends' ? (
              <div className="py-2">
                {onlineFriends.length > 0 ? (
                  <div className="mb-1">
                    <div className="px-5 py-2 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ACCENT_GOLD }} />
                      <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: `${GOLD} 0.6)` }}>Online — {onlineFriends.length}</span>
                    </div>
                    <div className="px-2">
                      {onlineFriends.map((f) => this.renderFriendCard(f, false))}
                    </div>
                  </div>
                ) : null}

                {offlineFriends.length > 0 ? (
                  <div>
                    <div className="px-5 py-2 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: `${GOLD} 0.15)` }} />
                      <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: TEXT_MUTED }}>Offline — {offlineFriends.length}</span>
                    </div>
                    <div className="px-2">
                      {offlineFriends.map((f) => this.renderFriendCard(f, true))}
                    </div>
                  </div>
                ) : null}

                {friends.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-6">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: `${GOLD} 0.04)`, border: `1px solid ${GOLD} 0.1)` }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: `${GOLD} 0.2)` }}>
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round"/>
                        <circle cx="9" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M19 8v6M22 11h-6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div className="text-sm font-medium mb-1" style={{ color: TEXT_MUTED }}>No friends yet</div>
                    <div className="text-xs text-center mb-4" style={{ color: `${GOLD} 0.2)` }}>Search for other players to add them as friends</div>
                    <button
                      type="button"
                      className="px-4 py-1.5 text-xs font-medium cursor-pointer transition-all"
                      style={{ ...BEVELED_BTN, color: ACCENT_GOLD, borderRadius: '6px' }}
                      onClick={() => this.setState({ activeTab: 'search' })}
                    >
                      Find Players
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* === SEARCH TAB === */}
            {activeTab === 'search' ? (
              <div className="py-3 px-4">
                <div className="relative mb-3">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: `${GOLD} 0.25)` }}>
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    placeholder="Search by username..."
                    className="w-full pl-9 pr-3 py-2.5 text-sm outline-none transition-all"
                    style={{ ...INPUT_STYLE, borderRadius: '8px', color: TEXT_PRIMARY }}
                    onInput={this.handleSearch}
                    autoFocus
                  />
                </div>

                {searchResults ? (
                  <div className="flex flex-col gap-1.5">
                    {searchLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-5 h-5 rounded-full animate-spin" style={{ border: `2px solid ${GOLD} 0.2)`, borderTopColor: ACCENT_GOLD }} />
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="text-center py-8">
                        <div className="text-sm" style={{ color: TEXT_MUTED }}>No players found</div>
                        <div className="text-xs mt-1" style={{ color: `${GOLD} 0.2)` }}>Try a different username</div>
                      </div>
                    ) : (
                      searchResults.map((r) => {
                        const avatarUrl = resolveAvatarUrl(r.avatar, sorceryCards);
                        return (
                        <div key={r.id} className="relative flex items-center gap-3 px-3 py-2.5 transition-colors" style={{ background: `${GOLD} 0.03)`, border: `1px solid ${GOLD} 0.08)`, borderRadius: '8px' }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.2)`; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.08)`; }}
                        >
                          <div className="relative shrink-0">
                            {avatarUrl ? (
                              <img src={avatarUrl} alt="" className="w-9 h-9 rounded-lg object-cover object-top" style={{ border: `1px solid ${GOLD} 0.15)` }} />
                            ) : (
                              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-medium" style={{ background: `${GOLD} 0.08)`, border: `1px solid ${GOLD} 0.15)`, color: TEXT_MUTED }}>{(r.name || '?')[0].toUpperCase()}</div>
                            )}
                            {r.online ? <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full" style={{ background: ACCENT_GOLD, border: `2px solid ${PANEL_BG}` }} /> : null}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate" style={{ color: TEXT_PRIMARY }}>{r.name}</div>
                            <div className={cn('text-[11px]', TIER_COLORS[r.rank?.tier] || '')} style={!TIER_COLORS[r.rank?.tier] ? { color: TEXT_MUTED } : undefined}>
                              {formatRank(r.rank?.tier, r.rank?.division)}
                            </div>
                          </div>
                          {r.isFriend ? (
                            <span className="text-[11px] px-2 py-0.5 rounded-md" style={{ color: `${GOLD} 0.5)`, background: `${GOLD} 0.08)` }}>Friends</span>
                          ) : r.requestSent ? (
                            <span className="text-[11px] px-2 py-0.5 rounded-md" style={{ color: ACCENT_GOLD, background: `${GOLD} 0.08)` }}>{r.autoAccepted ? 'Added!' : 'Pending'}</span>
                          ) : (
                            <button
                              type="button"
                              className="px-3 py-1.5 text-[11px] font-semibold cursor-pointer transition-all"
                              style={GOLD_BTN}
                              onClick={() => this.handleSendRequest(r.id)}
                            >
                              Add Friend
                            </button>
                          )}
                        </div>
                      );})
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-sm" style={{ color: TEXT_MUTED }}>Type a username to search</div>
                    <div className="text-xs mt-1" style={{ color: `${GOLD} 0.2)` }}>Minimum 2 characters</div>
                  </div>
                )}
              </div>
            ) : null}

            {/* === REQUESTS TAB === */}
            {activeTab === 'requests' ? (
              <div className="py-3 px-3">
                {pendingRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-sm" style={{ color: TEXT_MUTED }}>No pending requests</div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {pendingRequests.map((r) => (
                      <div key={r.senderId} className="relative p-3" style={{ background: `${GOLD} 0.04)`, border: `1px solid ${GOLD} 0.12)`, borderRadius: '8px' }}>
                        <FourCorners />
                        <div className="flex items-center gap-3 mb-3">
                          {r.senderAvatar ? (
                            <img src={r.senderAvatar} alt="" className="w-10 h-10 rounded-lg object-cover object-top" style={{ border: `1px solid ${GOLD} 0.15)` }} />
                          ) : (
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-medium" style={{ background: `${GOLD} 0.08)`, border: `1px solid ${GOLD} 0.15)`, color: TEXT_MUTED }}>{(r.senderName || '?')[0].toUpperCase()}</div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate" style={{ color: TEXT_PRIMARY }}>{r.senderName}</div>
                            <div className="text-[11px]" style={{ color: TEXT_MUTED }}>Wants to be your friend</div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="flex-1 py-2 text-xs font-semibold cursor-pointer transition-all"
                            style={GOLD_BTN}
                            onClick={() => this.handleAccept(r.senderId)}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="flex-1 py-2 text-xs cursor-pointer transition-all"
                            style={{ ...BEVELED_BTN, color: TEXT_MUTED, borderRadius: '6px' }}
                            onClick={() => this.handleDecline(r.senderId)}
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Footer */}
          {activeTab === 'friends' && totalFriends > 0 ? (
            <div className="px-5 py-3" style={{ borderTop: `1px solid ${GOLD} 0.06)` }}>
              <span className="text-[10px]" style={{ color: TEXT_MUTED }}>{onlineFriends.length} online &middot; {totalFriends} total</span>
            </div>
          ) : null}

        </div>

        <style>{`
          @keyframes slideInRight {
            from { transform: translateX(100%); }
            to { transform: translateX(0); }
          }
        `}</style>
      </div>
    );
  }

  renderFriendCard(friend, isOffline = false) {
    const { onViewProfile, sorceryCards } = this.props;
    const lastSeenText = friend.lastSeen ? getRelativeTime(friend.lastSeen) : '';
    const level = levelFromXp(friend.xp || 0);
    const activityStyle = ACTIVITY_STYLES[friend.activity] || DEFAULT_ACTIVITY_STYLE;
    const avatarUrl = resolveAvatarUrl(friend.avatar, sorceryCards);

    return (
      <div
        key={friend.id}
        className={cn(
          'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all mb-0.5 cursor-pointer',
          isOffline && 'opacity-40'
        )}
        style={{ ':hover': { background: `${GOLD} 0.04)` } }}
        onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.04)`; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        onClick={() => onViewProfile(friend.id)}
      >
        {/* Avatar */}
        <div className="relative shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-10 h-10 rounded-lg object-cover object-top" style={{ border: `1px solid ${GOLD} 0.12)` }} />
          ) : (
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-medium" style={{ background: `${GOLD} 0.08)`, border: `1px solid ${GOLD} 0.12)`, color: TEXT_MUTED }}>
              {(friend.name || '?')[0].toUpperCase()}
            </div>
          )}
          <div className={cn(
            'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full',
          )} style={{ background: friend.online ? ACCENT_GOLD : `${GOLD} 0.15)`, border: `2px solid ${PANEL_BG}` }} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium truncate" style={{ color: TEXT_PRIMARY }}>{friend.name}</span>
            <span className="text-[10px]" style={{ color: TEXT_MUTED }}>Lv.{level}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {friend.online ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={activityStyle}>
                {ACTIVITY_LABELS[friend.activity] || 'Online'}
              </span>
            ) : (
              <span className="text-[10px]" style={{ color: TEXT_MUTED }}>
                {lastSeenText ? `Last seen ${lastSeenText}` : 'Offline'}
              </span>
            )}
            <span className={cn('text-[10px]', TIER_COLORS[friend.rank?.tier] || '')} style={!TIER_COLORS[friend.rank?.tier] ? { color: TEXT_MUTED } : undefined}>
              {formatRank(friend.rank?.tier, friend.rank?.division)}
            </span>
          </div>
        </div>

        {/* Arrow */}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: `${GOLD} 0.2)` }} className="shrink-0">
          <path d="M4.5 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    );
  }
}

function getRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
