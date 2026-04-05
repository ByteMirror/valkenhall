import { Component } from 'preact';
import { cn } from '../lib/utils';
import { searchPlayers, sendFriendRequest, acceptFriendRequest, declineFriendRequest, removeFriend } from '../utils/friendsApi';
import { formatRank, TIER_COLORS } from '../utils/arena/rankUtils';
import { levelFromXp } from '../utils/arena/profileDefaults';

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

const ACTIVITY_COLORS = {
  'in-match': 'text-red-400 bg-red-500/10 border-red-500/20',
  matchmaking: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
};

export default class FriendsSidebar extends Component {
  constructor(props) {
    super(props);
    this.state = {
      searchQuery: '',
      searchResults: null,
      searchLoading: false,
      activeTab: 'friends', // 'friends' | 'search'
    };
    this.searchTimeout = null;
  }

  componentWillUnmount() {
    clearTimeout(this.searchTimeout);
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
    const { open, onClose, friendListData, onViewProfile } = this.props;
    const { searchQuery, searchResults, searchLoading, activeTab } = this.state;

    if (!open) return null;

    const friends = friendListData?.friends || [];
    const pendingRequests = friendListData?.pendingRequests || [];
    const onlineFriends = friends.filter((f) => f.online);
    const offlineFriends = friends.filter((f) => !f.online);
    const totalFriends = friends.length;
    const pendingCount = pendingRequests.length;

    return (
      <div className="fixed inset-0 z-[70]" onClick={onClose}>
        <div
          className="absolute top-0 right-0 h-full w-[340px] bg-[#0d0d0f]/98 backdrop-blur-xl border-l border-amber-500/10 shadow-[−20px_0_60px_rgba(0,0,0,0.5)] flex flex-col animate-[slideInRight_0.25s_cubic-bezier(0.16,1,0.3,1)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-white arena-heading tracking-wide">Friends</h2>
              <button type="button" className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors" onClick={onClose}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </button>
            </div>
            {/* Tab bar */}
            <div className="flex gap-1 bg-white/[0.04] rounded-lg p-0.5">
              <button
                type="button"
                className={cn(
                  'flex-1 rounded-md py-1.5 text-[11px] font-medium transition-all',
                  activeTab === 'friends' ? 'bg-amber-500/15 text-amber-400 shadow-sm' : 'text-white/40 hover:text-white/60'
                )}
                onClick={() => this.setState({ activeTab: 'friends' })}
              >
                Friends{totalFriends > 0 ? ` (${totalFriends})` : ''}
              </button>
              <button
                type="button"
                className={cn(
                  'flex-1 rounded-md py-1.5 text-[11px] font-medium transition-all relative',
                  activeTab === 'search' ? 'bg-amber-500/15 text-amber-400 shadow-sm' : 'text-white/40 hover:text-white/60'
                )}
                onClick={() => this.setState({ activeTab: 'search' })}
              >
                Add Friends
              </button>
              {pendingCount > 0 ? (
                <button
                  type="button"
                  className={cn(
                    'flex-1 rounded-md py-1.5 text-[11px] font-medium transition-all relative',
                    activeTab === 'requests' ? 'bg-amber-500/15 text-amber-400 shadow-sm' : 'text-white/40 hover:text-white/60'
                  )}
                  onClick={() => this.setState({ activeTab: 'requests' })}
                >
                  Requests
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-[9px] font-bold text-white px-1">{pendingCount}</span>
                </button>
              ) : null}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {/* === FRIENDS TAB === */}
            {activeTab === 'friends' ? (
              <div className="py-2">
                {/* Online section */}
                {onlineFriends.length > 0 ? (
                  <div className="mb-1">
                    <div className="px-5 py-2 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-green-400/70">Online — {onlineFriends.length}</span>
                    </div>
                    <div className="px-2">
                      {onlineFriends.map((f) => this.renderFriendCard(f, false))}
                    </div>
                  </div>
                ) : null}

                {/* Offline section */}
                {offlineFriends.length > 0 ? (
                  <div>
                    <div className="px-5 py-2 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-white/25">Offline — {offlineFriends.length}</span>
                    </div>
                    <div className="px-2">
                      {offlineFriends.map((f) => this.renderFriendCard(f, true))}
                    </div>
                  </div>
                ) : null}

                {/* Empty state */}
                {friends.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-6">
                    <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/15">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" strokeLinecap="round" strokeLinejoin="round"/>
                        <circle cx="9" cy="7" r="4" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M19 8v6M22 11h-6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div className="text-sm font-medium text-white/30 mb-1">No friends yet</div>
                    <div className="text-xs text-white/15 text-center mb-4">Search for other players to add them as friends</div>
                    <button
                      type="button"
                      className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-colors"
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
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    placeholder="Search by username..."
                    className="w-full rounded-lg border border-white/10 bg-white/[0.04] pl-9 pr-3 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-amber-500/30 focus:bg-white/[0.06] transition-all"
                    onInput={this.handleSearch}
                    autoFocus
                  />
                </div>

                {searchResults ? (
                  <div className="flex flex-col gap-1.5">
                    {searchLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="text-center py-8">
                        <div className="text-sm text-white/25">No players found</div>
                        <div className="text-xs text-white/15 mt-1">Try a different username</div>
                      </div>
                    ) : (
                      searchResults.map((r) => (
                        <div key={r.id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/[0.05] px-3 py-2.5 hover:bg-white/[0.05] transition-colors">
                          <div className="relative shrink-0">
                            {r.avatar ? (
                              <img src={r.avatar} alt="" className="w-9 h-9 rounded-lg object-cover object-top" />
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center text-sm text-white/30 font-medium">{(r.name || '?')[0].toUpperCase()}</div>
                            )}
                            {r.online ? <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-[#0d0d0f]" /> : null}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white font-medium truncate">{r.name}</div>
                            <div className={cn('text-[11px]', TIER_COLORS[r.rank?.tier] || 'text-white/40')}>
                              {formatRank(r.rank?.tier, r.rank?.division)}
                            </div>
                          </div>
                          {r.isFriend ? (
                            <span className="text-[11px] text-green-400/60 bg-green-500/10 px-2 py-0.5 rounded-md">Friends</span>
                          ) : r.requestSent ? (
                            <span className="text-[11px] text-amber-400/60 bg-amber-500/10 px-2 py-0.5 rounded-md">{r.autoAccepted ? 'Added!' : 'Pending'}</span>
                          ) : (
                            <button
                              type="button"
                              className="rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-semibold text-black hover:bg-amber-400 transition-colors shadow-sm"
                              onClick={() => this.handleSendRequest(r.id)}
                            >
                              Add Friend
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-sm text-white/20">Type a username to search</div>
                    <div className="text-xs text-white/10 mt-1">Minimum 2 characters</div>
                  </div>
                )}
              </div>
            ) : null}

            {/* === REQUESTS TAB === */}
            {activeTab === 'requests' ? (
              <div className="py-3 px-3">
                {pendingRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-sm text-white/25">No pending requests</div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {pendingRequests.map((r) => (
                      <div key={r.senderId} className="rounded-xl bg-amber-500/[0.04] border border-amber-500/10 p-3">
                        <div className="flex items-center gap-3 mb-3">
                          {r.senderAvatar ? (
                            <img src={r.senderAvatar} alt="" className="w-10 h-10 rounded-lg object-cover object-top" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center text-lg text-white/30 font-medium">{(r.senderName || '?')[0].toUpperCase()}</div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white font-medium truncate">{r.senderName}</div>
                            <div className="text-[11px] text-white/30">Wants to be your friend</div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="flex-1 rounded-lg bg-green-500 py-2 text-xs font-semibold text-black hover:bg-green-400 transition-colors"
                            onClick={() => this.handleAccept(r.senderId)}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className="flex-1 rounded-lg border border-white/10 py-2 text-xs text-white/50 hover:bg-white/5 transition-colors"
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

          {/* Footer — friend count */}
          {activeTab === 'friends' && totalFriends > 0 ? (
            <div className="px-5 py-3 border-t border-white/[0.04] flex items-center justify-between">
              <span className="text-[10px] text-white/20">{onlineFriends.length} online &middot; {totalFriends} total</span>
              <button
                type="button"
                className="text-[10px] text-amber-400/50 hover:text-amber-400/80 transition-colors"
                onClick={() => this.setState({ activeTab: 'search' })}
              >
                + Add more
              </button>
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
    const { onViewProfile } = this.props;
    const lastSeenText = friend.lastSeen ? getRelativeTime(friend.lastSeen) : '';
    const level = levelFromXp(friend.xp || 0);
    const activityStyle = ACTIVITY_COLORS[friend.activity] || 'text-green-400/70 bg-green-500/10 border-green-500/20';

    return (
      <div
        key={friend.id}
        className={cn(
          'flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all hover:bg-white/[0.04] mb-0.5',
          isOffline && 'opacity-40'
        )}
        onClick={() => onViewProfile(friend.id)}
      >
        {/* Avatar */}
        <div className="relative shrink-0">
          {friend.avatar ? (
            <img src={friend.avatar} alt="" className="w-10 h-10 rounded-lg object-cover object-top border border-white/[0.08]" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-white/10 to-white/5 border border-white/[0.08] flex items-center justify-center text-sm text-white/30 font-medium">
              {(friend.name || '?')[0].toUpperCase()}
            </div>
          )}
          <div className={cn(
            'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0d0d0f]',
            friend.online ? 'bg-green-500' : 'bg-white/20'
          )} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-white font-medium truncate">{friend.name}</span>
            <span className="text-[10px] text-white/20">Lv.{level}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {friend.online ? (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded border', activityStyle)}>
                {ACTIVITY_LABELS[friend.activity] || 'Online'}
              </span>
            ) : (
              <span className="text-[10px] text-white/20">
                {lastSeenText ? `Last seen ${lastSeenText}` : 'Offline'}
              </span>
            )}
            <span className={cn('text-[10px]', TIER_COLORS[friend.rank?.tier] || 'text-white/30')}>
              {formatRank(friend.rank?.tier, friend.rank?.division)}
            </span>
          </div>
        </div>

        {/* Arrow */}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-white/15 shrink-0">
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
