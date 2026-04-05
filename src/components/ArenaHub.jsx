import { Component } from 'preact';
import { xpProgressInLevel } from '../utils/arena/profileDefaults';
import { ACHIEVEMENTS, getAchievementProgress } from '../utils/arena/achievements';
import { getSoundSettings, saveSoundSettings } from '../utils/arena/soundSettings';
import { updateMusicVolume } from '../utils/arena/musicManager';
import { cn } from '../lib/utils';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { formatRank, TIER_COLORS, TIER_LABELS, TIERS } from '../utils/arena/rankUtils';

const GOLD = 'rgba(180, 140, 60,';
const GOLD_TEXT = 'rgba(201, 168, 76,';
const PARCHMENT = 'rgba(228, 213, 160,';

/* ── Atmospheric background layers ─────────────────────── */
const BG_ATMOSPHERE = [
  'radial-gradient(ellipse 80% 50% at 50% 30%, rgba(180,140,60,0.05) 0%, transparent 70%)',
  'radial-gradient(ellipse 60% 40% at 50% 80%, rgba(120,80,30,0.06) 0%, transparent 60%)',
  'radial-gradient(ellipse 100% 100% at 50% 50%, rgba(30,20,8,0.4) 0%, transparent 80%)',
  'radial-gradient(circle at 20% 20%, rgba(100,60,20,0.03) 0%, transparent 40%)',
  'radial-gradient(circle at 80% 70%, rgba(100,60,20,0.03) 0%, transparent 40%)',
  '#08080a',
].join(', ');

/* ── Shared style fragments ─────────────────────────────── */
const BEVELED_BTN = {
  background: `linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(0,0,0,0.12) 100%)`,
  border: `1px solid ${GOLD} 0.3)`,
  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 8px rgba(0,0,0,0.4)`,
  borderRadius: '8px',
  textShadow: '0 1px 2px rgba(0,0,0,0.5)',
};

const HERO_BTN_GREEN = {
  background: `linear-gradient(180deg, rgba(34,197,94,0.22) 0%, rgba(16,120,50,0.14) 100%)`,
  border: '2px solid rgba(34,197,94,0.4)',
  boxShadow: '0 0 30px rgba(34,197,94,0.12), 0 0 60px rgba(34,197,94,0.06), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.2)',
  borderRadius: '14px',
  textShadow: '0 1px 3px rgba(0,0,0,0.6)',
};

function OrnamentalDivider({ className }) {
  return (
    <div className={cn('flex items-center gap-4 select-none', className)}>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, transparent 0%, ${GOLD} 0.25) 50%, transparent 100%)` }} />
      <span style={{ color: `${GOLD} 0.35)`, fontSize: '8px', lineHeight: 1 }}>◆</span>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, transparent 0%, ${GOLD} 0.25) 50%, transparent 100%)` }} />
    </div>
  );
}

export default class ArenaHub extends Component {
  constructor(props) {
    super(props);
    this.state = {
      showAvatarPicker: false,
      showSettings: false,
      showResetConfirm: false,
      soundSettings: getSoundSettings(),
      leaderboard: null,
      leaderboardLoading: false,
      leaderboardFilter: 'all',
      leaderboardSearch: '',
    };
  }

  componentDidMount() {
    this.loadLeaderboard();
  }

  loadLeaderboard = async () => {
    this.setState({ leaderboardLoading: true });
    try {
      const { getLeaderboard } = await import('../utils/arena/matchmakingApi');
      const data = await getLeaderboard();
      this.setState({ leaderboard: data, leaderboardLoading: false });
    } catch {
      this.setState({ leaderboard: [], leaderboardLoading: false });
    }
  };

  getOwnedAvatars() {
    const { profile, sorceryCards } = this.props;
    if (!sorceryCards || !profile?.collection) return [];
    const ownedIds = new Set(profile.collection.map((c) => c.cardId));
    return sorceryCards.filter((c) => c.type === 'Avatar' && ownedIds.has(c.unique_id));
  }

  getAvatarImageUrl(cardId) {
    const { sorceryCards } = this.props;
    if (!sorceryCards || !cardId) return null;
    const card = sorceryCards.find((c) => c.unique_id === cardId);
    return card?.printings?.[0]?.image_url || null;
  }

  getFilteredLeaderboard() {
    const { leaderboard, leaderboardFilter, leaderboardSearch } = this.state;
    if (!leaderboard) return [];
    let filtered = leaderboard;
    if (leaderboardFilter !== 'all') {
      filtered = filtered.filter((p) => p.tier === leaderboardFilter);
    }
    if (leaderboardSearch.trim()) {
      const q = leaderboardSearch.trim().toLowerCase();
      filtered = filtered.filter((p) => p.name.toLowerCase().includes(q));
    }
    return filtered;
  }

  render() {
    const { profile, rank, onPlayMatch, onFindMatch, onOpenStore, onOpenDeckBuilder, onOpenAuctionHouse, onUpdateAvatar, onResetProfile, onExit, friendListData, onToggleFriends } = this.props;
    const { showAvatarPicker, showSettings, showResetConfirm, leaderboardLoading, leaderboardFilter, leaderboardSearch } = this.state;
    const progress = xpProgressInLevel(profile.xp);
    const level = progress.level;
    const collectionSize = profile.collection.reduce((sum, c) => sum + c.quantity, 0);
    const uniqueCards = profile.collection.length;
    const avatarUrl = this.getAvatarImageUrl(profile.profileAvatar);
    const rankColor = TIER_COLORS[rank?.tier] || 'text-white';
    const filteredLeaderboard = this.getFilteredLeaderboard();
    const winCount = profile.matchHistory.filter((m) => m.won).length;
    const totalMatches = profile.matchHistory.length;
    const winRate = totalMatches > 0 ? Math.round((winCount / totalMatches) * 100) : 0;

    const { sorceryCards } = this.props;
    const ownedCardIds = new Set((profile.collection || []).map((c) => c.cardId));
    const setNameMap = { Gothic: 'gothic', 'Arthurian Legends': 'arthurian', Beta: 'beta' };
    const setStats = { gothic: { owned: 0, total: 0 }, arthurian: { owned: 0, total: 0 }, beta: { owned: 0, total: 0 } };
    if (sorceryCards) {
      for (const card of sorceryCards) {
        const cardSets = new Set((card.printings || []).map((p) => p.set_id));
        for (const setName of cardSets) {
          const key = setNameMap[setName];
          if (key) {
            setStats[key].total++;
            if (ownedCardIds.has(card.unique_id)) setStats[key].owned++;
          }
        }
      }
    }

    const unlockedCount = (profile.achievements || []).length;

    return (
      <div className="fixed inset-0 z-50 flex flex-col overflow-hidden select-none" style={{ background: BG_ATMOSPHERE }}>

        {/* Vignette overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 50%, transparent 40%, rgba(0,0,0,0.5) 100%)' }} />

        {/* ─── TOP BAR ─────────────────────────────────────── */}
        <div className="relative z-10 flex items-center px-6 py-2" style={{ borderBottom: `1px solid ${GOLD} 0.15)`, background: 'linear-gradient(180deg, rgba(20,16,8,0.6) 0%, transparent 100%)' }}>
          <span className="text-lg font-bold arena-heading tracking-wide" style={{ color: '#c9a84c', textShadow: '0 0 20px rgba(200,160,60,0.2)' }}>Valkenhall</span>

          <div className="ml-auto flex items-center gap-5">
            {/* Gold display */}
            <div className="flex items-center gap-1.5">
              <span style={{ color: '#f0d060', fontSize: '14px', textShadow: '0 0 8px rgba(240,208,96,0.3)' }}>●</span>
              <span className="text-lg font-bold tabular-nums" style={{ color: '#f0d060', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{profile.coins}</span>
              <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: `${GOLD} 0.4)` }}>gold</span>
            </div>

            {/* Friends button */}
            <button
              type="button"
              className="relative px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
              style={{ ...BEVELED_BTN, color: `${GOLD_TEXT} 0.7)` }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.5)`; e.currentTarget.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.1), 0 0 15px ${GOLD} 0.1)`; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.3)`; e.currentTarget.style.boxShadow = BEVELED_BTN.boxShadow; }}
              onClick={onToggleFriends}
            >
              Friends
              {(friendListData?.pendingCount || 0) > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-red-500 flex items-center justify-center text-[9px] font-bold text-white px-1" style={{ boxShadow: '0 0 8px rgba(239,68,68,0.5)' }}>
                  {friendListData.pendingCount}
                </span>
              )}
            </button>

            {/* Settings button */}
            <button
              type="button"
              className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
              style={{ ...BEVELED_BTN, color: `${GOLD_TEXT} 0.7)` }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.5)`; e.currentTarget.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.1), 0 0 15px ${GOLD} 0.1)`; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.3)`; e.currentTarget.style.boxShadow = BEVELED_BTN.boxShadow; }}
              onClick={() => this.setState({ showSettings: true })}
            >
              Settings
            </button>
          </div>
        </div>

        {/* ─── MAIN CONTENT ────────────────────────────────── */}
        <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
          <div className="max-w-[1400px] mx-auto px-8 w-full flex flex-col overflow-hidden flex-1">

            {/* ─── HERO: PLAYER IDENTITY ──────────────────── */}
            <div className="flex items-center gap-8 py-5 shrink-0">
              {/* Avatar with ornate frame */}
              <button
                type="button"
                className="relative group shrink-0"
                onClick={() => this.setState({ showAvatarPicker: true })}
                title="Click to change avatar"
              >
                <div className="absolute -inset-2 rounded-2xl" style={{ border: `2px solid ${GOLD} 0.35)`, boxShadow: `0 0 25px ${GOLD} 0.12), 0 0 50px ${GOLD} 0.06)` }} />
                <div className="absolute -inset-0.5 rounded-xl" style={{ border: `1px solid ${GOLD} 0.6)` }} />

                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-20 h-20 rounded-xl object-cover object-top relative z-10" style={{ boxShadow: `0 4px 20px rgba(0,0,0,0.6)` }} />
                ) : (
                  <div className="w-20 h-20 rounded-xl flex items-center justify-center text-2xl relative z-10" style={{ background: `${GOLD} 0.1)`, color: `${GOLD} 0.4)` }}>?</div>
                )}

                <div
                  className="absolute -bottom-2 -right-2 z-20 flex items-center justify-center"
                  style={{
                    width: '32px', height: '32px',
                    background: `linear-gradient(135deg, rgba(200,160,50,0.3) 0%, rgba(120,90,30,0.2) 100%)`,
                    border: `2px solid ${GOLD} 0.6)`,
                    borderRadius: '8px',
                    boxShadow: `0 2px 10px rgba(0,0,0,0.5), 0 0 12px ${GOLD} 0.15)`,
                  }}
                >
                  <span className="text-sm font-bold" style={{ color: '#d4a843', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{level}</span>
                </div>

                <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-all z-20">
                  <span className="text-white/0 group-hover:text-white/80 text-xs font-medium transition-all" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>Change</span>
                </div>
              </button>

              {/* Name, Rank, XP */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-4 mb-2">
                  <h1 className="text-2xl font-bold arena-heading" style={{ color: '#e8d5a0', textShadow: '0 2px 4px rgba(0,0,0,0.5), 0 0 20px rgba(200,160,60,0.1)' }}>{profile.name}</h1>
                  {rank && (
                    <span
                      className={cn('text-sm font-bold px-3 py-0.5', rankColor)}
                      style={{
                        background: `linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0.1) 100%)`,
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '6px',
                        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                      }}
                    >
                      {formatRank(rank.tier, rank.division)}
                    </span>
                  )}
                  {/* Compact stats */}
                  <div className="ml-auto flex items-center gap-5 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold tabular-nums" style={{ color: '#e8d5a0', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{totalMatches}</span>
                      <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: `${GOLD} 0.35)` }}>matches</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold tabular-nums" style={{ color: winRate >= 50 ? '#6ee7a0' : '#e8d5a0', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{winRate}%</span>
                      <span className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: `${GOLD} 0.35)` }}>win rate</span>
                    </div>
                  </div>
                </div>

                {/* XP Progress bar */}
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest arena-heading shrink-0" style={{ color: `${GOLD} 0.45)` }}>Lvl {level}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: `${GOLD} 0.08)`, border: `1px solid ${GOLD} 0.12)`, boxShadow: `inset 0 1px 3px rgba(0,0,0,0.3)` }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.round(progress.fraction * 100)}%`,
                        background: 'linear-gradient(90deg, #8b6914, #d4a843, #c49a38)',
                        boxShadow: '0 0 8px rgba(212,168,67,0.3)',
                      }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums shrink-0" style={{ color: `${GOLD} 0.4)` }}>{Math.round(progress.fraction * 100)}%</span>
                </div>

                {/* Rank LP bar */}
                {rank && (
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-[10px] font-semibold uppercase tracking-widest arena-heading shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }}>LP</span>
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${rank.lp}%`, background: 'rgba(255,255,255,0.2)' }} />
                    </div>
                    <span className="text-[10px] tabular-nums shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }}>{rank.lp} LP</span>
                  </div>
                )}

                {/* Collection per-set bars */}
                <div className="flex items-center gap-4">
                  {[
                    { label: 'Gothic', key: 'gothic', color: '#a87832' },
                    { label: 'Arthurian', key: 'arthurian', color: '#6b8cae' },
                    { label: 'Beta', key: 'beta', color: '#7c6ea0' },
                  ].map(({ label, key, color }) => (
                    <div key={key} className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-[9px] font-semibold uppercase tracking-wider shrink-0" style={{ color: `${color}99` }}>{label}</span>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="h-full rounded-full transition-all" style={{ width: setStats[key].total > 0 ? `${Math.round((setStats[key].owned / setStats[key].total) * 100)}%` : '0%', background: color }} />
                      </div>
                      <span className="text-[9px] tabular-nums shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>{setStats[key].owned}/{setStats[key].total}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <OrnamentalDivider className="shrink-0" />

            {/* ─── 3-COLUMN LAYOUT ───────────────────────────── */}
            <div className="flex gap-5 py-4 flex-1 min-h-0">

              {/* ── LEFT COLUMN: VERTICAL MENU ──────────────── */}
              <div className="w-[280px] shrink-0 flex flex-col overflow-y-auto pr-1">

                {/* FIND MATCH — hero button */}
                <button
                  type="button"
                  className="w-full relative group transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer mb-2"
                  style={HERO_BTN_GREEN}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 0 40px rgba(34,197,94,0.2), 0 0 80px rgba(34,197,94,0.1), inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.2)';
                    e.currentTarget.style.borderColor = 'rgba(34,197,94,0.6)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = HERO_BTN_GREEN.boxShadow;
                    e.currentTarget.style.borderColor = 'rgba(34,197,94,0.4)';
                  }}
                  onClick={onFindMatch}
                >
                  <div className="py-5 px-5 text-left">
                    <div className="text-xl font-bold arena-heading mb-0.5" style={{ color: '#6ee7a0', textShadow: '0 0 20px rgba(110,231,160,0.3), 0 2px 4px rgba(0,0,0,0.5)' }}>
                      Find Match
                    </div>
                    <div className="text-[11px] font-medium" style={{ color: 'rgba(110,231,160,0.5)' }}>Ranked matchmaking — earn LP</div>
                  </div>
                  <div className="absolute top-3 right-4 text-3xl opacity-[0.07]" style={{ color: '#6ee7a0' }}>⚔</div>
                </button>

                {/* Menu buttons */}
                {[
                  { label: 'Casual Play', sub: 'Play with a friend', onClick: onPlayMatch, accent: null },
                  { label: 'Store', sub: 'Buy packs & bundles', onClick: onOpenStore, accent: [212, 168, 67] },
                  { label: 'Deck Builder', sub: 'Build & manage decks', onClick: onOpenDeckBuilder, accent: [168, 85, 247] },
                  { label: 'Auction House', sub: 'Buy & sell cards', onClick: onOpenAuctionHouse, accent: [212, 168, 67] },
                ].map(({ label, sub, onClick, accent }) => {
                  const accentColor = accent ? `rgba(${accent[0]},${accent[1]},${accent[2]},` : GOLD;
                  return (
                    <button
                      key={label}
                      type="button"
                      className="w-full relative group text-left transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer mb-1.5"
                      style={{
                        ...BEVELED_BTN,
                        borderRadius: '10px',
                        border: `1px solid ${accentColor} 0.2)`,
                        padding: '12px 16px',
                        background: accent
                          ? `linear-gradient(180deg, rgba(${accent[0]},${accent[1]},${accent[2]},0.06) 0%, rgba(0,0,0,0.1) 100%)`
                          : BEVELED_BTN.background,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = `${accentColor} 0.45)`;
                        e.currentTarget.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.1), 0 0 20px ${accentColor} 0.08)`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = `${accentColor} 0.2)`;
                        e.currentTarget.style.boxShadow = BEVELED_BTN.boxShadow;
                      }}
                      onClick={onClick}
                    >
                      <div className="text-sm font-bold arena-heading mb-0.5" style={{ color: accent ? `rgba(${accent[0]},${accent[1]},${accent[2]},0.85)` : '#e8d5a0', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{label}</div>
                      <div className="text-[10px]" style={{ color: `${accentColor} 0.4)` }}>{sub}</div>
                    </button>
                  );
                })}

                {/* Recent Matches */}
                {totalMatches > 0 && (
                  <div className="mt-4">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="arena-heading text-[10px] font-semibold uppercase tracking-widest" style={{ color: `${GOLD} 0.4)` }}>Recent Matches</span>
                      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${GOLD} 0.2), transparent)` }} />
                    </div>
                    <div className="flex flex-col gap-1">
                      {profile.matchHistory.slice(0, 5).map((m, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 px-3 py-1.5 text-xs"
                          style={{
                            background: `linear-gradient(90deg, ${m.won ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.03)'} 0%, transparent 100%)`,
                            borderRadius: '6px',
                            border: `1px solid ${m.won ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.06)'}`,
                          }}
                        >
                          <span className={cn('font-bold w-4 text-center', m.won ? 'text-green-400' : 'text-red-400')} style={{ textShadow: m.won ? '0 0 8px rgba(34,197,94,0.3)' : '0 0 8px rgba(239,68,68,0.3)' }}>
                            {m.won ? 'W' : 'L'}
                          </span>
                          <span className="flex-1 truncate" style={{ color: `${PARCHMENT} 0.55)` }}>{m.opponentName || 'Opponent'}</span>
                          <span className="text-[10px] font-medium" style={{ color: 'rgba(240,208,96,0.6)' }}>+{m.coinsEarned}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── CENTER COLUMN: LEADERBOARD ──────────────── */}
              <div className="flex-1 min-w-0 flex flex-col">
                <div
                  className="overflow-hidden flex-1 flex flex-col"
                  style={{
                    background: 'linear-gradient(180deg, rgba(20,16,8,0.7) 0%, rgba(10,8,4,0.5) 100%)',
                    border: `1px solid ${GOLD} 0.18)`,
                    borderRadius: '14px',
                    boxShadow: `inset 0 1px 0 ${GOLD} 0.06), 0 4px 20px rgba(0,0,0,0.3)`,
                  }}
                >
                  <div className="px-4 pt-4 pb-2 shrink-0">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="arena-heading text-xs font-semibold uppercase tracking-widest" style={{ color: `${GOLD} 0.5)`, textShadow: '0 0 10px rgba(180,140,60,0.1)' }}>Leaderboard</span>
                      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${GOLD} 0.25), transparent)` }} />
                    </div>

                    <Tabs value={leaderboardFilter} onValueChange={(v) => this.setState({ leaderboardFilter: v })} className="mb-2">
                      <TabsList className="w-full gap-0.5 rounded-xl p-0.5 flex-wrap h-auto">
                        <TabsTrigger value="all" className="px-2.5 py-1 text-[10px] h-6">All</TabsTrigger>
                        {TIERS.map((tier) => (
                          <TabsTrigger key={tier} value={tier} className="px-2.5 py-1 text-[10px] h-6">
                            {TIER_LABELS[tier]}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>

                    <input
                      type="text"
                      value={leaderboardSearch}
                      placeholder="Search players..."
                      className="w-full px-3 py-1.5 text-xs outline-none placeholder:text-amber-800/30"
                      style={{
                        background: `${GOLD} 0.04)`,
                        border: `1px solid ${GOLD} 0.12)`,
                        borderRadius: '8px',
                        color: '#e8d5a0',
                        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.2)',
                      }}
                      onInput={(e) => this.setState({ leaderboardSearch: e.target.value })}
                    />
                  </div>

                  <div className="flex-1 overflow-y-auto px-3 pb-3">
                    {leaderboardLoading ? (
                      <div className="text-xs py-8 text-center" style={{ color: `${GOLD} 0.3)` }}>Loading...</div>
                    ) : filteredLeaderboard.length === 0 ? (
                      <div className="text-xs py-8 text-center" style={{ color: `${GOLD} 0.3)` }}>No players in this tier yet</div>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {filteredLeaderboard.map((player, i) => {
                          const isMe = player.name === profile.name;
                          const color = TIER_COLORS[player.tier] || 'text-white/60';
                          return (
                            <div
                              key={i}
                              className="flex items-center gap-2 px-2.5 py-1.5 text-xs transition-all"
                              style={isMe
                                ? {
                                    background: `linear-gradient(90deg, ${GOLD} 0.1), ${GOLD} 0.05))`,
                                    border: `1px solid ${GOLD} 0.25)`,
                                    borderRadius: '8px',
                                    boxShadow: `0 0 12px ${GOLD} 0.06)`,
                                  }
                                : { borderRadius: '8px' }
                              }
                            >
                              <span className="w-5 text-right font-mono text-[10px]" style={{ color: i < 3 ? '#d4a843' : `${GOLD} 0.3)` }}>{i + 1}</span>
                              <span className="flex-1 font-medium truncate" style={{ color: isMe ? '#d4a843' : `${PARCHMENT} 0.55)` }}>
                                {player.name}
                              </span>
                              <span className={cn('text-[10px] font-semibold shrink-0', color)}>
                                {formatRank(player.tier, player.division)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── RIGHT COLUMN: ACHIEVEMENTS ─────────────── */}
              <div className="w-[320px] shrink-0 flex flex-col overflow-hidden">
                <div
                  className="flex-1 flex flex-col overflow-hidden"
                  style={{
                    background: 'linear-gradient(180deg, rgba(20,16,8,0.7) 0%, rgba(10,8,4,0.5) 100%)',
                    border: `1px solid ${GOLD} 0.18)`,
                    borderRadius: '14px',
                    boxShadow: `inset 0 1px 0 ${GOLD} 0.06), 0 4px 20px rgba(0,0,0,0.3)`,
                  }}
                >
                  <div className="px-4 pt-4 pb-2 shrink-0">
                    <div className="flex items-center gap-3">
                      <span className="arena-heading text-xs font-semibold uppercase tracking-widest" style={{ color: `${GOLD} 0.5)`, textShadow: '0 0 10px rgba(180,140,60,0.1)' }}>
                        Achievements ({unlockedCount}/{ACHIEVEMENTS.length})
                      </span>
                      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${GOLD} 0.25), transparent)` }} />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto px-3 pb-3">
                    <div className="flex flex-col gap-1.5">
                      {ACHIEVEMENTS.map((a) => {
                        const unlocked = (profile.achievements || []).includes(a.id);
                        const prog = !unlocked ? getAchievementProgress(a.id, profile, sorceryCards) : null;
                        const hasProgress = prog && prog.target > 1 && prog.current > 0;
                        const pct = prog && prog.target > 0 ? Math.min(100, Math.round((prog.current / prog.target) * 100)) : 0;
                        return (
                          <div
                            key={a.id}
                            className="flex items-center gap-2.5 px-3 py-2 text-xs transition-all"
                            style={unlocked
                              ? {
                                  background: 'linear-gradient(135deg, rgba(40,30,10,0.5) 0%, rgba(25,20,8,0.3) 100%)',
                                  border: `1px solid ${GOLD} 0.25)`,
                                  borderRadius: '8px',
                                  boxShadow: `0 0 10px ${GOLD} 0.04)`,
                                  color: '#e8d5a0',
                                }
                              : {
                                  background: 'rgba(255,255,255,0.01)',
                                  border: '1px solid rgba(255,255,255,0.04)',
                                  borderRadius: '8px',
                                  color: 'rgba(255,255,255,0.2)',
                                }
                            }
                          >
                            <span className="text-base shrink-0">{unlocked ? a.icon : '🔒'}</span>
                            <div className="min-w-0 flex-1">
                              <div className="font-medium truncate">{a.name}</div>
                              <div className="text-[10px] truncate" style={{ color: unlocked ? `${PARCHMENT} 0.4)` : 'rgba(255,255,255,0.12)' }}>{a.description}</div>
                              {hasProgress && (
                                <div className="mt-1 flex items-center gap-1.5">
                                  <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: `${GOLD} 0.1)` }}>
                                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `${GOLD} 0.5)` }} />
                                  </div>
                                  <span className="text-[9px] shrink-0 tabular-nums" style={{ color: `${GOLD} 0.3)` }}>{prog.current}/{prog.target}</span>
                                </div>
                              )}
                            </div>
                            {unlocked && <span className="text-[9px] shrink-0 font-medium" style={{ color: '#d4a843' }}>+{a.coins}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* ─── SETTINGS OVERLAY ──────────────────────────────── */}
        {showSettings && (() => {
          const ss = this.state.soundSettings;
          const updateSound = (key, value) => {
            const next = { ...ss, [key]: value };
            saveSoundSettings(next);
            this.setState({ soundSettings: next });
            updateMusicVolume();
          };
          return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => this.setState({ showSettings: false, showResetConfirm: false })}>
              <div
                className="w-full max-w-md p-6 shadow-2xl"
                style={{
                  background: 'linear-gradient(180deg, rgba(25,20,10,0.98) 0%, rgba(15,12,6,0.98) 100%)',
                  border: `1px solid ${GOLD} 0.3)`,
                  borderRadius: '16px',
                  boxShadow: `0 0 60px rgba(0,0,0,0.5), 0 0 30px ${GOLD} 0.05)`,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-lg font-bold arena-heading mb-5" style={{ color: '#e8d5a0', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>Settings</h2>

                <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: `${GOLD} 0.4)` }}>Profile</div>
                <div className="flex flex-col mb-5 rounded-xl overflow-hidden" style={{ border: `1px solid ${GOLD} 0.15)` }}>
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${GOLD} 0.08)` }}>
                    <div>
                      <div className="text-sm" style={{ color: '#e8d5a0' }}>Username</div>
                      <div className="text-xs" style={{ color: `${PARCHMENT} 0.4)` }}>{profile.name}</div>
                    </div>
                    <span className="text-[10px]" style={{ color: `${GOLD} 0.25)` }}>Set at registration</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="text-sm" style={{ color: '#e8d5a0' }}>Avatar</div>
                      <div className="text-xs" style={{ color: `${PARCHMENT} 0.4)` }}>Change your profile picture</div>
                    </div>
                    <button
                      type="button"
                      className="px-3 py-1 text-xs font-medium transition-all"
                      style={{ ...BEVELED_BTN, color: `${GOLD_TEXT} 0.6)` }}
                      onClick={() => this.setState({ showSettings: false, showAvatarPicker: true })}
                    >
                      Change
                    </button>
                  </div>
                </div>

                <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: `${GOLD} 0.4)` }}>Sound</div>
                <div className="flex flex-col mb-5 rounded-xl overflow-hidden" style={{ border: `1px solid ${GOLD} 0.15)` }}>
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${GOLD} 0.08)` }}>
                    <span className="text-sm" style={{ color: '#e8d5a0' }}>Master Volume</span>
                    <div className="flex items-center gap-3">
                      <input type="range" min="0" max="100" value={Math.round(ss.masterVolume * 100)} className="w-24 h-1 accent-amber-500 cursor-pointer" onInput={(e) => updateSound('masterVolume', parseInt(e.target.value, 10) / 100)} />
                      <span className="text-xs w-8 text-right tabular-nums" style={{ color: `${PARCHMENT} 0.4)` }}>{Math.round(ss.masterVolume * 100)}%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${GOLD} 0.08)` }}>
                    <span className="text-sm" style={{ color: '#e8d5a0' }}>Music</span>
                    <div className="flex items-center gap-3">
                      <button type="button" className={cn('rounded-md px-2 py-0.5 text-[10px] font-medium border transition-colors', ss.musicEnabled ? 'border-green-500/40 bg-green-500/15 text-green-400' : 'border-white/15 text-white/30')} onClick={() => updateSound('musicEnabled', !ss.musicEnabled)}>{ss.musicEnabled ? 'On' : 'Off'}</button>
                      <input type="range" min="0" max="100" value={Math.round(ss.musicVolume * 100)} className="w-20 h-1 accent-amber-500 cursor-pointer" disabled={!ss.musicEnabled} onInput={(e) => updateSound('musicVolume', parseInt(e.target.value, 10) / 100)} />
                      <span className="text-xs w-8 text-right tabular-nums" style={{ color: `${PARCHMENT} 0.4)` }}>{Math.round(ss.musicVolume * 100)}%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm" style={{ color: '#e8d5a0' }}>Sound Effects</span>
                    <div className="flex items-center gap-3">
                      <button type="button" className={cn('rounded-md px-2 py-0.5 text-[10px] font-medium border transition-colors', ss.sfxEnabled ? 'border-green-500/40 bg-green-500/15 text-green-400' : 'border-white/15 text-white/30')} onClick={() => updateSound('sfxEnabled', !ss.sfxEnabled)}>{ss.sfxEnabled ? 'On' : 'Off'}</button>
                      <input type="range" min="0" max="100" value={Math.round(ss.sfxVolume * 100)} className="w-20 h-1 accent-amber-500 cursor-pointer" disabled={!ss.sfxEnabled} onInput={(e) => updateSound('sfxVolume', parseInt(e.target.value, 10) / 100)} />
                      <span className="text-xs w-8 text-right tabular-nums" style={{ color: `${PARCHMENT} 0.4)` }}>{Math.round(ss.sfxVolume * 100)}%</span>
                    </div>
                  </div>
                </div>

                <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'rgba(239,68,68,0.4)' }}>Danger Zone</div>
                <div className="flex flex-col rounded-xl overflow-hidden" style={{ border: '1px solid rgba(239,68,68,0.15)' }}>
                  <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(239,68,68,0.08)' }}>
                    <div>
                      <div className="text-sm text-red-400">Reset Profile</div>
                      <div className="text-xs" style={{ color: `${PARCHMENT} 0.3)` }}>Delete all progress and start over</div>
                    </div>
                    {showResetConfirm ? (
                      <div className="flex items-center gap-2">
                        <button type="button" className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700" onClick={() => { this.setState({ showSettings: false, showResetConfirm: false }); if (onResetProfile) onResetProfile(); }}>Confirm</button>
                        <button type="button" className="rounded-lg px-3 py-1 text-xs transition-colors" style={{ ...BEVELED_BTN, color: `${PARCHMENT} 0.5)` }} onClick={() => this.setState({ showResetConfirm: false })}>Cancel</button>
                      </div>
                    ) : (
                      <button type="button" className="rounded-lg border border-red-500/30 px-3 py-1 text-xs text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition-colors" onClick={() => this.setState({ showResetConfirm: true })}>Reset</button>
                    )}
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="text-sm text-red-400">Quit Game</div>
                      <div className="text-xs" style={{ color: `${PARCHMENT} 0.3)` }}>Close Valkenhall</div>
                    </div>
                    <button type="button" className="rounded-lg border border-red-500/30 px-3 py-1 text-xs text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition-colors" onClick={() => { this.setState({ showSettings: false }); onExit(); }}>Quit</button>
                  </div>
                </div>

                <div className="mt-5 text-right">
                  <button
                    type="button"
                    className="px-5 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all"
                    style={{ ...BEVELED_BTN, color: `${GOLD_TEXT} 0.6)` }}
                    onClick={() => this.setState({ showSettings: false, showResetConfirm: false })}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ─── AVATAR PICKER OVERLAY ────────────────────────── */}
        {showAvatarPicker && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => this.setState({ showAvatarPicker: false })}>
            <div
              className="w-full max-w-lg p-5 shadow-2xl"
              style={{
                background: 'linear-gradient(180deg, rgba(25,20,10,0.98) 0%, rgba(15,12,6,0.98) 100%)',
                border: `1px solid ${GOLD} 0.3)`,
                borderRadius: '16px',
                boxShadow: `0 0 60px rgba(0,0,0,0.5), 0 0 30px ${GOLD} 0.05)`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-bold arena-heading mb-1" style={{ color: '#e8d5a0' }}>Choose Avatar</h2>
              <p className="text-xs mb-4" style={{ color: `${PARCHMENT} 0.4)` }}>Select from avatars in your collection</p>
              <div className="grid grid-cols-5 gap-2 max-h-80 overflow-y-auto">
                {this.getOwnedAvatars().map((card) => {
                  const isSelected = profile.profileAvatar === card.unique_id;
                  return (
                    <button
                      key={card.unique_id}
                      type="button"
                      className={cn(
                        'rounded-lg overflow-hidden border-2 transition-all',
                        isSelected
                          ? 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                          : 'border-transparent hover:border-white/40'
                      )}
                      onClick={() => {
                        if (onUpdateAvatar) onUpdateAvatar(card.unique_id);
                        this.setState({ showAvatarPicker: false });
                      }}
                    >
                      <img src={card.printings?.[0]?.image_url || ''} alt={card.name} className="w-full aspect-[63/88] object-cover" draggable={false} />
                      <div className="px-1 py-0.5 text-[9px] truncate text-center" style={{ background: 'rgba(0,0,0,0.8)', color: 'rgba(255,255,255,0.6)' }}>{card.name}</div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 text-right">
                <button
                  type="button"
                  className="px-5 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all"
                  style={{ ...BEVELED_BTN, color: `${GOLD_TEXT} 0.6)` }}
                  onClick={() => this.setState({ showAvatarPicker: false })}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
}
