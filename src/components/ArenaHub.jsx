import { Component } from 'preact';
import { xpProgressInLevel } from '../utils/arena/profileDefaults';
import { ACHIEVEMENTS, getAchievementProgress } from '../utils/arena/achievements';
import { getSoundSettings, saveSoundSettings } from '../utils/arena/soundSettings';
import { updateMusicVolume } from '../utils/arena/musicManager';
import { cn } from '../lib/utils';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { formatRank, TIER_COLORS, TIER_LABELS, TIERS } from '../utils/arena/rankUtils';

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

    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        {/* Minimal top nav */}
        <div className="flex items-center px-6 py-2.5 border-b border-white/10">
          <span className="text-sm font-semibold text-white/70">Valkenhall</span>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="text-sm font-bold text-yellow-300">{profile.coins}</span>
              <span className="text-[10px] text-muted-foreground">coins</span>
            </div>
            <button
              type="button"
              className="relative rounded-lg border border-white/10 px-2.5 py-1 text-[10px] text-white/50 hover:bg-white/10 hover:text-white/80 transition-colors"
              onClick={onToggleFriends}
            >
              Friends
              {(friendListData?.pendingCount || 0) > 0 ? (
                <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 rounded-full bg-red-500 flex items-center justify-center text-[9px] font-bold text-white px-1">
                  {friendListData.pendingCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className="rounded-lg border border-white/10 px-2.5 py-1 text-[10px] text-white/50 hover:bg-white/10 hover:text-white/80 transition-colors"
              onClick={() => this.setState({ showSettings: true })}
            >
              Settings
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto px-8 py-8">

            {/* Profile card — prominent display */}
            <div className="rounded-3xl border border-border/50 bg-card/40 p-8 mb-8">
              <div className="flex items-center gap-8">
                {/* Avatar — large */}
                <button
                  type="button"
                  className="relative group shrink-0"
                  onClick={() => this.setState({ showAvatarPicker: true })}
                  title="Click to change avatar"
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-24 h-24 rounded-2xl object-cover object-top border-2 border-amber-500/40 shadow-[0_0_30px_rgba(245,158,11,0.15)] group-hover:border-amber-400 transition-all" />
                  ) : (
                    <div className="w-24 h-24 rounded-2xl bg-white/10 border-2 border-white/20 flex items-center justify-center text-3xl text-white/30">?</div>
                  )}
                  <div className="absolute inset-0 rounded-2xl bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-all">
                    <span className="text-white/0 group-hover:text-white/80 text-xs font-medium transition-all">Change</span>
                  </div>
                </button>

                {/* Name + stats */}
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-bold text-white mb-3 arena-heading">{profile.name}</h1>
                  <div className="flex items-center gap-6">
                    {/* Level */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Level</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-bold text-amber-400">{level}</span>
                        <div className="w-20 h-2 rounded-full bg-white/10 overflow-hidden">
                          <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
                        </div>
                      </div>
                    </div>
                    {/* Rank */}
                    {rank ? (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Rank</span>
                        <div className="flex items-center gap-2">
                          <span className={cn('text-xl font-bold', rankColor)}>{formatRank(rank.tier, rank.division)}</span>
                          <div className="w-20 h-2 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full bg-white/30 transition-all" style={{ width: `${rank.lp}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground">{rank.lp} LP</span>
                        </div>
                      </div>
                    ) : null}
                    {/* Collection — per-set progress */}
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Collection</span>
                      <span className="text-sm text-white/70 mb-0.5">{uniqueCards} unique &middot; {collectionSize} total</span>
                      <div className="flex flex-col gap-1">
                        {[
                          { key: 'gothic', label: 'Gothic', color: 'bg-purple-500/70' },
                          { key: 'arthurian', label: 'Arthurian', color: 'bg-blue-500/70' },
                          { key: 'beta', label: 'Beta', color: 'bg-emerald-500/70' },
                        ].map((set) => {
                          const s = setStats[set.key];
                          const pct = s.total > 0 ? Math.round((s.owned / s.total) * 100) : 0;
                          return (
                            <div key={set.key} className="flex items-center gap-1.5">
                              <span className="text-[9px] text-white/40 w-14 truncate">{set.label}</span>
                              <div className="w-16 h-1 rounded-full bg-white/10 overflow-hidden">
                                <div className={cn('h-full rounded-full transition-all', set.color)} style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-[9px] text-white/30 tabular-nums">{s.owned}/{s.total}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Matches</span>
                      <span className="text-sm text-white/70">{profile.matchHistory.length} played</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions + Leaderboard side by side */}
            <div className="flex gap-6">
              {/* Left — actions */}
              <div className="flex-1 min-w-0">
                {/* Play */}
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3 arena-heading">Play</div>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <button
                    type="button"
                    className="rounded-2xl border border-green-500/30 bg-green-500/5 p-5 text-left transition-all hover:border-green-500/60 hover:bg-green-500/10 hover:shadow-[0_0_30px_rgba(34,197,94,0.1)]"
                    onClick={onFindMatch}
                  >
                    <div className="text-base font-bold text-white mb-1 arena-heading">Find Match</div>
                    <p className="text-xs text-muted-foreground">Ranked matchmaking — earn LP</p>
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl border border-border/40 bg-card/40 p-5 text-left transition-all hover:border-white/30 hover:bg-white/5"
                    onClick={onPlayMatch}
                  >
                    <div className="text-base font-bold text-white mb-1 arena-heading">Casual Play</div>
                    <p className="text-xs text-muted-foreground">Play with a friend</p>
                  </button>
                </div>

                {/* Collection */}
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3 arena-heading">Collection</div>
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <button
                    type="button"
                    className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-left transition-all hover:border-amber-500/60 hover:bg-amber-500/10"
                    onClick={onOpenStore}
                  >
                    <div className="text-base font-bold text-white mb-1 arena-heading">Store</div>
                    <p className="text-xs text-muted-foreground">Buy packs</p>
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-5 text-left transition-all hover:border-purple-500/60 hover:bg-purple-500/10"
                    onClick={onOpenDeckBuilder}
                  >
                    <div className="text-base font-bold text-white mb-1 arena-heading">Deck Builder</div>
                    <p className="text-xs text-muted-foreground">Build decks</p>
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 text-left transition-all hover:border-amber-500/60 hover:bg-amber-500/10"
                    onClick={onOpenAuctionHouse}
                  >
                    <div className="text-base font-bold text-white mb-1 arena-heading">Auction House</div>
                    <p className="text-xs text-muted-foreground">Buy &amp; sell cards</p>
                  </button>
                </div>

                {/* Recent matches */}
                {profile.matchHistory.length > 0 ? (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3 arena-heading">Recent Matches</div>
                    <div className="flex flex-col gap-1">
                      {profile.matchHistory.slice(0, 5).map((m, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
                          <span className={cn('font-semibold w-4', m.won ? 'text-green-400' : 'text-red-400')}>
                            {m.won ? 'W' : 'L'}
                          </span>
                          <span className="text-white/70 flex-1">{m.opponentName || 'Opponent'}</span>
                          <span className="text-yellow-300/80 text-xs">+{m.coinsEarned}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

              </div>

              {/* Right — leaderboard */}
              <div className="w-[420px] shrink-0">
                <div className="rounded-2xl border border-border/50 bg-card/30 backdrop-blur-sm">
                  <div className="px-5 pt-5 pb-3">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3 arena-heading">Leaderboard</div>
                    <Tabs value={leaderboardFilter} onValueChange={(v) => this.setState({ leaderboardFilter: v })} className="mb-3">
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
                      className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-white/30"
                      onInput={(e) => this.setState({ leaderboardSearch: e.target.value })}
                    />
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto px-3 pb-4">
                    {leaderboardLoading ? (
                      <div className="text-xs text-muted-foreground/40 py-8 text-center">Loading...</div>
                    ) : filteredLeaderboard.length === 0 ? (
                      <div className="text-xs text-muted-foreground/40 py-8 text-center">No players in this tier yet</div>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {filteredLeaderboard.map((player, i) => {
                          const isMe = player.name === profile.name;
                          const color = TIER_COLORS[player.tier] || 'text-white/60';
                          return (
                            <div
                              key={i}
                              className={cn(
                                'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs',
                                isMe ? 'bg-amber-500/10 border border-amber-500/20' : ''
                              )}
                            >
                              <span className="text-muted-foreground/60 w-4 text-right font-mono text-[10px]">{i + 1}</span>
                              <span className={cn('flex-1 font-medium truncate', isMe ? 'text-amber-300' : 'text-white/70')}>
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
            </div>

            {/* Achievements — full width */}
            <div className="mt-6">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-3 arena-heading">
                Achievements ({(profile.achievements || []).length}/{ACHIEVEMENTS.length})
              </div>
              <div className="grid grid-cols-3 gap-2">
                {ACHIEVEMENTS.map((a) => {
                  const unlocked = (profile.achievements || []).includes(a.id);
                  const prog = !unlocked ? getAchievementProgress(a.id, profile, sorceryCards) : null;
                  const hasProgress = prog && prog.target > 1 && prog.current > 0;
                  const pct = prog && prog.target > 0 ? Math.min(100, Math.round((prog.current / prog.target) * 100)) : 0;
                  return (
                    <div
                      key={a.id}
                      className={cn(
                        'flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs border transition-colors',
                        unlocked
                          ? 'border-amber-500/30 bg-amber-500/5 text-white'
                          : 'border-white/5 bg-white/[0.02] text-white/30'
                      )}
                    >
                      <span className="text-base shrink-0">{unlocked ? a.icon : '🔒'}</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{a.name}</div>
                        <div className={cn('text-[10px] truncate', unlocked ? 'text-white/50' : 'text-white/20')}>{a.description}</div>
                        {hasProgress ? (
                          <div className="mt-1 flex items-center gap-1.5">
                            <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                              <div className="h-full rounded-full bg-amber-500/60 transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[9px] text-white/30 shrink-0 tabular-nums">{prog.current}/{prog.target}</span>
                          </div>
                        ) : null}
                      </div>
                      {unlocked ? <span className="text-[9px] text-amber-400 shrink-0">+{a.coins}</span> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Settings overlay */}
        {showSettings ? (() => {
          const ss = this.state.soundSettings;
          const updateSound = (key, value) => {
            const next = { ...ss, [key]: value };
            saveSoundSettings(next);
            this.setState({ soundSettings: next });
            updateMusicVolume();
          };
          return (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => this.setState({ showSettings: false, showResetConfirm: false })}>
              <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-lg font-semibold text-white mb-5">Settings</h2>

                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">Profile</div>
                <div className="flex flex-col mb-5 rounded-xl border border-white/10 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                    <div>
                      <div className="text-sm text-white">Username</div>
                      <div className="text-xs text-muted-foreground">{profile.name}</div>
                    </div>
                    <span className="text-[10px] text-muted-foreground/40">Set at registration</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="text-sm text-white">Avatar</div>
                      <div className="text-xs text-muted-foreground">Change your profile picture</div>
                    </div>
                    <button type="button" className="rounded-lg border border-white/20 px-3 py-1 text-xs text-white/60 hover:bg-white/10" onClick={() => this.setState({ showSettings: false, showAvatarPicker: true })}>Change</button>
                  </div>
                </div>

                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">Sound</div>
                <div className="flex flex-col mb-5 rounded-xl border border-white/10 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                    <span className="text-sm text-white">Master Volume</span>
                    <div className="flex items-center gap-3">
                      <input type="range" min="0" max="100" value={Math.round(ss.masterVolume * 100)} className="w-24 h-1 accent-amber-500 cursor-pointer" onInput={(e) => updateSound('masterVolume', parseInt(e.target.value, 10) / 100)} />
                      <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">{Math.round(ss.masterVolume * 100)}%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                    <span className="text-sm text-white">Music</span>
                    <div className="flex items-center gap-3">
                      <button type="button" className={cn('rounded-md px-2 py-0.5 text-[10px] font-medium border transition-colors', ss.musicEnabled ? 'border-green-500/40 bg-green-500/15 text-green-400' : 'border-white/15 text-white/30')} onClick={() => updateSound('musicEnabled', !ss.musicEnabled)}>{ss.musicEnabled ? 'On' : 'Off'}</button>
                      <input type="range" min="0" max="100" value={Math.round(ss.musicVolume * 100)} className="w-20 h-1 accent-amber-500 cursor-pointer" disabled={!ss.musicEnabled} onInput={(e) => updateSound('musicVolume', parseInt(e.target.value, 10) / 100)} />
                      <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">{Math.round(ss.musicVolume * 100)}%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-white">Sound Effects</span>
                    <div className="flex items-center gap-3">
                      <button type="button" className={cn('rounded-md px-2 py-0.5 text-[10px] font-medium border transition-colors', ss.sfxEnabled ? 'border-green-500/40 bg-green-500/15 text-green-400' : 'border-white/15 text-white/30')} onClick={() => updateSound('sfxEnabled', !ss.sfxEnabled)}>{ss.sfxEnabled ? 'On' : 'Off'}</button>
                      <input type="range" min="0" max="100" value={Math.round(ss.sfxVolume * 100)} className="w-20 h-1 accent-amber-500 cursor-pointer" disabled={!ss.sfxEnabled} onInput={(e) => updateSound('sfxVolume', parseInt(e.target.value, 10) / 100)} />
                      <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">{Math.round(ss.sfxVolume * 100)}%</span>
                    </div>
                  </div>
                </div>

                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">Danger Zone</div>
                <div className="flex flex-col rounded-xl border border-red-500/20 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-red-500/10">
                    <div>
                      <div className="text-sm text-red-400">Reset Profile</div>
                      <div className="text-xs text-muted-foreground">Delete all progress and start over</div>
                    </div>
                    {showResetConfirm ? (
                      <div className="flex items-center gap-2">
                        <button type="button" className="rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700" onClick={() => { this.setState({ showSettings: false, showResetConfirm: false }); if (onResetProfile) onResetProfile(); }}>Confirm</button>
                        <button type="button" className="rounded-lg border border-white/20 px-3 py-1 text-xs text-white/60 hover:bg-white/10" onClick={() => this.setState({ showResetConfirm: false })}>Cancel</button>
                      </div>
                    ) : (
                      <button type="button" className="rounded-lg border border-red-500/30 px-3 py-1 text-xs text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition-colors" onClick={() => this.setState({ showResetConfirm: true })}>Reset</button>
                    )}
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="text-sm text-red-400">Quit Game</div>
                      <div className="text-xs text-muted-foreground">Close Valkenhall</div>
                    </div>
                    <button type="button" className="rounded-lg border border-red-500/30 px-3 py-1 text-xs text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition-colors" onClick={() => { this.setState({ showSettings: false }); onExit(); }}>Quit</button>
                  </div>
                </div>

                <div className="mt-5 text-right">
                  <button type="button" className="rounded-lg border border-white/20 px-4 py-1.5 text-xs text-white/60 hover:bg-white/10" onClick={() => this.setState({ showSettings: false, showResetConfirm: false })}>Close</button>
                </div>
              </div>
            </div>
          );
        })() : null}

        {/* Avatar picker overlay */}
        {showAvatarPicker ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => this.setState({ showAvatarPicker: false })}>
            <div className="w-full max-w-lg rounded-2xl border border-border/70 bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-semibold text-white mb-1">Choose Avatar</h2>
              <p className="text-xs text-muted-foreground mb-4">Select from avatars in your collection</p>
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
                      <div className="px-1 py-0.5 bg-black/80 text-[9px] text-white/70 truncate text-center">{card.name}</div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 text-right">
                <button
                  type="button"
                  className="rounded-lg border border-white/20 px-4 py-1.5 text-xs text-white/60 hover:bg-white/10"
                  onClick={() => this.setState({ showAvatarPicker: false })}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }
}
