import { Component } from 'preact';
import { playUI, UI } from '../utils/arena/uiSounds';
import { getSeasonLevel, getNextTierInfo, canClaimTier, getTimeRemaining } from '../utils/arena/seasonPass';
import RuneSpinner from './RuneSpinner';
import DeckCardTile from './DeckCardTile';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD,
  BEVELED_BTN, VIGNETTE, PANEL_BG,
  CornerPlating, OrnamentalDivider,
  getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';

const FOIL_TIERS = new Set([3, 5, 7, 10]);

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

          {/* Body — reward track centered, quests pinned to bottom */}
          <div className="flex-1 flex flex-col min-h-0">

            {/* Reward Track — vertically centered in available space */}
            <div className="flex-1 flex items-center justify-center px-6">
            <div className="w-full">
              <div className="flex items-center justify-between mb-4 px-4">
                <div className="text-sm font-semibold arena-heading" style={{ color: TEXT_PRIMARY }}>Reward Track</div>
                {nextTier ? (
                  <div className="text-xs" style={{ color: TEXT_MUTED }}>
                    Next reward in <span style={{ color: ACCENT_GOLD }}>{nextTier.xpRemaining} XP</span>
                  </div>
                ) : (
                  <div className="text-xs" style={{ color: ACCENT_GOLD }}>All rewards unlocked!</div>
                )}
              </div>

              {/* Rewards row — justify-between spreads first to last edge-to-edge */}
              <div className="flex items-end justify-between px-4">
                {season.tiers.map((tier, idx) => {
                  const { reward } = tier;
                  const isClaimed = progress.claimedTiers.includes(tier.level);
                  const unlocked = seasonXp >= tier.xpRequired;
                  const claimable = canClaimTier(tier.level, seasonXp, progress.claimedTiers, season.tiers);
                  const isFoil = FOIL_TIERS.has(tier.level);
                  const locked = !unlocked && !isClaimed;
                  const isClaimingThis = this.state.claiming === tier.level;

                  return (
                    <div key={tier.level} className="flex flex-col items-center" style={{ width: '9%' }}>
                      <div
                        className="relative w-full transition-all duration-300"
                        style={{
                          filter: locked ? 'saturate(0.3) brightness(0.5)' : 'none',
                          opacity: isClaimed ? 0.7 : 1,
                          transform: claimable ? 'scale(1.04) translateY(-4px)' : 'scale(1)',
                        }}
                      >
                        {isFoil ? (() => {
                          const card = this.props.sorceryCards?.find(c => c.unique_id === reward.foilCardId);
                          const printing = card?.printings?.find(p => p.unique_id === reward.foilPrintingId) || card?.printings?.[0];
                          if (!card || !printing) return <div className="aspect-[63/88] rounded-lg" style={{ background: PANEL_BG }} />;

                          return (
                            <div className="w-full">
                              <DeckCardTile
                                entry={{ card, printing, zone: 'spellbook', entryIndex: 0 }}
                                isSelected={false}
                                onClick={() => claimable && this.handleClaim(tier.level)}
                              />
                            </div>
                          );
                        })() : (
                          <div className="flex justify-center">
                            <button
                              type="button"
                              className="relative flex items-center justify-center transition-all duration-300"
                              style={{
                                width: 60, height: 60,
                                borderRadius: '50%',
                                background: 'rgba(20,16,10,0.85)',
                                border: claimable ? `2px solid ${GOLD} 0.6)` : isClaimed ? `2px solid ${GOLD} 0.3)` : `1px solid ${GOLD} 0.12)`,
                                boxShadow: claimable ? `0 0 16px rgba(212,168,67,0.35)` : 'none',
                                cursor: claimable ? 'pointer' : 'default',
                              }}
                              data-sound={claimable ? UI.CONFIRM : undefined}
                              disabled={!claimable || isClaimingThis}
                              onClick={() => claimable && this.handleClaim(tier.level)}
                            >
                              <div className="text-base font-bold" style={{ color: '#f0d060' }}>{reward.coins}</div>
                              {isClaimingThis ? <div className="absolute inset-0 flex items-center justify-center rounded-full" style={{ background: 'rgba(0,0,0,0.5)' }}><RuneSpinner size={16} /></div> : null}
                            </button>
                          </div>
                        )}

                        {/* Claimed checkmark */}
                        {isClaimed ? (
                          <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] z-10" style={{
                            background: 'linear-gradient(135deg, #d4a843, #8b6914)',
                            border: '1.5px solid rgba(255,255,255,0.2)',
                            color: '#fff',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                          }}>✓</div>
                        ) : null}
                      </div>

                      {/* Labels below reward */}
                      <div className="text-[10px] font-bold mt-1.5" style={{ color: unlocked ? ACCENT_GOLD : TEXT_MUTED }}>
                        Tier {tier.level}
                      </div>
                      {isFoil ? (
                        <div className="text-center mt-0.5">
                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{
                            background: 'rgba(0,0,0,0.5)',
                            color: reward.foilRarity === 'Unique' ? '#c792ea' : '#6dd5ed',
                          }}>
                            {reward.foilRarity === 'Unique' ? '✦ Unique' : '◆ Elite'}
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

              {/* Progress bar — same padding as reward row so ticks align */}
              <div className="mt-5" style={{ paddingLeft: 'calc(16px + 4.5%)', paddingRight: 'calc(16px + 4.5%)' }}>
                <div className="relative h-6 rounded-lg overflow-hidden" style={{
                  background: 'rgba(10,8,6,0.7)',
                  border: `1px solid ${GOLD} 0.18)`,
                  boxShadow: `inset 0 2px 6px rgba(0,0,0,0.5), 0 1px 0 ${GOLD} 0.06)`,
                }}>
                  {/* Fill */}
                  <div className="absolute inset-y-0 left-0 rounded-lg" style={{
                    width: `${Math.min(100, (seasonXp / maxXp) * 100)}%`,
                    background: 'linear-gradient(180deg, rgba(240,208,96,0.35) 0%, rgba(180,140,50,0.25) 50%, rgba(140,100,20,0.3) 100%)',
                    borderRight: seasonXp > 0 && seasonXp < maxXp ? `2px solid ${GOLD} 0.5)` : 'none',
                    boxShadow: '0 0 12px rgba(212,168,67,0.2)',
                    transition: 'width 0.5s ease-out',
                  }} />

                  {/* Minor tick marks — every ~850 XP (10 segments between tiers) */}
                  {Array.from({ length: 100 }, (_, i) => {
                    if (i === 0 || i === 100) return null;
                    const pct = (i / 100) * 100;
                    const xpAt = (i / 100) * maxXp;
                    const reached = seasonXp >= xpAt;
                    return (
                      <div key={`minor-${i}`} className="absolute -translate-x-1/2" style={{
                        left: `${pct}%`,
                        top: '20%',
                        bottom: '20%',
                        width: '1px',
                        background: reached ? `${GOLD} 0.25)` : `${GOLD} 0.06)`,
                      }} />
                    );
                  })}
                  {/* Major tier checkpoint marks — thicker, 80% height for depth */}
                  {season.tiers.map((tier, idx) => {
                    const pct = (idx / (season.tiers.length - 1)) * 100;
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
              </div>
            </div>

            </div>
            </div>

            {/* Quest Footer */}
            <div className="shrink-0 px-6 pb-5 pt-3" style={{ borderTop: `1px solid ${GOLD} 0.1)` }}>
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
      </div>
    );
  }
}
