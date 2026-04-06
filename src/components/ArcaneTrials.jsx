import { Component } from 'preact';
import { playUI, UI } from '../utils/arena/uiSounds';
import { getSeasonLevel, getNextTierInfo, canClaimTier, getTimeRemaining } from '../utils/arena/seasonPass';
import RuneSpinner from './RuneSpinner';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD,
  BEVELED_BTN, GOLD_BTN, VIGNETTE, PANEL_BG,
  CornerPlating, OrnamentalDivider,
  getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';

const TIER_NODE_BORDER_LOCKED = `1px solid ${GOLD} 0.15)`;
const TIER_NODE_BORDER_UNLOCKABLE = `1px solid ${GOLD} 0.55)`;
const TIER_NODE_BORDER_CLAIMED = `1px solid ${GOLD} 0.2)`;

export default class ArcaneTrials extends Component {
  constructor(props) {
    super(props);
    this.state = {
      viewScale: getViewportScale(),
      claiming: null,
    };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
  }

  componentWillUnmount() {
    this.unsubScale?.();
  }

  handleClaim = async (level) => {
    this.setState({ claiming: level });
    try {
      await this.props.onClaimReward(level);
    } finally {
      this.setState({ claiming: null });
    }
  };

  renderProgressBar() {
    const { season, progress } = this.props;
    const { tiers } = season;
    const { seasonXp } = progress;
    const maxXp = tiers[tiers.length - 1].xpRequired;
    const fillPct = Math.min(100, (seasonXp / maxXp) * 100);

    return (
      <div className="w-full">
        <div className="relative h-5 rounded-full overflow-hidden" style={{
          background: 'rgba(0,0,0,0.5)',
          border: `1px solid ${GOLD} 0.25)`,
        }}>
          <div className="absolute inset-0 rounded-full" style={{
            width: `${fillPct}%`,
            background: 'linear-gradient(90deg, #8b6914, #d4a843, #f0d060)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 0 12px rgba(212,168,67,0.3)',
            transition: 'width 0.5s ease-out',
          }} />
          {tiers.map((tier) => {
            const pct = (tier.xpRequired / maxXp) * 100;
            return (
              <div
                key={tier.level}
                className="absolute top-0 bottom-0 w-px"
                style={{
                  left: `${pct}%`,
                  background: `${GOLD} 0.35)`,
                }}
              />
            );
          })}
        </div>
      </div>
    );
  }

  renderTierNode(tier) {
    const { progress } = this.props;
    const { seasonXp, claimedTiers } = progress;
    const { claiming } = this.state;
    const isClaimed = claimedTiers.includes(tier.level);
    const claimable = canClaimTier(tier.level, seasonXp, claimedTiers, this.props.season.tiers);
    const isClaimingThis = claiming === tier.level;

    const border = isClaimed ? TIER_NODE_BORDER_CLAIMED
      : claimable ? TIER_NODE_BORDER_UNLOCKABLE
      : TIER_NODE_BORDER_LOCKED;

    const { reward } = tier;
    const foilCardName = reward.foilCardName || null;
    const foilRarity = reward.foilRarity || null;

    return (
      <div
        key={tier.level}
        className="relative flex flex-col items-center p-3 rounded-lg"
        style={{
          background: PANEL_BG,
          border,
          opacity: isClaimed ? 0.6 : 1,
          boxShadow: claimable ? `0 0 16px rgba(212,168,67,0.15)` : 'none',
          transition: 'opacity 0.3s, border-color 0.3s, box-shadow 0.3s',
        }}
      >
        <CornerPlating position="top-left" />
        <CornerPlating position="top-right" />
        <CornerPlating position="bottom-left" />
        <CornerPlating position="bottom-right" />

        <div className="text-xs font-bold arena-heading mb-1" style={{ color: TEXT_PRIMARY }}>
          Tier {tier.level}
        </div>
        <div className="text-[10px] mb-2" style={{ color: TEXT_MUTED }}>
          {tier.xpRequired} XP
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-1 mb-2">
          {reward.coins ? (
            <div className="text-sm font-bold" style={{ color: '#f0d060' }}>
              {reward.coins} gold
            </div>
          ) : null}
          {foilCardName ? (
            <div className="text-center">
              <div className="text-xs font-semibold" style={{ color: '#6dd5ed' }}>
                Foil
              </div>
              <div className="text-xs font-medium" style={{ color: TEXT_BODY }}>
                {foilCardName}
              </div>
              <div className="text-[10px]" style={{ color: TEXT_MUTED }}>
                {foilRarity}
              </div>
            </div>
          ) : null}
        </div>

        {isClaimed ? (
          <div className="text-xs font-semibold" style={{ color: TEXT_MUTED }}>Claimed</div>
        ) : claimable ? (
          <button
            type="button"
            className="px-3 py-1 text-xs font-bold uppercase tracking-wider transition-all hover:scale-[1.05] active:scale-[0.95] flex items-center gap-1"
            style={{ ...GOLD_BTN }}
            data-sound={UI.CONFIRM}
            disabled={isClaimingThis}
            onClick={() => this.handleClaim(tier.level)}
          >
            {isClaimingThis ? <RuneSpinner size={14} /> : 'Claim'}
          </button>
        ) : (
          <div className="text-xs font-semibold" style={{ color: TEXT_MUTED }}>Locked</div>
        )}
      </div>
    );
  }

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

  render() {
    const { season, progress, onBack } = this.props;
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

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full overflow-y-auto" style={{ zoom: viewScale }}>

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4" style={{
            background: 'rgba(8,6,4,0.7)',
            borderBottom: `1px solid ${GOLD} 0.15)`,
          }}>
            <button
              type="button"
              className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all hover:scale-[1.03] active:scale-[0.97]"
              style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '4px' }}
              data-sound={UI.CANCEL}
              onClick={onBack}
            >
              Back
            </button>

            <div className="text-center">
              <h1 className="text-2xl font-bold arena-heading" style={{
                color: TEXT_PRIMARY,
                textShadow: '0 2px 8px rgba(0,0,0,0.6), 0 0 30px rgba(180,140,60,0.15)',
              }}>
                {season.name}
              </h1>
              <div className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
                {timeLeft.expired
                  ? 'Season ended'
                  : `${timeLeft.days}d ${timeLeft.hours}h remaining`}
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs" style={{ color: TEXT_MUTED }}>Season XP</div>
              <div className="text-lg font-bold arena-heading" style={{ color: ACCENT_GOLD }}>
                {seasonXp.toLocaleString()}
              </div>
              <div className="text-[10px]" style={{ color: TEXT_MUTED }}>
                Tier {currentLevel} / {season.tiers.length}
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 flex flex-col items-center px-6 py-6 gap-6">

            {/* Reward Track — horizontal scrollable bar with nodes on the line */}
            <div className="w-full max-w-5xl">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold arena-heading" style={{ color: TEXT_PRIMARY }}>
                  Reward Track
                </div>
                {nextTier ? (
                  <div className="text-xs" style={{ color: TEXT_MUTED }}>
                    Next reward in <span style={{ color: ACCENT_GOLD }}>{nextTier.xpRemaining} XP</span>
                  </div>
                ) : (
                  <div className="text-xs" style={{ color: ACCENT_GOLD }}>All rewards unlocked!</div>
                )}
              </div>

              <div className="relative overflow-x-auto pb-3" style={{ scrollbarWidth: 'thin', scrollbarColor: `${GOLD} 0.2) transparent` }}>
                <div className="relative flex items-center" style={{ minWidth: '900px', height: '140px', padding: '0 40px' }}>
                  {/* Track line */}
                  <div className="absolute left-10 right-10 top-1/2 -translate-y-1/2 h-1.5 rounded-full" style={{ background: `${GOLD} 0.1)`, border: `1px solid ${GOLD} 0.08)` }}>
                    {/* Filled portion */}
                    <div className="h-full rounded-full" style={{
                      width: `${Math.min(100, (seasonXp / maxXp) * 100)}%`,
                      background: 'linear-gradient(90deg, #8b6914, #d4a843, #f0d060)',
                      boxShadow: '0 0 8px rgba(212,168,67,0.4)',
                      transition: 'width 0.5s ease-out',
                    }} />
                  </div>

                  {/* Reward nodes on the track */}
                  <div className="relative flex justify-between w-full">
                    {season.tiers.map(tier => {
                      const isClaimed = progress.claimedTiers.includes(tier.level);
                      const unlocked = seasonXp >= tier.xpRequired;
                      const claimable = unlocked && !isClaimed;
                      const isFoilReward = !!tier.reward.foilCardName;

                      return (
                        <div key={tier.level} className="flex flex-col items-center" style={{ width: '80px' }}>
                          {/* Reward icon node */}
                          <button
                            type="button"
                            className="relative flex flex-col items-center justify-center transition-all duration-300"
                            style={{
                              width: isFoilReward ? 64 : 52,
                              height: isFoilReward ? 64 : 52,
                              borderRadius: isFoilReward ? '12px' : '50%',
                              background: isClaimed
                                ? `linear-gradient(135deg, rgba(180,140,50,0.25), rgba(120,90,20,0.15))`
                                : unlocked
                                  ? `linear-gradient(135deg, rgba(180,140,50,0.15), rgba(80,60,20,0.1))`
                                  : 'rgba(20,16,10,0.8)',
                              border: isClaimed
                                ? `2px solid ${GOLD} 0.6)`
                                : claimable
                                  ? `2px solid ${GOLD} 0.5)`
                                  : `1px solid ${GOLD} 0.15)`,
                              boxShadow: isClaimed
                                ? `0 0 16px rgba(212,168,67,0.3), inset 0 0 12px rgba(212,168,67,0.1)`
                                : claimable
                                  ? `0 0 12px rgba(212,168,67,0.2)`
                                  : 'none',
                              cursor: claimable ? 'pointer' : 'default',
                              transform: claimable ? 'scale(1.08)' : 'scale(1)',
                            }}
                            data-sound={claimable ? UI.CONFIRM : undefined}
                            disabled={!claimable || this.state.claiming === tier.level}
                            onClick={() => claimable && this.handleClaim(tier.level)}
                          >
                            {/* Claimed checkmark */}
                            {isClaimed ? (
                              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px]" style={{
                                background: 'linear-gradient(135deg, #d4a843, #8b6914)',
                                border: '1.5px solid rgba(255,255,255,0.2)',
                                color: '#fff',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                                zIndex: 2,
                              }}>
                                ✓
                              </div>
                            ) : null}

                            {/* Shimmer on claimed */}
                            {isClaimed ? (
                              <div className="absolute inset-0 rounded-inherit overflow-hidden" style={{ borderRadius: 'inherit' }}>
                                <div className="absolute inset-0" style={{
                                  background: `linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.12) 50%, transparent 70%)`,
                                  animation: 'shimmer-slide 3s ease-in-out infinite',
                                }} />
                              </div>
                            ) : null}

                            {/* Reward content */}
                            {tier.reward.coins && !isFoilReward ? (
                              <div className="text-xs font-bold" style={{ color: isClaimed ? TEXT_MUTED : '#f0d060' }}>
                                {tier.reward.coins}
                              </div>
                            ) : null}
                            {tier.reward.coins && isFoilReward ? (
                              <div className="text-[9px] font-bold" style={{ color: isClaimed ? TEXT_MUTED : '#f0d060' }}>
                                +{tier.reward.coins}
                              </div>
                            ) : null}
                            {isFoilReward ? (
                              <div className="text-[9px] font-semibold text-center leading-tight px-0.5" style={{ color: isClaimed ? TEXT_MUTED : '#6dd5ed' }}>
                                {tier.reward.foilRarity === 'Unique' ? '✦' : '◆'}
                              </div>
                            ) : null}

                            {this.state.claiming === tier.level ? <RuneSpinner size={16} /> : null}
                          </button>

                          {/* Label below node */}
                          <div className="text-[9px] font-bold mt-1" style={{ color: unlocked ? ACCENT_GOLD : TEXT_MUTED }}>
                            Tier {tier.level}
                          </div>
                          {isFoilReward ? (
                            <div className="text-[8px] text-center leading-tight truncate w-full" style={{ color: isClaimed ? TEXT_MUTED : TEXT_BODY }}>
                              {tier.reward.foilCardName}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <OrnamentalDivider className="w-full max-w-4xl" />

            {/* Active Quests */}
            <div className="w-full max-w-4xl">
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
      </div>
    );
  }
}
