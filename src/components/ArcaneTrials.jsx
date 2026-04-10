import { Component } from 'preact';
import { cn } from '../lib/utils';
import { playUI, UI } from '../utils/arena/uiSounds';
import { getSeasonLevel, getNextTierInfo, canClaimTier, getTimeRemaining } from '../utils/arena/seasonPass';
import RuneSpinner from './RuneSpinner';
import DeckCardTile from './DeckCardTile';
import CardInspector, { RARITY_COLORS } from './CardInspector';
import AppHeader from './AppHeader';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD, COIN_COLOR,
  BEVELED_BTN, VIGNETTE, PANEL_BG,
  CornerPlating, FourCorners, OrnamentalDivider,
  getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';
import VikingOrnament from './VikingOrnament';
import { CoinIcon, ShardIcon } from './ui/icons';
import TutorialOverlay from './TutorialOverlay';
import { shouldAutoPlay, markTutorialSeen, hydrateTutorialState } from '../utils/arena/tutorialState';

const FOIL_TIERS = new Set([3, 5, 7, 10]);

const TRIALS_TUTORIAL_KEY = 'arcane-trials';

const TRIALS_TUTORIAL_STEPS = [
  {
    key: 'welcome',
    title: 'Welcome to the Arcane Trials',
    body: 'The Arcane Trials is Valkenhall\'s seasonal progression pass. Every cycle runs for two weeks and rotates through a featured set, bringing fresh foil rewards and a fresh quest pool. Play matches, finish quests, climb the track — that\'s the whole loop.',
  },
  {
    key: 'xp-summary',
    title: 'Season XP',
    body: 'Your total Season XP and current tier sit in the header. Every match you play awards Season XP automatically, on top of the gold and match XP you already earn. The bigger number here means you\'re closer to the next tier reward.',
    selector: '[data-tutorial="trials-xp-summary"]',
  },
  {
    key: 'reward-track',
    title: 'The Reward Track',
    body: 'Ten tiers of rewards sit along the progress bar. Each tier unlocks as you cross its XP threshold — coins and Arcana Shards on even tiers, and foil cards on tiers 3, 5, 7, and 10. The featured set rotates every cycle, so each season\'s foils come from a different pool.',
    selector: '[data-tutorial="trials-reward-track"]',
  },
  {
    key: 'claiming',
    title: 'Claim Your Rewards',
    body: 'When a tier is unlocked, its reward medallion glows gold — click it to claim. Coins and shards drop into your wallet, foil cards join your collection, and the claimed tier dims to grey so you can see at a glance what\'s left to collect.',
  },
  {
    key: 'quests',
    title: 'Active Quests',
    body: 'Three quests are always active at the bottom of the screen — things like "win 5 matches", "win with a Water deck", or "open 3 boosters". Completing a quest drops a chunk of bonus Season XP, and a new quest rotates in from the season pool to replace it.',
    selector: '[data-tutorial="trials-quests"]',
  },
  {
    key: 'fair-play',
    title: 'Play For the Journey',
    body: 'You earn Season XP for every match you play, win or lose — so you progress just by showing up and having a good time. The pass is about enjoying the rhythm of a season, not grinding a leaderboard. When the cycle ends, a fresh set of rewards rolls in and the journey starts again.',
  },
];

export default class ArcaneTrials extends Component {
  constructor(props) {
    super(props);
    this.state = {
      viewScale: getViewportScale(),
      claiming: null,
      hoveredCard: null,
      inspectedEntry: null,
      showTrialsTutorial: false,
    };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
    document.addEventListener('keydown', this.handleKeyDown);

    // First-run onboarding, deferred so the reward track + quests
    // have laid out before the overlay measures its targets. Waits
    // on hydration so the on-disk seen flag is read first.
    const profileId = this.props.profile?.id;
    if (profileId) {
      hydrateTutorialState().then(() => {
        if (this._unmounted) return;
        if (!shouldAutoPlay(profileId, TRIALS_TUTORIAL_KEY)) return;
        this._tutorialTimer = setTimeout(() => {
          if (!this._unmounted) this.setState({ showTrialsTutorial: true });
        }, 600);
      });
    }
  }

  componentWillUnmount() {
    this._unmounted = true;
    if (this._tutorialTimer) clearTimeout(this._tutorialTimer);
    this.unsubScale?.();
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  handleTrialsTutorialDismiss = () => {
    const profileId = this.props.profile?.id;
    if (profileId) markTutorialSeen(profileId, TRIALS_TUTORIAL_KEY);
    this.setState({ showTrialsTutorial: false });
  };

  handleKeyDown = (e) => {
    if ((e.key === ' ' || e.code === 'Space') && !e.target?.isContentEditable && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) {
      e.preventDefault();
      if (this.state.inspectedEntry) {
        this.setState({ inspectedEntry: null });
      } else if (this.state.hoveredCard) {
        this.setState({ inspectedEntry: this.state.hoveredCard });
      }
    }
    if (e.key === 'Escape' && this.state.inspectedEntry) {
      this.setState({ inspectedEntry: null });
    }
  };

  handleClaim = async (level) => {
    this.setState({ claiming: level });
    try {
      await this.props.onClaimReward(level);
    } finally {
      this.setState({ claiming: null });
    }
  };

  renderQuestCard(activeQuest) {
    const { season } = this.props;
    const template = season.questPool.find(q => q.id === activeQuest.questId);
    if (!template) return null;

    const progressPct = Math.min(100, (activeQuest.progress / template.target) * 100);

    return (
      <div
        key={activeQuest.questId}
        className="relative flex flex-col p-4 rounded-lg"
        style={{
          background: PANEL_BG,
          border: `1px solid ${GOLD} 0.2)`,
        }}
      >
        <CornerPlating position="top-left" />
        <CornerPlating position="top-right" />
        <CornerPlating position="bottom-left" />
        <CornerPlating position="bottom-right" />

        <div className="text-sm font-bold arena-heading mb-1" style={{ color: TEXT_PRIMARY }}>
          {template.name}
        </div>
        <div className="text-xs mb-3" style={{ color: TEXT_BODY }}>
          {template.description}
        </div>

        <div className="relative h-3 rounded-full overflow-hidden mb-2" style={{
          background: 'rgba(0,0,0,0.4)',
          border: `1px solid ${GOLD} 0.15)`,
        }}>
          <div className="absolute inset-0 rounded-full" style={{
            width: `${progressPct}%`,
            background: 'linear-gradient(90deg, #8b6914, #d4a843)',
            transition: 'width 0.4s ease-out',
          }} />
        </div>
        <div className="flex items-center justify-between">
          <div className="text-xs" style={{ color: TEXT_MUTED }}>
            {activeQuest.progress} / {template.target}
          </div>
          <div className="text-xs font-bold" style={{ color: ACCENT_GOLD }}>
            +{template.xpReward} XP
          </div>
        </div>
      </div>
    );
  }

  // Small dark + gold + recessed checkmark badge used to mark a tier
  // reward as already claimed. Anchored to the top-right corner of its
  // positioning ancestor. Used by both the foil card branch (anchored
  // to the DeckCardTile) and the medallion branch (anchored to the
  // 60×60 button wrapper).
  renderClaimedCheck() {
    return (
      <div
        className="absolute flex items-center justify-center z-10"
        style={{
          width: 22,
          height: 22,
          top: -4,
          right: -4,
          borderRadius: '50%',
          background: 'linear-gradient(180deg, rgba(8,6,4,0.97) 0%, rgba(20,15,6,0.97) 100%)',
          border: `1.5px solid ${ACCENT_GOLD}`,
          // Inset shadow on top + warm hint on bottom = engraved feel.
          // Outer drop-shadow grounds it on the panel.
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.7), inset 0 -1px 0 rgba(255,220,140,0.18), 0 1px 4px rgba(0,0,0,0.5)',
          color: ACCENT_GOLD,
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.6))' }}>
          <path d="M5 12 L10 17 L20 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  render() {
    const {
      season, progress, onBack, profile,
      onToggleMailbox, mailboxUnreadCount, mailboxDropdown,
      onToggleFriends, friendListData,
    } = this.props;
    const { viewScale } = this.state;

    if (!season || !progress) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: '#08080a' }}>
          <RuneSpinner size={48} />
        </div>
      );
    }

    const { seasonXp } = progress;
    const currentLevel = getSeasonLevel(seasonXp, season.tiers);
    const nextTier = getNextTierInfo(seasonXp, season.tiers);
    const timeLeft = getTimeRemaining(season.endsAt);
    const maxXp = season.tiers[season.tiers.length - 1].xpRequired;

    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{
        background: `url("/deck-builder-bg-dimmed.webp") center no-repeat, #08080a`,
        backgroundSize: '100% 100%',
      }}>
        {/* Vignette */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: VIGNETTE }} />

        {/* Unified app header — Back + Season XP summary on the left,
            shared gold/shards/mail/friends slot on the right. */}
        <AppHeader
          profile={profile}
          onToggleMailbox={onToggleMailbox}
          mailboxUnreadCount={mailboxUnreadCount}
          mailboxDropdown={mailboxDropdown}
          draftQueueDropdown={this.props.draftQueueDropdown}
          onToggleFriends={onToggleFriends}
          friendListData={friendListData}
          zoom={viewScale}
        >
          <button
            type="button"
            data-sound={UI.CANCEL}
            className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
            style={{ ...BEVELED_BTN, color: TEXT_BODY }}
            onClick={onBack}
          >
            &#8592; Back
          </button>
          <div data-tutorial="trials-xp-summary" className="flex items-center gap-2 ml-2">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: TEXT_MUTED }}>Season XP</span>
            <span className="text-lg font-bold tabular-nums arena-heading" style={{ color: ACCENT_GOLD, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
              {seasonXp.toLocaleString()}
            </span>
            <span className="text-[10px] uppercase tracking-wider" style={{ color: TEXT_MUTED }}>
              · Tier {currentLevel} / {season.tiers.length}
            </span>
          </div>
        </AppHeader>

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full overflow-y-auto" style={{ zoom: viewScale }}>
          {/* Title plate — wide, shallow, inset nameplate. The plate is
              carved into the view via a multi-layer inset box-shadow;
              a dark radial gradient pulls the center into shadow so the
              text sits in a "well"; and the Viking ornament is both
              embossed (mix-blend-mode: overlay) AND textured with the
              project's shared tex-noise grain so it reads as engraved,
              weathered metalwork rather than a flat stamp. */}
          <div className="flex justify-center pt-6 pb-2 shrink-0">
            {/* Outer plate — border, background, inset shadow. NO
                overflow-hidden here so FourCorners (which sits at
                -2px offsets from the edges) can render past the
                border without being clipped. */}
            <div
              className="relative rounded-xl text-center"
              style={{
                background: 'linear-gradient(180deg, rgba(20,16,10,0.94) 0%, rgba(8,6,4,0.98) 100%)',
                border: `1px solid ${GOLD} 0.32)`,
                boxShadow: `
                  inset 0 6px 18px rgba(0,0,0,0.8),
                  inset 0 2px 4px rgba(0,0,0,0.6),
                  inset 0 -1px 0 ${GOLD} 0.1),
                  0 4px 14px rgba(0,0,0,0.45),
                  0 0 22px rgba(180,140,60,0.06)
                `,
                minWidth: 720,
                padding: '12px 64px 10px',
                isolation: 'isolate',
              }}
            >
              {/* Inner clip wrapper — contains the ornament and depth
                  shadow layers. overflow-hidden here (instead of on
                  the outer plate) so the decorative layers clip to
                  the rounded corners WITHOUT clipping the corner
                  plating brackets that need to sit at the edges. */}
              <div
                aria-hidden="true"
                className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none"
              >
                {/* Base ornament — flat gold at 0.05 so it sits very
                    subtly in the background. Uses VikingOrnament so
                    the URL gets the per-session cache-bust (CEF and
                    browsers aggressively cache CSS mask-image URLs).
                    The style override fills the whole clip wrapper
                    with mask-size: cover instead of the centerpiece
                    variant's default 72%-width + contain sizing. */}
                <VikingOrnament
                  ornament="style2c005"
                  variant="centerpiece"
                  color="rgba(212, 168, 67, 1)"
                  opacity={0.05}
                  style={{
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: '100%',
                    transform: 'none',
                    maskSize: 'cover',
                    WebkitMaskSize: 'cover',
                  }}
                />

                {/* Circular depth shadow — sits ABOVE the ornament so
                    it darkens the ornament in the center where the
                    title lives, producing the "text in a shadow well"
                    look. 320px circle covers the full text width and
                    fades cleanly to transparent before the corners. */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'radial-gradient(circle 320px at center, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.5) 30%, rgba(0,0,0,0.18) 65%, transparent 100%)',
                  }}
                />
              </div>

              {/* Corner plating — siblings of the clip wrapper, not
                  children, so overflow-hidden doesn't clip their
                  -2px edge offsets. Radius 14 (plate radius 12 + 2px
                  offset) makes the bracket curves concentric with the
                  plate's rounded-xl corners so they hug the edge
                  cleanly instead of sitting slightly inside it. */}
              <FourCorners radius={14} />

              <h1 className="relative text-[26px] leading-tight font-bold arena-heading tracking-wide" style={{
                color: TEXT_PRIMARY,
                textShadow: '0 2px 10px rgba(0,0,0,0.92), 0 0 28px rgba(180,140,60,0.22)',
              }}>
                {season.name}
              </h1>
              <div className="relative text-[10px] uppercase tracking-[0.18em] mt-1" style={{ color: TEXT_MUTED }}>
                {timeLeft.expired
                  ? 'Season ended'
                  : `${timeLeft.days}d ${timeLeft.hours}h remaining`}
              </div>
            </div>
          </div>

          {/* Body — reward track centered, quests pinned to bottom */}
          <div className="flex-1 flex flex-col min-h-0">

            {/* Reward Track — vertically centered in available space.
                One shared container holds the header row, the reward
                track row, and the progress bar with a uniform horizontal
                padding. Every tier-positioned element (reward circles,
                bar ticks, XP labels) uses the SAME xp-based coordinate
                system: left: ${(xpRequired / maxXp) * 100}% with a
                translateX(-50%) centering transform. This makes the
                visual layout match the fill math exactly — tier 1 at
                150 XP sits at 4.2% of the bar, NOT at 0% just because
                it's the first in the array. */}
            <div className="flex-1 flex items-center justify-center px-6">
            <div className="w-full" style={{ paddingLeft: 72, paddingRight: 72 }}>
              <div className="flex items-center justify-end mb-4">
                {nextTier ? (
                  <div className="text-xs" style={{ color: TEXT_MUTED }}>
                    Next reward in <span style={{ color: ACCENT_GOLD }}>{nextTier.xpRemaining} XP</span>
                  </div>
                ) : (
                  <div className="text-xs" style={{ color: ACCENT_GOLD }}>All rewards unlocked!</div>
                )}
              </div>

              {/* Rewards row — absolute-positioned tier cards anchored
                  at each tier's xp percentage. The container is a fixed
                  240px tall so foil cards (the tallest items) have room,
                  and each tier is centered on its target percentage via
                  translateX(-50%). */}
              <div data-tutorial="trials-reward-track" className="relative" style={{ height: 240 }}>
                {season.tiers.map((tier, idx) => {
                  const { reward } = tier;
                  const isClaimed = progress.claimedTiers.includes(tier.level);
                  const unlocked = seasonXp >= tier.xpRequired;
                  const claimable = canClaimTier(tier.level, seasonXp, progress.claimedTiers, season.tiers);
                  const isFoil = FOIL_TIERS.has(tier.level);
                  const locked = !unlocked && !isClaimed;
                  const isClaimingThis = this.state.claiming === tier.level;
                  const xpPct = (tier.xpRequired / maxXp) * 100;

                  return (
                    <div
                      key={tier.level}
                      className="absolute bottom-0 flex flex-col items-center"
                      style={{
                        left: `${xpPct}%`,
                        transform: 'translateX(-50%)',
                        width: 120,
                      }}
                    >
                      <div
                        className="relative w-full transition-all duration-300"
                        style={{
                          // Claimed tiers stay at full opacity now — the
                          // pulsing glow on the button is what marks them
                          // as "achieved" instead of dimming, which made
                          // them look retired/locked.
                          transform: claimable ? 'scale(1.04) translateY(-4px)' : 'scale(1)',
                        }}
                      >
                        {isFoil ? (() => {
                          const card = this.props.sorceryCards?.find(c => c.unique_id === reward.foilCardId);
                          const printing = card?.printings?.find(p => p.unique_id === reward.foilPrintingId) || card?.printings?.[0];
                          if (!card || !printing) return <div className="aspect-[63/88] rounded-lg" style={{ background: PANEL_BG }} />;

                          return (
                            <div className="relative w-full">
                              <DeckCardTile
                                entry={{ card, printing, zone: 'spellbook', entryIndex: 0 }}
                                isSelected={false}
                                onClick={() => claimable && this.handleClaim(tier.level)}
                                onHoverChange={(hovered) => this.setState({ hoveredCard: hovered ? { card, printing } : null })}
                              />
                              {isClaimed ? this.renderClaimedCheck() : null}
                            </div>
                          );
                        })() : (() => {
                          const hasShards = reward.arcanaShards > 0;
                          // Tiers that grant Arcana Shards make shards the
                          // headline reward — bigger glyph, cyan tint —
                          // and demote the coin amount to a small corner
                          // badge. Plain gold tiers keep the original
                          // layout (coin number centered in the circle).
                          return (
                            <div className="flex justify-center">
                              {/* Anchor wrapper sized to the button so any
                                  corner badges position relative to the
                                  circle itself, not the full-width tier
                                  column above. */}
                              <div className="relative" style={{ width: 60, height: 60 }}>
                                <button
                                  type="button"
                                  className={cn(
                                    'absolute inset-0 flex items-center justify-center transition-all duration-300 overflow-hidden',
                                    isClaimed && (hasShards ? 'tier-claimed-glow-shard' : 'tier-claimed-glow-gold'),
                                  )}
                                  style={{
                                    borderRadius: '50%',
                                    background: 'rgba(20,16,10,0.85)',
                                    border: claimable
                                      ? `2px solid ${hasShards ? 'rgba(125,211,252,0.7)' : `${GOLD} 0.6)`}`
                                      : isClaimed
                                        ? `2px solid ${hasShards ? 'rgba(125,211,252,0.55)' : `${GOLD} 0.55)`}`
                                        : `1px solid ${hasShards ? 'rgba(125,211,252,0.18)' : `${GOLD} 0.12)`}`,
                                    // Inline boxShadow only for the claimable
                                    // halo. Claimed circles use the keyframe
                                    // animation class above; locked circles
                                    // get nothing.
                                    boxShadow: claimable
                                      ? hasShards
                                        ? '0 0 16px rgba(125,211,252,0.45)'
                                        : '0 0 16px rgba(212,168,67,0.35)'
                                      : undefined,
                                    cursor: claimable ? 'pointer' : 'default',
                                    isolation: 'isolate',
                                  }}
                                  data-sound={claimable ? UI.CONFIRM : undefined}
                                  disabled={!claimable || isClaimingThis}
                                  onClick={() => claimable && this.handleClaim(tier.level)}
                                >
                                  <VikingOrnament
                                    ornament="style2d007"
                                    variant="medallion"
                                    color={hasShards ? 'rgba(125, 211, 252, 0.9)' : 'rgba(232, 200, 130, 0.9)'}
                                    opacity={claimable ? 0.85 : 0.55}
                                    style={{
                                      maskSize: '128%',
                                      WebkitMaskSize: '128%',
                                    }}
                                  />
                                  {hasShards ? (
                                    <div className="relative flex items-center gap-0.5" style={{ color: '#7dd3fc', textShadow: '0 1px 3px rgba(0,0,0,0.85), 0 0 8px rgba(0,0,0,0.6)' }}>
                                      <ShardIcon size={11} />
                                      <span className="text-base font-bold tabular-nums leading-none">{reward.arcanaShards}</span>
                                    </div>
                                  ) : (
                                    <div className="relative flex items-center gap-1 text-base font-bold" style={{ color: '#f0d060', textShadow: '0 1px 3px rgba(0,0,0,0.85), 0 0 6px rgba(0,0,0,0.55)' }}>
                                      <CoinIcon size={14} />
                                      {reward.coins}
                                    </div>
                                  )}
                                  {isClaimingThis ? <div className="absolute inset-0 flex items-center justify-center rounded-full" style={{ background: 'rgba(0,0,0,0.5)' }}><RuneSpinner size={16} /></div> : null}
                                </button>
                                {/* Circular coin badge — anchored to the
                                    bottom-right of the medallion itself so
                                    it overlaps the rim. Pure circle, not
                                    a pill, holding the coin amount. */}
                                {hasShards ? (
                                  <div
                                    className="absolute flex items-center justify-center gap-0.5 z-10 tabular-nums"
                                    style={{
                                      minWidth: 26,
                                      height: 16,
                                      padding: '0 4px',
                                      bottom: -4,
                                      right: -4,
                                      borderRadius: 8,
                                      background: 'linear-gradient(180deg, rgba(40,30,12,0.97) 0%, rgba(20,15,6,0.97) 100%)',
                                      border: `1.5px solid ${GOLD} 0.55)`,
                                      boxShadow: '0 2px 8px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,220,140,0.15)',
                                      color: COIN_COLOR,
                                      fontSize: 9,
                                      fontWeight: 700,
                                      textShadow: '0 1px 2px rgba(0,0,0,0.7)',
                                      lineHeight: 1,
                                    }}
                                    title={`+${reward.coins} coins`}
                                  >
                                    <CoinIcon size={10} glow={false} />
                                    {reward.coins}
                                  </div>
                                ) : null}
                                {isClaimed ? this.renderClaimedCheck() : null}
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Labels below reward */}
                      <div className="text-[10px] font-bold mt-1.5" style={{ color: unlocked ? ACCENT_GOLD : TEXT_MUTED }}>
                        Tier {tier.level}
                      </div>
                      {isFoil && reward.foilRarity ? (
                        <div className="text-center mt-0.5">
                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{
                            background: 'rgba(0,0,0,0.5)',
                            color: RARITY_COLORS[reward.foilRarity] || TEXT_MUTED,
                          }}>
                            {reward.foilRarity === 'Unique' ? `✦ ${reward.foilRarity}` : `◆ ${reward.foilRarity}`}
                          </span>
                        </div>
                      ) : null}
                      {claimable && !isClaimingThis ? (
                        <button
                          type="button"
                          className="mt-1 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                          style={{ ...BEVELED_BTN, color: ACCENT_GOLD, borderRadius: '4px', background: `${GOLD} 0.15)`, border: `1px solid ${GOLD} 0.35)` }}
                          data-sound={UI.CONFIRM}
                          onClick={() => this.handleClaim(tier.level)}
                        >
                          Claim
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {/* Progress bar — inherits the shared padding from the
                  w-full wrapper above so the bar's 0–100% range lines
                  up perfectly with the reward row's absolute XP-based
                  positioning. No extra padding override here. */}
              <div className="mt-5">
                <div className="relative h-6 rounded-lg overflow-hidden" style={{
                  background: 'rgba(10,8,6,0.7)',
                  border: `1px solid ${GOLD} 0.18)`,
                  boxShadow: `inset 0 2px 6px rgba(0,0,0,0.5), 0 1px 0 ${GOLD} 0.06)`,
                }}>
                  {/* Fill — liquid gold with animated sheen + glitter
                      via .progress-fill-liquid-gold (defined in app.css).
                      Multi-period drifting bright spot (9 s) + glitter
                      field drift (7 s) + layered vertical molten gold
                      gradient. Simple static gold border at the right
                      edge while the bar is partially full. */}
                  <div className="absolute inset-y-0 left-0 rounded-lg progress-fill-liquid-gold" style={{
                    width: `${Math.min(100, (seasonXp / maxXp) * 100)}%`,
                    borderRight: seasonXp > 0 && seasonXp < maxXp ? `2px solid ${GOLD} 0.55)` : 'none',
                    transition: 'width 0.5s ease-out',
                  }} />

                  {/* Minor tick marks — 3 subticks BETWEEN each pair of
                      adjacent tiers, so every segment on the bar is
                      visually divided into quarters. Because tiers are
                      non-uniformly spaced in XP, each segment's subticks
                      also vary in spacing, which correctly reflects the
                      XP curve. The tick's XP value is interpolated
                      between the two surrounding tier thresholds. */}
                  {season.tiers.slice(0, -1).flatMap((tier, idx) => {
                    const nextTier = season.tiers[idx + 1];
                    const segments = 4; // 3 subticks between each tier
                    return Array.from({ length: segments - 1 }, (_, s) => {
                      const frac = (s + 1) / segments;
                      const xpAt = tier.xpRequired + (nextTier.xpRequired - tier.xpRequired) * frac;
                      const pct = (xpAt / maxXp) * 100;
                      const reached = seasonXp >= xpAt;
                      return (
                        <div
                          key={`minor-${tier.level}-${s}`}
                          className="absolute -translate-x-1/2"
                          style={{
                            left: `${pct}%`,
                            top: '22%',
                            bottom: '22%',
                            width: '1px',
                            background: reached ? `${GOLD} 0.28)` : `${GOLD} 0.08)`,
                          }}
                        />
                      );
                    });
                  })}
                  {/* Major tier checkpoint marks — positioned at each
                      tier's actual XP percentage so they line up with
                      both the reward circles above and the bar fill. */}
                  {season.tiers.map((tier) => {
                    const pct = (tier.xpRequired / maxXp) * 100;
                    const reached = seasonXp >= tier.xpRequired;
                    return (
                      <div key={`major-${tier.level}`} className="absolute -translate-x-1/2" style={{
                        left: `${pct}%`,
                        top: '10%',
                        bottom: '10%',
                        width: '2px',
                        background: reached ? `${GOLD} 0.5)` : `${GOLD} 0.15)`,
                        borderRadius: '1px',
                      }} />
                    );
                  })}

                  {/* XP text centered in the bar */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[11px] font-bold" style={{ color: TEXT_PRIMARY, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                      {seasonXp.toLocaleString()} / {maxXp.toLocaleString()} XP
                    </span>
                  </div>
                </div>

                {/* XP threshold row — each label sits centered under
                    its corresponding tier tick using the SAME xp-based
                    percentage math as the tick markers and the reward
                    circles above. */}
                <div className="relative h-4 mt-1.5">
                  {season.tiers.map((tier) => {
                    const pct = (tier.xpRequired / maxXp) * 100;
                    const reached = seasonXp >= tier.xpRequired;
                    return (
                      <span
                        key={`xplabel-${tier.level}`}
                        className="absolute -translate-x-1/2 text-[9px] font-semibold tabular-nums whitespace-nowrap"
                        style={{
                          left: `${pct}%`,
                          top: 0,
                          color: reached ? `${GOLD} 0.45)` : `${GOLD} 0.75)`,
                          letterSpacing: '0.02em',
                        }}
                      >
                        {tier.xpRequired.toLocaleString()}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            </div>
            </div>

            {/* Quest Footer */}
            <div data-tutorial="trials-quests" className="shrink-0 px-6 pb-5 pt-3" style={{ borderTop: `1px solid ${GOLD} 0.1)` }}>
              <OrnamentalDivider className="w-full max-w-4xl mx-auto mb-3" />
            <div className="w-full max-w-4xl mx-auto">
              <h2 className="text-lg font-bold arena-heading mb-4" style={{
                color: TEXT_PRIMARY,
                textShadow: '0 1px 4px rgba(0,0,0,0.5)',
              }}>
                Active Quests
              </h2>
              <div className="grid grid-cols-3 gap-4">
                {progress.activeQuests.map(aq => this.renderQuestCard(aq))}
              </div>
            </div>
          </div>
        </div>
        {this.state.inspectedEntry ? (
          <CardInspector
            card={this.state.inspectedEntry.card}
            imageUrl={this.state.inspectedEntry.printing?.image_url}
            rarity={this.state.inspectedEntry.card?.rarity}
            foiling={this.state.inspectedEntry.printing?.foiling}
            onClose={() => this.setState({ inspectedEntry: null })}
          />
        ) : null}

        {/* First-run Arcane Trials tutorial. */}
        {this.state.showTrialsTutorial && (
          <TutorialOverlay
            steps={TRIALS_TUTORIAL_STEPS}
            onDismiss={this.handleTrialsTutorialDismiss}
          />
        )}
      </div>
    );
  }
}
