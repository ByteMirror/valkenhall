import { Component } from 'preact';
import { cn } from '../lib/utils';
import { getPublicProfile } from '../utils/friendsApi';
import { xpProgressInLevel, levelFromXp } from '../utils/arena/profileDefaults';
import { formatRank, TIER_COLORS, TIER_LABELS } from '../utils/arena/rankUtils';
import { ACHIEVEMENTS } from '../utils/arena/achievements';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, PANEL_BG, ACCENT_GOLD,
  DIALOG_STYLE, GOLD_BTN, BEVELED_BTN, DANGER_BTN, VIGNETTE, COIN_COLOR,
  FourCorners, OrnamentalDivider, SECTION_HEADER_STYLE,
} from '../lib/medievalTheme';

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

const STAT_CARD = {
  background: `${GOLD} 0.04)`,
  border: `1px solid ${GOLD} 0.1)`,
  borderRadius: '8px',
};

const SECTION_CARD = {
  background: `${GOLD} 0.03)`,
  border: `1px solid ${GOLD} 0.1)`,
  borderRadius: '8px',
};

const SET_COLORS = {
  gothic: `linear-gradient(90deg, rgba(168,120,50,0.5) 0%, rgba(168,120,50,0) 100%)`,
  arthurian: `linear-gradient(90deg, rgba(107,140,174,0.5) 0%, rgba(107,140,174,0) 100%)`,
  beta: `linear-gradient(90deg, rgba(124,110,160,0.5) 0%, rgba(124,110,160,0) 100%)`,
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
    const { onClose } = this.props;
    const { profile, loading, error } = this.state;

    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
        <div className="fixed inset-0 pointer-events-none" style={{ background: VIGNETTE }} />
        <div
          className="relative w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
          style={{ ...DIALOG_STYLE, borderRadius: '12px' }}
          onClick={(e) => e.stopPropagation()}
        >
          <FourCorners />
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 rounded-full animate-spin" style={{ border: `2px solid ${GOLD} 0.2)`, borderTopColor: ACCENT_GOLD }} />
            </div>
          ) : error ? (
            <div className="text-center py-16 px-6">
              <div className="text-sm" style={{ color: '#c45050' }}>{error}</div>
              <button type="button" className="mt-3 text-xs cursor-pointer" style={{ color: TEXT_MUTED }} onClick={onClose}>Close</button>
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

    const deckNames = (profile.decks || []).map(d => d.name);
    const recentMatches = profile.matchHistory || [];
    const achievements = profile.achievements || [];

    const setNameMap = { Gothic: 'gothic', 'Arthurian Legends': 'arthurian', Beta: 'beta' };
    const setStats = { gothic: { owned: 0, total: 0, label: 'Gothic' }, arthurian: { owned: 0, total: 0, label: 'Arthurian' }, beta: { owned: 0, total: 0, label: 'Beta' } };
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
        <div className="relative px-6 pt-6 pb-5" style={{ background: `linear-gradient(180deg, ${GOLD} 0.04) 0%, transparent 100%)` }}>
          <button
            type="button"
            className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
            style={{ color: TEXT_MUTED }}
            onMouseEnter={(e) => { e.currentTarget.style.color = TEXT_BODY; e.currentTarget.style.background = `${GOLD} 0.08)`; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = TEXT_MUTED; e.currentTarget.style.background = 'transparent'; }}
            onClick={onClose}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>

          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-20 h-20 rounded-xl object-cover object-top shadow-lg" style={{ border: `2px solid ${GOLD} 0.3)` }} />
              ) : (
                <div className="w-20 h-20 rounded-xl flex items-center justify-center text-3xl font-bold" style={{ background: `${GOLD} 0.1)`, border: `2px solid ${GOLD} 0.25)`, color: ACCENT_GOLD }}>
                  {(profile.name || '?')[0].toUpperCase()}
                </div>
              )}
              <div
                className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full"
                style={{ background: isOnline ? ACCENT_GOLD : `${GOLD} 0.15)`, border: `3px solid rgba(15,12,6,0.98)` }}
              />
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold truncate arena-heading" style={{ color: TEXT_PRIMARY, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{profile.name}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-semibold" style={{ color: ACCENT_GOLD }}>Level {level}</span>
                <span style={{ color: `${GOLD} 0.2)` }}>|</span>
                <span className={cn('text-sm font-semibold', rankColor)}>
                  {formatRank(profile.rank?.tier, profile.rank?.division)}
                </span>
              </div>
              {isOnline ? (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ACCENT_GOLD }} />
                  <span className="text-[11px]" style={{ color: `${GOLD} 0.6)` }}>{ACTIVITY_LABELS[activity] || 'Online'}</span>
                </div>
              ) : (
                <div className="text-[11px] mt-1.5" style={{ color: TEXT_MUTED }}>Offline</div>
              )}
            </div>
          </div>
        </div>

        <OrnamentalDivider />

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Stats grid */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[
              { val: total, label: 'Matches', color: TEXT_PRIMARY },
              { val: wins, label: 'Wins', color: '#6ab04c' },
              { val: losses, label: 'Losses', color: '#c45050' },
              { val: `${winRate}%`, label: 'Win Rate', color: TEXT_BODY },
            ].map((s) => (
              <div key={s.label} className="p-3 text-center" style={STAT_CARD}>
                <div className="text-xl font-bold tabular-nums" style={{ color: s.color }}>{s.val}</div>
                <div className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Collection */}
          <div className="p-3 mb-4" style={SECTION_CARD}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest" style={SECTION_HEADER_STYLE}>Collection</div>
              <div className="text-[10px]" style={{ color: TEXT_MUTED }}>{profile.uniqueCards || 0} unique &middot; {profile.collectionSize || 0} total</div>
            </div>
            <div className="flex flex-col gap-1.5">
              {['gothic', 'arthurian', 'beta'].map((key) => {
                const s = setStats[key];
                const pct = s.total > 0 ? Math.round((s.owned / s.total) * 100) : 0;
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[10px] w-16 truncate" style={{ color: TEXT_MUTED }}>{s.label}</span>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: `${GOLD} 0.06)` }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: SET_COLORS[key] || `${GOLD} 0.4)` }} />
                    </div>
                    <span className="text-[10px] tabular-nums w-14 text-right" style={{ color: TEXT_MUTED }}>{s.owned}/{s.total}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Rank Progress */}
          <div className="p-3 mb-4" style={SECTION_CARD}>
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={SECTION_HEADER_STYLE}>Rank Progress</div>
            <div className={cn('text-sm font-semibold', rankColor)}>{tierLabel}</div>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: `${GOLD} 0.06)` }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${profile.rank?.lp || 0}%`, background: `linear-gradient(90deg, #8b6914, ${ACCENT_GOLD}, #c49a38)` }} />
              </div>
              <span className="text-[10px] tabular-nums" style={{ color: TEXT_MUTED }}>{profile.rank?.lp || 0} LP</span>
            </div>
          </div>

          {/* Decks */}
          {deckNames.length > 0 ? (
            <div className="p-3 mb-4" style={SECTION_CARD}>
              <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={SECTION_HEADER_STYLE}>Decks</div>
              <div className="flex flex-wrap gap-1.5">
                {deckNames.map((name, i) => (
                  <span key={i} className="px-2.5 py-1 text-[11px]" style={{ background: `${GOLD} 0.06)`, border: `1px solid ${GOLD} 0.1)`, borderRadius: '4px', color: TEXT_BODY }}>{name}</span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Recent matches */}
          {recentMatches.length > 0 ? (
            <div className="p-3 mb-4" style={SECTION_CARD}>
              <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={SECTION_HEADER_STYLE}>Recent Matches</div>
              <div className="flex flex-col gap-1">
                {recentMatches.slice(0, 5).map((m, i) => (
                  <div key={i} className="flex items-center gap-2 py-1" style={{ borderBottom: i < 4 ? `1px solid ${GOLD} 0.04)` : 'none' }}>
                    <span className="text-xs font-bold w-4" style={{ color: m.won ? '#6ab04c' : '#c45050' }}>
                      {m.won ? 'W' : 'L'}
                    </span>
                    <span className="text-xs flex-1 truncate" style={{ color: TEXT_MUTED }}>vs {m.opponentName || 'Opponent'}</span>
                    {m.coinsEarned ? <span className="text-[10px] tabular-nums" style={{ color: `${GOLD} 0.5)` }}>+{m.coinsEarned}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Achievements */}
          <div className="p-3 mb-4" style={SECTION_CARD}>
            <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={SECTION_HEADER_STYLE}>
              Achievements ({achievements.length}/{ACHIEVEMENTS.length})
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {ACHIEVEMENTS.map((a) => {
                const unlocked = achievements.includes(a.id);
                return (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors"
                    style={unlocked
                      ? { border: `1px solid ${GOLD} 0.2)`, background: `${GOLD} 0.06)` }
                      : { border: `1px solid ${GOLD} 0.04)`, background: `${GOLD} 0.01)`, opacity: 0.35 }
                    }
                  >
                    <span className="text-sm shrink-0">{unlocked ? a.icon : '\u{1F512}'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-medium truncate" style={{ color: unlocked ? TEXT_PRIMARY : TEXT_MUTED }}>{a.name}</div>
                      <div className="text-[9px] truncate" style={{ color: unlocked ? TEXT_MUTED : `${GOLD} 0.15)` }}>{a.description}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="px-6 py-4" style={{ borderTop: `1px solid ${GOLD} 0.12)`, background: `${GOLD} 0.02)` }}>
          {showUnfriendConfirm ? (
            <div className="flex items-center gap-3">
              <span className="text-xs flex-1" style={{ color: TEXT_MUTED }}>Remove {profile.name} from friends?</span>
              <button
                type="button"
                className="px-3 py-1.5 text-xs cursor-pointer transition-all"
                style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
                onClick={() => this.setState({ showUnfriendConfirm: false })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-xs font-medium cursor-pointer transition-all"
                style={{ ...DANGER_BTN, borderRadius: '6px' }}
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
                  className="flex-1 py-2.5 text-xs font-semibold cursor-pointer transition-all"
                  style={GOLD_BTN}
                  onClick={() => { if (onInvite) onInvite(profileId); onClose(); }}
                >
                  Invite to Match
                </button>
              ) : null}
              {canSpectate ? (
                <button
                  type="button"
                  className="flex-1 py-2.5 text-xs font-semibold cursor-pointer transition-all"
                  style={{ ...BEVELED_BTN, color: TEXT_PRIMARY, borderRadius: '6px' }}
                  onClick={() => { if (onSpectate) onSpectate(profileId); onClose(); }}
                >
                  Spectate Match
                </button>
              ) : null}
              {canTrade ? (
                <button
                  type="button"
                  className="flex-1 py-2.5 text-xs font-semibold cursor-pointer transition-all"
                  style={{ ...BEVELED_BTN, color: ACCENT_GOLD, borderRadius: '6px' }}
                  onClick={() => { if (onTrade) onTrade(profileId); onClose(); }}
                >
                  Trade
                </button>
              ) : null}
              {!canInvite && !canSpectate && !canTrade ? (
                <div className="flex-1 text-center text-xs py-2.5" style={{ color: TEXT_MUTED }}>Player is offline</div>
              ) : null}
              {isFriend !== false ? (
                <button
                  type="button"
                  className="px-3 py-2.5 text-xs cursor-pointer transition-all"
                  style={{ ...BEVELED_BTN, color: TEXT_MUTED, borderRadius: '6px' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#c45050'; e.currentTarget.style.borderColor = 'rgba(180,60,60,0.3)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = TEXT_MUTED; e.currentTarget.style.borderColor = `${GOLD} 0.3)`; }}
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
