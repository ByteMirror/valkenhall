import { Component } from 'preact';
import RuneSpinner from './RuneSpinner';
import AppHeader, { InviteButton } from './AppHeader';
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
  adjustAlpha, CornerPlating, MenuButton, OrnamentalDivider, FourCorners, TAB_ACTIVE, TAB_INACTIVE, TAB_BAR_STYLE,
  getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';
import AmbientParticles from './AmbientParticles';
import AdminPanel from './AdminPanel';
import VikingOrnament from './VikingOrnament';
import TutorialOverlay from './TutorialOverlay';
import { shouldAutoPlay, markTutorialSeen, hydrateTutorialState } from '../utils/arena/tutorialState';
import { CoinIcon } from './ui/icons';

const HUB_TUTORIAL_KEY = 'hub-main-menu';

// Ordered list of onboarding steps for the main menu. Each step
// points at a DOM node via a data-tutorial attribute declared on the
// target button. Keep the ordering roughly top-to-bottom so the
// spotlight doesn't jump around the screen.
const HUB_TUTORIAL_STEPS = [
  {
    key: 'find-match',
    title: 'Find Match',
    body: 'Queue up for a ranked game against another player. Climb the ladder, earn rank points, and see how far you can push against real opponents.',
    selector: '[data-tutorial="find-match"]',
  },
  {
    key: 'casual-play',
    title: 'Casual Play',
    body: 'Jump into an unranked game. Great for testing brews, playing with friends, or warming up before you dive into ranked matches.',
    selector: '[data-tutorial="casual-play"]',
  },
  {
    key: 'store',
    title: 'Store',
    body: 'Spend gold on booster packs from every available set, or spend Arcana Shards on specific card singles when you need a targeted add.',
    selector: '[data-tutorial="store"]',
  },
  {
    key: 'deck-builder',
    title: 'Deck Builder',
    body: 'Browse your collection, build and save decks, and prepare different strategies. You can own multiple decks and pick one when queueing for a match.',
    selector: '[data-tutorial="deck-builder"]',
  },
  {
    key: 'auction-house',
    title: 'Auction House',
    body: 'Buy and sell cards with other players. List cards you don\'t need for gold, or bid on rare singles from other collectors.',
    selector: '[data-tutorial="auction-house"]',
  },
  {
    key: 'arcane-trials',
    title: 'Arcane Trials',
    body: 'The seasonal pass. Earn Season XP by playing matches and completing quests to unlock tiered rewards — coins, Arcana Shards, and foil cards from the season\'s featured set.',
    selector: '[data-tutorial="arcane-trials"]',
  },
  {
    key: 'settings',
    title: 'Settings',
    body: 'Tweak audio, ambience, profile, and account options. You can also replay this tutorial here if you ever want a refresher.',
    selector: '[data-tutorial="settings"]',
  },
  {
    key: 'mailbox',
    title: 'Mailbox',
    body: 'Receive mail from the auction house, season pass rewards, and friends. Friends can send you cards and coins directly — claim them from the mailbox dropdown.',
    selector: '[data-tutorial="mailbox"]',
  },
  {
    key: 'friends',
    title: 'Friends',
    body: 'See who\'s online, invite them to private matches, send them mail, or accept pending friend requests. A red badge shows how many requests are waiting.',
    selector: '[data-tutorial="friends"]',
  },
];

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
      showHubTutorial: false,
    };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ hubScale: scale }));
    this.loadLeaderboard();
    this.maybeStartHubTutorial();
  }

  componentDidUpdate(prevProps) {
    // If the parent forces a tutorial replay (from the Settings
    // screen), surface the overlay again. The parent clears its
    // request flag right after mount via the onDismiss callback.
    if (!prevProps.replayHubTutorial && this.props.replayHubTutorial) {
      this.setState({ showHubTutorial: true });
    }
  }

  /**
   * Decide whether to auto-play the hub tutorial on mount. Awaits
   * the tutorial state hydration so we don't show the overlay on a
   * stale miss (the on-disk store might have the seen flag even
   * when localStorage is empty on a fresh CEF launch).
   */
  async maybeStartHubTutorial() {
    const { profile } = this.props;
    const id = profile?.id;
    if (!id) return;
    await hydrateTutorialState();
    if (this._unmounted) return;
    if (!shouldAutoPlay(id, HUB_TUTORIAL_KEY)) return;
    this.setState({ showHubTutorial: true });
  }

  handleHubTutorialDismiss = () => {
    const { profile, onHubTutorialDismissed } = this.props;
    if (profile?.id) markTutorialSeen(profile.id, HUB_TUTORIAL_KEY);
    this.setState({ showHubTutorial: false });
    onHubTutorialDismissed?.();
  };

  componentWillUnmount() {
    this._unmounted = true;
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
    const { profile, rank, onPlayMatch, onFindMatch, onOpenStore, onOpenDeckBuilder, onOpenAuctionHouse, onOpenArcaneTrials, onOpenSettings, updateStatus, onViewProfile, onUpdateAvatar, onExit, friendListData, onToggleFriends, onToggleMailbox, mailboxUnreadCount } = this.props;
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
          draftQueueDropdown={this.props.draftQueueDropdown}
          onToggleFriends={onToggleFriends}
          friendListData={friendListData}
          zoom={this.state.hubScale}
        >
          {profile?.inviteCode && <InviteButton code={profile.inviteCode} />}
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
          {/* Outer layout is a ROW so the left menu can span the full
              content height and stay vertically centred in the window
              regardless of how tall the hero / leaderboard become. The
              right-side wrapper below holds everything else (hero +
              leaderboard + achievements) and owns its own flex-col. */}
          <div className="mx-auto px-8 w-full flex gap-5 overflow-hidden flex-1">

            {/* ── LEFT COLUMN: VERTICAL MENU (full height) ── */}
            {/* justify-center anchors the logo + menu stack to the
                window's vertical midpoint. This column sits as a
                direct sibling of the right-side wrapper, so its
                available height is the full main-content area, not
                just the space below the hero. */}
            <div className="w-[280px] shrink-0 flex flex-col justify-center overflow-visible py-1 pl-1">

              <img src="/valkenhall-logo.png" alt="Valkenhall" className="w-full mb-3" draggable={false} />

              <MenuButton title="Find Match" onClick={onFindMatch} dataTutorial="find-match" />
              <MenuButton title="Casual Play" onClick={onPlayMatch} dataTutorial="casual-play" />
              <MenuButton title="Store" onClick={onOpenStore} dataTutorial="store" />
              <MenuButton title="Deck Builder" onClick={onOpenDeckBuilder} dataTutorial="deck-builder" />
              <MenuButton title="Draft" onClick={this.props.onOpenDraft} dataTutorial="draft" />
              <MenuButton title="Guild" onClick={this.props.onOpenGuild} dataTutorial="guild" />
              <MenuButton title="Auction House" onClick={onOpenAuctionHouse} dataTutorial="auction-house" />
              <MenuButton title="Arcane Trials" onClick={onOpenArcaneTrials} dataTutorial="arcane-trials" />
              <div className="relative" data-tutorial="settings">
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

            </div>

            {/* ── RIGHT SIDE: 2-column CSS grid ──
                Left column holds a vertical stack (hero → divider →
                leaderboard). Right column holds the achievements panel
                spanning full height. Using grid means leaderboard +
                achievements share the same parent, while the hero is
                naturally constrained to the leaderboard column's
                width — so w-[60%] mx-auto on the hero centers it over
                the leaderboard, never over the achievements. */}
            {/* overflow-hidden is intentionally NOT set here — the
                CornerPlating elements on each inner panel use a -2px
                offset to overhang the panel edge, and clipping the
                grid wrapper would amputate those plating corners. The
                inner leaderboard / achievements panels already handle
                their own vertical scrolling internally. */}
            <div className="flex-1 min-w-0 grid gap-5 py-4 min-h-0"
                 style={{ gridTemplateColumns: '1fr 320px' }}>

            {/* ── LEFT GRID CELL: hero + divider + leaderboard ── */}
            {/* No overflow-hidden for the same reason as the parent. */}
            <div className="min-w-0 flex flex-col min-h-0">

            {/* ─── HERO: PLAYER IDENTITY ──────────────────── */}
            <div className="relative flex items-center gap-8 py-5 px-6 shrink-0 w-full min-w-0" style={{ background: `url("/tex-noise-panel.webp"), linear-gradient(rgba(12, 10, 8, 0.6), rgba(12, 10, 8, 0.6))`, backdropFilter: 'blur(8px)', border: `1px solid ${GOLD} 0.2)`, borderRadius: '8px' }}>
              <CornerPlating position="top-left" color={`${GOLD} 0.45)`} />
              <CornerPlating position="top-right" color={`${GOLD} 0.45)`} />
              <CornerPlating position="bottom-left" color={`${GOLD} 0.45)`} />
              <CornerPlating position="bottom-right" color={`${GOLD} 0.45)`} />
              {/* Avatar — aged-bronze Viking medallion frames a portrait
                  seated into a recessed well. The medallion reads as
                  engraved metalwork (dark base + muted gold mask + soft
                  inner shadow) rather than a bright gold disc, so the
                  portrait stays the focal point. */}
              <button
                type="button"
                className="relative group shrink-0"
                style={{ width: 140, height: 140, isolation: 'isolate' }}
                onClick={() => this.setState({ showAvatarPicker: true })}
                title="Click to change avatar"
              >
                {/* Ember halo — sits behind the base plate so it only
                    reads as warm light leaking out past the medallion
                    rim. Pulses + scales continuously for an "alive"
                    feel; see .avatar-medallion-ember in app.css. */}
                <div className="avatar-medallion-ember" aria-hidden="true" />

                {/* Base plate — single dark circle with a thin gold rim.
                    Drop shadow lifts the whole badge off the hero panel;
                    the inset shadow carves the frame so the medallion
                    below feels like it sits in a bowl. No outer glow
                    ring — one border + one subtle halo is enough. */}
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: 'radial-gradient(circle at center, rgba(14,10,6,0.96) 0%, rgba(6,4,2,0.98) 100%)',
                    border: `1px solid ${GOLD} 0.42)`,
                    boxShadow: `
                      inset 0 3px 10px rgba(0,0,0,0.85),
                      inset 0 -1px 0 ${GOLD} 0.1),
                      0 6px 22px rgba(0,0,0,0.65),
                      0 0 20px rgba(180,140,60,0.08)
                    `,
                  }}
                />

                {/* Viking medallion ornament — same component + variant
                    + ornament combo the Arcane Trials coin buttons use,
                    so it gets the project's shared cache-bust treatment
                    (CEF/Chromium both aggressively cache CSS mask-image
                    URLs).

                    The SVG's decorative content is inset from its own
                    viewBox edges (outer ring at ~80% of the viewBox
                    diameter) so the default mask-size: contain renders
                    the ornament smaller than the button. Overriding to
                    ~128% scales the mask up until the content reaches
                    the container edges. */}
                <VikingOrnament
                  ornament="style2d007"
                  variant="medallion"
                  color="rgba(204, 162, 74, 1)"
                  opacity={0.62}
                  className="avatar-medallion-fire-shimmer"
                  style={{
                    maskSize: '128%',
                    WebkitMaskSize: '128%',
                    // Layer stone + scratch textures into the medallion
                    // background so the knotwork reads as weathered cast
                    // metal rather than a flat tint. The mask restricts
                    // everything to the ornament's strokes, so the
                    // textures only appear where the knotwork is. The
                    // live hue/brightness shimmer applies to this
                    // composite, so the textured surface glows uniformly
                    // when the metal heats up. Stack (top → bottom):
                    //   1. scratches — overlay blend, subtle wear marks
                    //   2. stone     — soft-light, adds aged depth
                    //   3. radial    — the original gold fade
                    backgroundImage: [
                      "url('/tex-scratches.webp')",
                      "url('/tex-stone.webp')",
                      'radial-gradient(circle at center, rgba(204, 162, 74, 1), transparent 100%)',
                    ].join(', '),
                    backgroundBlendMode: 'overlay, soft-light, normal',
                    backgroundSize: '220px, 260px, 100% 100%',
                    backgroundRepeat: 'repeat, repeat, no-repeat',
                    backgroundPosition: 'center, center, center',
                  }}
                />

                {/* Profile picture — centered, sized so ~12px of the
                    medallion ring shows around the rim. object-position
                    at 22% skips the card title bar that most Sorcery
                    card art includes at the top edge. Border is fully
                    opaque gold so it reads as a clean metal frame
                    seating the portrait against the medallion. */}
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Avatar"
                    className="absolute rounded-full object-cover"
                    style={{
                      width: 112, height: 112,
                      top: 14, left: 14,
                      objectPosition: 'center 22%',
                      border: `1.5px solid ${GOLD} 1)`,
                      boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.5), 0 3px 12px rgba(0,0,0,0.65)`,
                      zIndex: 2,
                    }}
                  />
                ) : (
                  <div
                    className="absolute rounded-full flex items-center justify-center text-2xl"
                    style={{
                      width: 112, height: 112,
                      top: 14, left: 14,
                      background: `${GOLD} 0.08)`,
                      border: `1.5px solid ${GOLD} 1)`,
                      color: `${GOLD} 0.5)`,
                      zIndex: 2,
                    }}
                  >?</div>
                )}

                {/* Level badge — larger, straddling the bottom edge of
                    the profile picture so half sits on the portrait
                    and half on the medallion rim. */}
                <div
                  className="absolute left-1/2 -translate-x-1/2 z-20 flex items-center justify-center"
                  style={{
                    bottom: 2,
                    minWidth: '38px', height: '28px',
                    padding: '0 10px',
                    background: 'linear-gradient(180deg, rgba(60,48,28,0.98) 0%, rgba(28,22,12,0.98) 100%)',
                    border: `2px solid ${GOLD} 0.85)`,
                    borderRadius: '14px',
                    boxShadow: `0 3px 10px rgba(0,0,0,0.75), inset 0 1px 0 ${GOLD} 0.2)`,
                  }}
                >
                  <span className="text-sm font-bold tabular-nums" style={{ color: ACCENT_GOLD, textShadow: '0 1px 2px rgba(0,0,0,0.7)' }}>{level}</span>
                </div>

                {/* Hover overlay — matches the profile picture bounds
                    so the "Change" label sits on the avatar itself,
                    not on the medallion ring. */}
                <div
                  className="absolute rounded-full bg-black/0 group-hover:bg-black/55 flex items-center justify-center transition-all"
                  style={{
                    width: 112, height: 112,
                    top: 14, left: 14,
                    zIndex: 3,
                  }}
                >
                  <span className="text-white/0 group-hover:text-white/90 text-xs font-medium transition-all" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>Change</span>
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

            {/* my-4 gives equal vertical breathing room above and
                below the divider so it sits centered between the hero
                panel and the leaderboard panel. */}
            <OrnamentalDivider className="shrink-0 my-4" />

              {/* ── LEADERBOARD ── sits directly under the hero inside
                  the center column wrapper opened above. Achievements
                  now live as a full-height sibling of this center
                  column (see the closing tag after the leaderboard),
                  so the hero is centred only over the leaderboard. */}
              <div className="flex-1 min-w-0 flex flex-col min-h-0">
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
                    {/* Search */}
                    <input
                      type="text"
                      value={leaderboardSearch}
                      placeholder="Search..."
                      className="w-full mt-3 px-2.5 py-1 text-[10px] outline-none"
                      style={{
                        background: 'rgba(0,0,0,0.25)',
                        border: `1px solid ${GOLD} 0.12)`,
                        borderRadius: '6px',
                        color: '#A6A09B',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
                      }}
                      onInput={(e) => this.setState({ leaderboardSearch: e.target.value })}
                    />
                    {/* Tier filter tabs */}
                    <div className="flex items-center mt-2" style={TAB_BAR_STYLE}>
                      {[{ value: 'all', label: 'All' }, ...TIERS.map(t => ({ value: t, label: TIER_LABELS[t] }))].map((t) => (
                        <button
                          key={t.value}
                          type="button"
                          className="shrink-0 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide transition-all cursor-pointer"
                          style={leaderboardFilter === t.value ? TAB_ACTIVE : TAB_INACTIVE}
                          onClick={() => this.setState({ leaderboardFilter: t.value })}
                        >
                          {t.label}
                        </button>
                      ))}
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

            </div>
            {/* ── end LEFT GRID CELL ── */}

            {/* ── RIGHT GRID CELL: ACHIEVEMENTS (full-height) ──
                Sibling of the left cell inside the right-side grid,
                so it shares the same parent as the leaderboard and
                the two are laid out side-by-side by grid-template
                -columns. */}
            <div className="flex flex-col min-h-0">
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
                            {unlocked && (
                              <span className="text-[9px] shrink-0 font-semibold flex items-center gap-1" style={{ color: '#d4a843' }}>
                                <CoinIcon size={9} />
                                +{a.coins}
                              </span>
                            )}
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

        {/* ─── ONBOARDING TUTORIAL ──────────────────────────── */}
        {this.state.showHubTutorial && (
          <TutorialOverlay
            steps={HUB_TUTORIAL_STEPS}
            onDismiss={this.handleHubTutorialDismiss}
          />
        )}

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
