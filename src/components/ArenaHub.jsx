import { Component } from 'preact';
import RuneSpinner from './RuneSpinner';
import AppHeader from './AppHeader';
import { UI } from '../utils/arena/uiSounds';
import { xpProgressInLevel } from '../utils/arena/profileDefaults';
import { ACHIEVEMENTS, getAchievementProgress } from '../utils/arena/achievements';
import { cn } from '../lib/utils';
import { formatRank, TIER_COLORS, TIER_LABELS, TIERS } from '../utils/arena/rankUtils';
import {
  GOLD, GOLD_TEXT, PARCHMENT, BG_ATMOSPHERE,
  BEVELED_BTN, CONTENT_BG_DEFAULT, CONTENT_BG_HOVER, CONTENT_BG_ACTIVE,
  BTN_BORDER, BTN_BORDER_HOVER, BTN_CORNER, BTN_CORNER_HOVER,
  DIALOG_STYLE, DIALOG_BORDER, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD,
  adjustAlpha, CornerPlating, MenuButton, OrnamentalDivider, FourCorners, TAB_ACTIVE, TAB_INACTIVE,
  getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';
import AmbientParticles from './AmbientParticles';
import AdminPanel from './AdminPanel';

export default class ArenaHub extends Component {
  constructor(props) {
    super(props);
    this.state = {
      showAvatarPicker: false,
      showAdmin: false,
      leaderboard: null,
      leaderboardLoading: false,
      leaderboardFilter: 'all',
      leaderboardSearch: '',
      hubScale: getViewportScale(),
    };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ hubScale: scale }));
    this.loadLeaderboard();
  }

  componentWillUnmount() {
    this.unsubScale?.();
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
    const { profile, rank, onPlayMatch, onFindMatch, onOpenStore, onOpenDeckBuilder, onOpenAuctionHouse, onOpenArcaneTrials, onOpenSettings, updateStatus, onViewProfile, onUpdateAvatar, onResetProfile, onExit, friendListData, onToggleFriends, onToggleMailbox, mailboxUnreadCount } = this.props;
    const { showAvatarPicker, leaderboardLoading, leaderboardFilter, leaderboardSearch } = this.state;
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
      <div className="fixed inset-0 z-50 flex flex-col overflow-hidden select-none" style={{ background: '#08080a' }}>

        {/* Background image with depth-of-field blur */}
        <div className="absolute inset-0" style={{ background: `url('/hub-bg.png') center/cover no-repeat`, filter: 'blur(3px)', transform: 'scale(1.02)' }} />

        {/* Darken overlay + vignette */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0.7) 100%)' }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 50%, transparent 40%, rgba(0,0,0,0.6) 100%)' }} />

        {/* Ambient particle effects (embers, dust, sparks) */}
        <AmbientParticles />

        {/* ─── TOP BAR ─────────────────────────────────────── */}
        <AppHeader
          profile={profile}
          onToggleMailbox={onToggleMailbox}
          mailboxUnreadCount={mailboxUnreadCount}
          mailboxDropdown={this.props.mailboxDropdown}
          onToggleFriends={onToggleFriends}
          friendListData={friendListData}
          zoom={this.state.hubScale}
        >
          {this.props.isAdmin && (
            <button
              type="button"
              className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-all hover:scale-[1.05] active:scale-[0.97]"
              style={{
                background: 'linear-gradient(180deg, rgba(180,60,60,0.15) 0%, rgba(120,30,30,0.1) 100%)',
                border: '1px solid rgba(180,60,60,0.35)',
                borderRadius: '4px',
                color: '#c45050',
                textShadow: '0 1px 2px rgba(0,0,0,0.5)',
              }}
              onClick={() => this.setState({ showAdmin: true })}
            >
              Admin
            </button>
          )}
        </AppHeader>

        {/* ─── MAIN CONTENT ────────────────────────────────── */}
        <div className="relative z-10 flex-1 flex flex-col overflow-hidden" style={{ zoom: this.state.hubScale }}>
          <div className="mx-auto px-8 w-full flex flex-col overflow-hidden flex-1">

            {/* ─── HERO: PLAYER IDENTITY ──────────────────── */}
            <div className="relative flex items-center gap-8 py-5 px-6 shrink-0 my-2 w-[60%] mx-auto" style={{ background: `url("/tex-noise-panel.webp"), linear-gradient(rgba(12, 10, 8, 0.6), rgba(12, 10, 8, 0.6))`, backdropFilter: 'blur(8px)', border: `1px solid ${GOLD} 0.2)`, borderRadius: '8px' }}>
              <CornerPlating position="top-left" color={`${GOLD} 0.45)`} />
              <CornerPlating position="top-right" color={`${GOLD} 0.45)`} />
              <CornerPlating position="bottom-left" color={`${GOLD} 0.45)`} />
              <CornerPlating position="bottom-right" color={`${GOLD} 0.45)`} />
              {/* Avatar with ornate circular frame */}
              <button
                type="button"
                className="relative group shrink-0"
                style={{ width: 72, height: 72 }}
                onClick={() => this.setState({ showAvatarPicker: true })}
                title="Click to change avatar"
              >
                {/* Outer glow ring */}
                <div className="absolute -inset-1.5 rounded-full" style={{ border: `2px solid ${GOLD} 0.3)`, boxShadow: `0 0 16px ${GOLD} 0.1)` }} />

                {/* Avatar image */}
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full rounded-full object-cover object-top relative z-10" style={{ border: `2px solid ${GOLD} 0.5)`, boxShadow: `0 4px 16px rgba(0,0,0,0.5)` }} />
                ) : (
                  <div className="w-full h-full rounded-full flex items-center justify-center text-xl relative z-10" style={{ background: `${GOLD} 0.08)`, border: `2px solid ${GOLD} 0.3)`, color: `${GOLD} 0.4)` }}>?</div>
                )}

                {/* Level badge */}
                <div
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center"
                  style={{
                    minWidth: '22px', height: '18px',
                    padding: '0 5px',
                    background: 'linear-gradient(180deg, rgba(50,42,28,0.95) 0%, rgba(30,25,16,0.95) 100%)',
                    border: `1.5px solid ${GOLD} 0.5)`,
                    borderRadius: '9px',
                    boxShadow: `0 2px 6px rgba(0,0,0,0.5)`,
                  }}
                >
                  <span className="text-[10px] font-bold" style={{ color: ACCENT_GOLD, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{level}</span>
                </div>

                {/* Hover overlay */}
                <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-all z-20">
                  <span className="text-white/0 group-hover:text-white/80 text-[10px] font-medium transition-all" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>Change</span>
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
              <div className="w-[280px] shrink-0 flex flex-col overflow-visible py-1 pl-1">

                <img src="/valkenhall-logo.png" alt="Valkenhall" className="w-full mb-3" draggable={false} />

                <MenuButton title="Find Match" onClick={onFindMatch} />
                <MenuButton title="Casual Play" onClick={onPlayMatch} />
                <MenuButton title="Store" onClick={onOpenStore} />
                <MenuButton title="Deck Builder" onClick={onOpenDeckBuilder} />
                <MenuButton title="Auction House" onClick={onOpenAuctionHouse} />
                <MenuButton title="Arcane Trials" onClick={onOpenArcaneTrials} />
                <div className="relative">
                  <MenuButton title="Settings" onClick={onOpenSettings} />
                  {updateStatus && (updateStatus.state === 'READY_TO_INSTALL' || updateStatus.state === 'DOWNLOADING' || updateStatus.state === 'DOWNLOAD_FAILED') ? (
                    <div
                      className="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full"
                      style={{
                        background: updateStatus.state === 'DOWNLOAD_FAILED' ? '#b04040' : ACCENT_GOLD,
                        boxShadow: `0 0 6px ${updateStatus.state === 'DOWNLOAD_FAILED' ? 'rgba(176,64,64,0.6)' : 'rgba(212,168,67,0.6)'}`,
                      }}
                    />
                  ) : null}
                </div>

                {/* Recent Matches */}
                {totalMatches > 0 && (
                  <div className="mt-4 p-3" style={{ background: 'rgba(12, 10, 8, 0.92)', backdropFilter: 'blur(8px)', border: `1px solid ${GOLD} 0.12)`, borderRadius: '8px' }}>
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
                  className="relative flex-1 flex flex-col"
                  style={{
                    background: `url("/tex-noise-panel.webp"), linear-gradient(rgba(12, 10, 8, 0.6), rgba(12, 10, 8, 0.6))`,
                    backdropFilter: 'blur(8px)',
                    border: `1px solid ${GOLD} 0.18)`,
                    borderRadius: '8px',
                    boxShadow: `inset 0 1px 0 ${GOLD} 0.06), 0 4px 20px rgba(0,0,0,0.3)`,
                  }}
                >
                  <CornerPlating position="top-left" color={`${GOLD} 0.4)`} />
                  <CornerPlating position="top-right" color={`${GOLD} 0.4)`} />
                  <CornerPlating position="bottom-left" color={`${GOLD} 0.4)`} />
                  <CornerPlating position="bottom-right" color={`${GOLD} 0.4)`} />
                  {/* Header */}
                  <div className="px-5 pt-5 pb-3 shrink-0">
                    <span className="arena-heading text-sm font-semibold uppercase tracking-widest" style={{ color: `${GOLD} 0.55)`, textShadow: '0 0 12px rgba(180,140,60,0.15)' }}>Leaderboard</span>
                    {/* Search + Tier filter — single row */}
                    <div className="flex items-center gap-2 mt-3">
                      <input
                        type="text"
                        value={leaderboardSearch}
                        placeholder="Search..."
                        className="w-24 shrink-0 px-2 py-1 text-[10px] outline-none"
                        style={{
                          background: 'rgba(0,0,0,0.25)',
                          border: `1px solid ${GOLD} 0.12)`,
                          borderRadius: '4px',
                          color: '#A6A09B',
                          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
                        }}
                        onInput={(e) => this.setState({ leaderboardSearch: e.target.value })}
                      />
                      <div className="flex flex-wrap gap-1">
                        {[{ value: 'all', label: 'All' }, ...TIERS.map(t => ({ value: t, label: TIER_LABELS[t] }))].map((t) => (
                          <button
                            key={t.value}
                            type="button"
                            className="px-2 py-1 text-[9px] font-semibold uppercase tracking-wide transition-all"
                            style={leaderboardFilter === t.value ? TAB_ACTIVE : TAB_INACTIVE}
                            onClick={() => this.setState({ leaderboardFilter: t.value })}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {/* Divider */}
                  <div className="mx-5 h-px" style={{ background: `linear-gradient(90deg, transparent, ${GOLD} 0.2), transparent)` }} />
                  {/* Player list */}
                  <div className="flex-1 overflow-y-auto px-4 py-3" >
                    {leaderboardLoading ? (
                      <div className="flex justify-center py-8"><RuneSpinner size={50} useViewportUnits /></div>
                    ) : filteredLeaderboard.length === 0 ? (
                      <div className="text-xs py-8 text-center" style={{ color: `${GOLD} 0.3)` }}>No players found</div>
                    ) : (
                      <div className="flex flex-col">
                        {filteredLeaderboard.map((player, i) => {
                          const isMe = player.name === profile.name;
                          const color = TIER_COLORS[player.tier] || 'text-white/60';
                          const isTop3 = i < 3;
                          return (
                            <button
                              type="button"
                              key={player.id || i}
                              className="flex items-center gap-3 px-3 py-2 transition-all cursor-pointer w-full text-left"
                              style={{
                                borderBottom: `1px solid ${GOLD} 0.06)`,
                                background: isMe ? `linear-gradient(90deg, ${GOLD} 0.08), transparent)` : 'transparent',
                              }}
                              onMouseEnter={(e) => { if (!isMe) e.currentTarget.style.background = `${GOLD} 0.06)`; }}
                              onMouseLeave={(e) => { if (!isMe) e.currentTarget.style.background = 'transparent'; }}
                              onClick={() => player.id && onViewProfile(player.id)}
                            >
                              <span className="w-5 text-right font-mono text-[11px] font-bold" style={{ color: isTop3 ? '#d4a843' : 'rgba(166,160,155,0.3)' }}>{i + 1}</span>
                              <span className="flex-1 font-medium truncate text-[13px]" style={{ color: isMe ? '#d4a843' : '#A6A09B' }}>
                                {player.name}
                              </span>
                              <span className={cn('text-[10px] font-semibold shrink-0', color)}>
                                {formatRank(player.tier, player.division)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── RIGHT COLUMN: ACHIEVEMENTS ─────────────── */}
              <div className="w-[320px] shrink-0 flex flex-col min-h-0">
                <div
                  className="relative flex-1 flex flex-col min-h-0"
                  style={{
                    background: `url("/tex-noise-panel.webp"), linear-gradient(rgba(12, 10, 8, 0.6), rgba(12, 10, 8, 0.6))`,
                    backdropFilter: 'blur(8px)',
                    border: `1px solid ${GOLD} 0.18)`,
                    borderRadius: '8px',
                    boxShadow: `inset 0 1px 0 ${GOLD} 0.06), 0 4px 20px rgba(0,0,0,0.3)`,
                  }}
                >
                  <CornerPlating position="top-left" color={`${GOLD} 0.4)`} />
                  <CornerPlating position="top-right" color={`${GOLD} 0.4)`} />
                  <CornerPlating position="bottom-left" color={`${GOLD} 0.4)`} />
                  <CornerPlating position="bottom-right" color={`${GOLD} 0.4)`} />
                  {/* Header */}
                  <div className="px-5 pt-5 pb-3 shrink-0">
                    <span className="arena-heading text-sm font-semibold uppercase tracking-widest" style={{ color: `${GOLD} 0.55)`, textShadow: '0 0 12px rgba(180,140,60,0.15)' }}>
                      Achievements
                    </span>
                    <span className="ml-2 text-[10px] tabular-nums" style={{ color: `${GOLD} 0.3)` }}>{unlockedCount}/{ACHIEVEMENTS.length}</span>
                  </div>
                  {/* Divider */}
                  <div className="mx-5 h-px" style={{ background: `linear-gradient(90deg, transparent, ${GOLD} 0.2), transparent)` }} />
                  {/* Achievement list */}
                  <div className="flex-1 overflow-y-auto px-4 py-3" >
                    <div className="flex flex-col">
                      {ACHIEVEMENTS.map((a) => {
                        const unlocked = (profile.achievements || []).includes(a.id);
                        const prog = !unlocked ? getAchievementProgress(a.id, profile, sorceryCards) : null;
                        const hasProgress = prog && prog.target > 1 && prog.current > 0;
                        const pct = prog && prog.target > 0 ? Math.min(100, Math.round((prog.current / prog.target) * 100)) : 0;
                        return (
                          <div
                            key={a.id}
                            className="flex items-center gap-3 px-3 py-2.5 transition-all"
                            style={{
                              borderBottom: `1px solid ${unlocked ? `${GOLD} 0.1)` : 'rgba(255,255,255,0.03)'}`,
                              opacity: unlocked ? 1 : 0.4,
                            }}
                          >
                            <span className="text-base shrink-0 w-6 text-center">{unlocked ? a.icon : '🔒'}</span>
                            <div className="min-w-0 flex-1">
                              <div className="text-[12px] font-medium truncate" style={{ color: unlocked ? '#e8d5a0' : '#A6A09B' }}>{a.name}</div>
                              <div className="text-[10px] truncate" style={{ color: unlocked ? 'rgba(166,160,155,0.6)' : 'rgba(166,160,155,0.3)' }}>{a.description}</div>
                              {hasProgress && (
                                <div className="mt-1.5 flex items-center gap-2">
                                  <div className="flex-1 h-1 overflow-hidden" style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '1px' }}>
                                    <div className="h-full transition-all" style={{ width: `${pct}%`, background: `${GOLD} 0.5)`, borderRadius: '1px' }} />
                                  </div>
                                  <span className="text-[9px] shrink-0 tabular-nums" style={{ color: `${GOLD} 0.35)` }}>{prog.current}/{prog.target}</span>
                                </div>
                              )}
                            </div>
                            {unlocked && <span className="text-[9px] shrink-0 font-semibold" style={{ color: '#d4a843' }}>+{a.coins}</span>}
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

        {/* ─── ADMIN PANEL ───────────────────────────────────── */}
        {this.state.showAdmin && this.props.isAdmin && (
          <AdminPanel
            profile={this.props.profile}
            sorceryCards={this.props.sorceryCards}
            onUpdateProfile={(updated) => {
              this.props.onUpdateProfile?.(updated);
            }}
            onClose={() => this.setState({ showAdmin: false })}
          />
        )}

        {/* ─── AVATAR PICKER OVERLAY ────────────────────────── */}
        {showAvatarPicker && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm" style={{ zoom: this.state.hubScale }} onClick={() => this.setState({ showAvatarPicker: false })}>
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
                  data-sound={UI.CANCEL}
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
