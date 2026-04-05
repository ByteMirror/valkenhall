import { Component } from 'preact';
import { cn } from '../lib/utils';
import { getPublicProfile } from '../utils/friendsApi';
import { xpProgressInLevel, levelFromXp } from '../utils/arena/profileDefaults';
import { formatRank, TIER_COLORS, TIER_LABELS } from '../utils/arena/rankUtils';
import { ACHIEVEMENTS } from '../utils/arena/achievements';

function resolveAvatarUrl(cardId, sorceryCards) {
  if (!cardId || !sorceryCards) return null;
  const card = sorceryCards.find((c) => c.unique_id === cardId);
  return card?.printings?.[0]?.image_url || null;
}

const ACTIVITY_LABELS = {
  hub: 'In Hub', store: 'In Store', deckbuilder: 'Deck Builder',
  'in-match': 'In Match', 'pack-opening': 'Opening Packs',
  'deck-select': 'Selecting Deck', matchmaking: 'In Queue', 'auction-house': 'Auction House',
};

export default class FriendProfileOverlay extends Component {
  constructor(props) {
    super(props);
    this.state = {
      profile: null,
      loading: true,
      error: null,
      showUnfriendConfirm: false,
    };
  }

  componentDidMount() {
    this.loadProfile();
  }

  async loadProfile() {
    try {
      const profile = await getPublicProfile(this.props.profileId);
      this.setState({ profile, loading: false });
    } catch (err) {
      this.setState({ error: err.message, loading: false });
    }
  }

  render() {
    const { onClose, onInvite, onSpectate, onTrade, onRemoveFriend, profileId, isFriend } = this.props;
    const { profile, loading, error, showUnfriendConfirm } = this.state;

    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-md" onClick={onClose}>
        <div className="w-full max-w-lg max-h-[85vh] rounded-2xl border border-white/[0.08] bg-[#111114] shadow-[0_24px_80px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center text-red-400 py-16 px-6">
              <div className="text-sm">{error}</div>
              <button type="button" className="mt-3 text-xs text-white/40 hover:text-white/60" onClick={onClose}>Close</button>
            </div>
          ) : profile ? this.renderProfile(profile) : null}
        </div>
      </div>
    );
  }

  renderProfile(profile) {
    const { onClose, onInvite, onSpectate, onTrade, onRemoveFriend, profileId, isFriend, sorceryCards } = this.props;
    const { showUnfriendConfirm } = this.state;
    const avatarUrl = resolveAvatarUrl(profile.avatar, sorceryCards);

    const progress = xpProgressInLevel(profile.xp || 0);
    const level = progress.level;
    const rankColor = TIER_COLORS[profile.rank?.tier] || 'text-white';
    const tierLabel = TIER_LABELS?.[profile.rank?.tier] || profile.rank?.tier || 'Unranked';
    const wins = profile.wins || 0;
    const losses = profile.losses || 0;
    const total = wins + losses;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
    const isOnline = profile.online;
    const activity = profile.activity;
    const canInvite = isOnline && activity !== 'in-match';
    const canSpectate = isOnline && activity === 'in-match';
    const canTrade = isOnline;

    // Most played decks (as proxy for most played avatars/heroes)
    const deckNames = (profile.decks || []).map(d => d.name);

    // Recent match history
    const recentMatches = profile.matchHistory || [];

    // Achievements
    const achievements = profile.achievements || [];

    // Per-set collection stats
    const setNameMap = { Gothic: 'gothic', 'Arthurian Legends': 'arthurian', Beta: 'beta' };
    const setStats = { gothic: { owned: 0, total: 0, label: 'Gothic', color: 'bg-purple-500/70' }, arthurian: { owned: 0, total: 0, label: 'Arthurian', color: 'bg-blue-500/70' }, beta: { owned: 0, total: 0, label: 'Beta', color: 'bg-emerald-500/70' } };
    const ownedCardIds = new Set((profile.collection || []).map(c => c.cardId));
    if (sorceryCards) {
      for (const card of sorceryCards) {
        const cardSets = new Set((card.printings || []).map(p => p.set_id));
        for (const setName of cardSets) {
          const key = setNameMap[setName];
          if (key) {
            setStats[key].total++;
            if (ownedCardIds.has(card.unique_id)) setStats[key].owned++;
          }
        }
      }
    }

    return (
      <div className="flex flex-col max-h-[85vh]">
        {/* Hero banner */}
        <div className="relative px-6 pt-6 pb-5 bg-gradient-to-b from-white/[0.03] to-transparent">
          {/* Close button */}
          <button
            type="button"
            className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-white/25 hover:text-white/50 hover:bg-white/5 transition-colors"
            onClick={onClose}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>

          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div className="relative shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-20 h-20 rounded-xl object-cover object-top border-2 border-white/[0.08] shadow-lg" />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-600/10 border-2 border-amber-500/20 flex items-center justify-center text-3xl text-amber-400/60 font-bold">
                  {(profile.name || '?')[0].toUpperCase()}
                </div>
              )}
              {/* Online indicator */}
              <div className={cn(
                'absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-[3px] border-[#111114]',
                isOnline ? 'bg-green-500' : 'bg-white/20'
              )} />
            </div>

            {/* Name + status */}
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-white truncate arena-heading">{profile.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-amber-400 text-sm font-semibold">Level {level}</span>
                <span className="text-white/15">|</span>
                <span className={cn('text-sm font-semibold', rankColor)}>
                  {formatRank(profile.rank?.tier, profile.rank?.division)}
                </span>
              </div>
              {isOnline ? (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[11px] text-green-400/80">{ACTIVITY_LABELS[activity] || 'Online'}</span>
                </div>
              ) : (
                <div className="text-[11px] text-white/25 mt-1.5">Offline</div>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-4 gap-2 mb-4">
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-center">
              <div className="text-xl font-bold text-white tabular-nums">{total}</div>
              <div className="text-[10px] text-white/30 mt-0.5">Matches</div>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-center">
              <div className="text-xl font-bold text-green-400 tabular-nums">{wins}</div>
              <div className="text-[10px] text-white/30 mt-0.5">Wins</div>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-center">
              <div className="text-xl font-bold text-red-400 tabular-nums">{losses}</div>
              <div className="text-[10px] text-white/30 mt-0.5">Losses</div>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-center">
              <div className="text-xl font-bold text-white/70 tabular-nums">{winRate}%</div>
              <div className="text-[10px] text-white/30 mt-0.5">Win Rate</div>
            </div>
          </div>

          {/* Collection */}
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/25">Collection</div>
              <div className="text-[10px] text-white/30">{profile.uniqueCards || 0} unique &middot; {profile.collectionSize || 0} total</div>
            </div>
            <div className="flex flex-col gap-1.5">
              {['gothic', 'arthurian', 'beta'].map((key) => {
                const s = setStats[key];
                const pct = s.total > 0 ? Math.round((s.owned / s.total) * 100) : 0;
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[10px] text-white/40 w-16 truncate">{s.label}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all', s.color)} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] text-white/30 tabular-nums w-14 text-right">{s.owned}/{s.total}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rank Progress */}
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 mb-4">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-1.5">Rank Progress</div>
            <div className={cn('text-sm font-semibold', rankColor)}>{tierLabel}</div>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div className="h-full rounded-full bg-amber-500/60 transition-all" style={{ width: `${profile.rank?.lp || 0}%` }} />
              </div>
              <span className="text-[10px] text-white/30 tabular-nums">{profile.rank?.lp || 0} LP</span>
            </div>
          </div>

          {/* Decks / most played */}
          {deckNames.length > 0 ? (
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 mb-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-2">Decks</div>
              <div className="flex flex-wrap gap-1.5">
                {deckNames.map((name, i) => (
                  <span key={i} className="rounded-md bg-white/[0.05] border border-white/[0.06] px-2.5 py-1 text-[11px] text-white/50">{name}</span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Recent matches */}
          {recentMatches.length > 0 ? (
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 mb-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-2">Recent Matches</div>
              <div className="flex flex-col gap-1">
                {recentMatches.slice(0, 5).map((m, i) => (
                  <div key={i} className="flex items-center gap-2 py-1">
                    <span className={cn('text-xs font-bold w-4', m.won ? 'text-green-400' : 'text-red-400')}>
                      {m.won ? 'W' : 'L'}
                    </span>
                    <span className="text-xs text-white/50 flex-1 truncate">vs {m.opponentName || 'Opponent'}</span>
                    {m.coinsEarned ? <span className="text-[10px] text-yellow-400/60 tabular-nums">+{m.coinsEarned}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Achievements */}
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 mb-4">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-white/25 mb-2">
              Achievements ({achievements.length}/{ACHIEVEMENTS.length})
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {ACHIEVEMENTS.map((a) => {
                const unlocked = achievements.includes(a.id);
                return (
                  <div
                    key={a.id}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-2.5 py-1.5 border transition-colors',
                      unlocked
                        ? 'border-amber-500/20 bg-amber-500/[0.06]'
                        : 'border-white/[0.04] bg-white/[0.01] opacity-35'
                    )}
                  >
                    <span className="text-sm shrink-0">{unlocked ? a.icon : '🔒'}</span>
                    <div className="min-w-0 flex-1">
                      <div className={cn('text-[11px] font-medium truncate', unlocked ? 'text-white/80' : 'text-white/30')}>{a.name}</div>
                      <div className={cn('text-[9px] truncate', unlocked ? 'text-white/40' : 'text-white/15')}>{a.description}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="px-6 py-4 border-t border-white/[0.06] bg-white/[0.01]">
          {showUnfriendConfirm ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-white/50 flex-1">Remove {profile.name} from friends?</span>
              <button
                type="button"
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/50 hover:bg-white/5 transition-colors"
                onClick={() => this.setState({ showUnfriendConfirm: false })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500 transition-colors"
                onClick={() => { if (onRemoveFriend) onRemoveFriend(profileId); onClose(); }}
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {canInvite ? (
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-green-500 py-2.5 text-xs font-semibold text-black hover:bg-green-400 transition-colors"
                  onClick={() => { if (onInvite) onInvite(profileId); onClose(); }}
                >
                  Invite to Match
                </button>
              ) : null}
              {canSpectate ? (
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-blue-500 py-2.5 text-xs font-semibold text-white hover:bg-blue-400 transition-colors"
                  onClick={() => { if (onSpectate) onSpectate(profileId); onClose(); }}
                >
                  Spectate Match
                </button>
              ) : null}
              {canTrade ? (
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-purple-500/20 border border-purple-500/30 py-2.5 text-xs font-semibold text-purple-400 hover:bg-purple-500/30 transition-colors"
                  onClick={() => { if (onTrade) onTrade(profileId); onClose(); }}
                >
                  Trade
                </button>
              ) : null}
              {!canInvite && !canSpectate && !canTrade ? (
                <div className="flex-1 text-center text-xs text-white/20 py-2.5">Player is offline</div>
              ) : null}
              {isFriend !== false ? (
                <button
                  type="button"
                  className="rounded-lg border border-white/[0.08] px-3 py-2.5 text-xs text-white/30 hover:text-red-400 hover:border-red-500/20 hover:bg-red-500/5 transition-colors"
                  onClick={() => this.setState({ showUnfriendConfirm: true })}
                >
                  Remove Friend
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    );
  }
}
