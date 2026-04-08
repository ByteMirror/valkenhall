import { Component } from 'preact';
import { claimMatchReward } from '../utils/arena/matchmakingApi';
import { cn } from '../lib/utils';
import { getViewportScale, onViewportScaleChange,
  GOLD, GOLD_TEXT, COIN_COLOR, ACCENT_GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED,
  PANEL_BG, FourCorners,
} from '../lib/medievalTheme';
import { getLocalApiOrigin } from '../utils/localApi';
import { getEffectiveSfxVolume } from '../utils/arena/soundSettings';
import { formatRank } from '../utils/arena/rankUtils';
import { CoinIcon, ShardIcon } from './ui/icons';

// ── CountUp ────────────────────────────────────────────────────
//
// Class component that animates a number from 0 → target over a
// duration, with ease-out cubic. The pop callback fires once when the
// final value is reached so the parent can flash the row.

class CountUp extends Component {
  constructor(props) {
    super(props);
    this.state = { value: 0 };
    this.startTime = 0;
    this.rafId = null;
  }

  componentDidMount() {
    if (this.props.delay > 0) {
      this.delayTimer = setTimeout(() => this.tick(), this.props.delay);
    } else {
      this.tick();
    }
  }

  componentWillUnmount() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this.delayTimer) clearTimeout(this.delayTimer);
  }

  tick = () => {
    if (!this.startTime) this.startTime = performance.now();
    const elapsed = performance.now() - this.startTime;
    const duration = this.props.duration || 900;
    const t = Math.min(1, elapsed / duration);
    // Ease-out cubic — fast at first, settles into the final value.
    const eased = 1 - Math.pow(1 - t, 3);
    const next = Math.round((this.props.target || 0) * eased);

    this.setState({ value: next });

    if (t < 1) {
      this.rafId = requestAnimationFrame(this.tick);
    } else if (this.props.onComplete) {
      this.props.onComplete();
    }
  };

  render() {
    return <span>{this.state.value}</span>;
  }
}

// ── Reward row ─────────────────────────────────────────────────

const REWARD_DEFS = [
  { key: 'coins',        label: 'Coins',          icon: <CoinIcon size={22} />,  color: COIN_COLOR },
  { key: 'arcanaShards', label: 'Arcana',         icon: <ShardIcon size={20} />, color: '#8ee7ff' },
  { key: 'xp',           label: 'Experience',     icon: '★',                     color: ACCENT_GOLD },
  { key: 'seasonXp',     label: 'Season Pass XP', icon: '◈',                     color: '#c39df0' },
];

class RewardRow extends Component {
  constructor(props) {
    super(props);
    this.state = { popping: false };
  }

  handleComplete = () => {
    this.setState({ popping: true });
    setTimeout(() => this.setState({ popping: false }), 520);
  };

  render() {
    const { icon, label, color, value, delay } = this.props;
    return (
      <div
        className="match-result-row flex items-center justify-between px-4 py-2.5 rounded-lg"
        style={{
          background: 'rgba(0,0,0,0.35)',
          border: `1px solid ${GOLD} 0.18)`,
          animationDelay: `${delay}ms`,
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn('text-2xl', this.state.popping && 'match-result-row-pop')}
            style={{
              color,
              textShadow: `0 0 12px ${color}88, 0 0 4px ${color}`,
              display: 'inline-block',
            }}
          >
            {icon}
          </span>
          <span className="text-sm font-medium" style={{ color: TEXT_BODY }}>
            {label}
          </span>
        </div>
        <span
          className="text-xl font-bold tabular-nums"
          style={{
            color,
            textShadow: `0 0 10px ${color}66`,
          }}
        >
          +<CountUp target={value} duration={950} delay={delay + 80} onComplete={this.handleComplete} />
        </span>
      </div>
    );
  }
}

// ── Victory particles ──────────────────────────────────────────
//
// Sixteen gold flecks rising from the bottom of the panel for the
// victory case. Pure CSS animation, no JS per frame.

function VictoryParticles() {
  const particles = [];
  for (let i = 0; i < 16; i++) {
    const left = 5 + Math.random() * 90;
    const drift = (Math.random() - 0.5) * 40;
    const delay = Math.random() * 2.5;
    const duration = 2.6 + Math.random() * 1.4;
    particles.push(
      <div
        key={i}
        className="match-result-particle"
        style={{
          left: `${left}%`,
          bottom: '0px',
          '--match-particle-drift': `${drift}px`,
          '--match-particle-delay': `${delay}s`,
          '--match-particle-duration': `${duration}s`,
        }}
      />
    );
  }
  return <div className="absolute inset-0 overflow-hidden pointer-events-none">{particles}</div>;
}

// ── ArenaMatchResult ───────────────────────────────────────────

const RESULT_SOUND = 'snd-match-result.mp3';

export default class ArenaMatchResult extends Component {
  constructor(props) {
    super(props);
    this.state = {
      phase: 'propose',
      proposedWinner: null,
      remoteProposal: null,
      myReward: null,
      claimError: null,
      viewScale: getViewportScale(),
    };
  }

  componentDidMount() {
    const { onListenForProposal } = this.props;
    if (onListenForProposal) {
      onListenForProposal((data) => {
        this.setState({
          remoteProposal: data.winner,
          phase: 'confirm',
        });
      });
    }
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
  }

  componentWillUnmount() {
    if (this.unsubScale) this.unsubScale();
  }

  proposeWinner = (winner) => {
    const { onProposeWinner } = this.props;
    this.setState({ proposedWinner: winner, phase: 'waiting' });
    if (onProposeWinner) onProposeWinner(winner);
  };

  confirmResult = () => {
    const { remoteProposal } = this.state;
    const iWon = remoteProposal === 'opponent';
    // Local confirmation — broadcast match:confirmed so the opponent
    // knows to apply their rewards too.
    this.applyRewards(iWon, { silent: false });
  };

  rejectResult = () => {
    const { onRejectProposal } = this.props;
    this.setState({ phase: 'propose', remoteProposal: null });
    if (onRejectProposal) onRejectProposal();
  };

  // Plays the dedicated match-result fanfare. Uses the same volume
  // pipeline as every other game sound so the SFX slider applies.
  // Wrapped in HEAD-check so a missing file doesn't spam 404s in console.
  playResultSound = () => {
    try {
      const sfxVol = getEffectiveSfxVolume();
      if (sfxVol <= 0) return;
      const url = `${getLocalApiOrigin()}/game-assets/${RESULT_SOUND}`;
      const audio = new Audio(url);
      audio.volume = Math.min(1, sfxVol);
      // Suppress the 404 error event so it doesn't surface to the user.
      audio.addEventListener('error', () => {}, { once: true });
      audio.play().catch(() => {});
    } catch {}
  };

  /**
   * Claim and display rewards for the local player.
   *
   * @param {boolean} iWon  whether the local player won the match
   * @param {object}  opts  { silent } — when silent, do NOT broadcast
   *   match:confirmed back to the opponent. Used when applyRewards is
   *   triggered by an incoming match:confirmed (otherwise both clients
   *   would echo each other forever).
   *
   * Re-entry is guarded by the current phase: if we're already in
   * 'claiming' or 'rewards', the call is a no-op. This stops the
   * infinite-loop bug where stray match:confirmed messages would keep
   * retriggering the claim.
   */
  applyRewards = async (iWon, { silent = false } = {}) => {
    const { phase } = this.state;
    if (phase === 'claiming' || phase === 'rewards') return;

    const { onRewardsApplied } = this.props;
    this.setState({ phase: 'claiming', claimError: null });

    try {
      const result = await claimMatchReward(iWon);
      const reward = {
        coins: result.coinsEarned,
        xp: result.xpEarned,
        seasonXp: result.seasonXpEarned,
        arcanaShards: result.arcanaShardsEarned,
        durationMinutes: result.durationMinutes,
        won: result.won,
        newTotals: result.newTotals,
        // Ladder metadata — drives the promotion/demotion/shield
        // messaging at the bottom of the rewards panel.
        lpDelta: result.lpDelta || 0,
        promoted: !!result.promoted,
        tierPromoted: !!result.tierPromoted,
        demoted: !!result.demoted,
        tierDemoted: !!result.tierDemoted,
        shielded: !!result.shielded,
      };
      this.setState({ phase: 'rewards', myReward: reward }, this.playResultSound);
      if (!silent && onRewardsApplied) onRewardsApplied(reward);
    } catch (err) {
      console.error('[ArenaMatchResult] claimMatchReward failed:', err);
      // Surface a zero-reward result so the modal still closes cleanly;
      // the server rejects duplicate claims and stale rooms, and we'd
      // rather show "no reward" than trap the player in a broken state.
      const reward = {
        coins: 0,
        xp: 0,
        seasonXp: 0,
        arcanaShards: 0,
        durationMinutes: 0,
        won: iWon,
        newTotals: null,
      };
      this.setState({
        phase: 'rewards',
        myReward: reward,
        claimError: err?.message || 'Could not claim match reward.',
      }, this.playResultSound);
      // Deliberately do NOT call onRewardsApplied on the error path —
      // re-broadcasting match:confirmed after a 409 was the second
      // half of the infinite-loop bug.
    }
  };

  // ── Phase renderers ────────────────────────────────────────

  renderPropose() {
    return (
      <>
        <h2 className="text-xl font-bold text-center mb-2 arena-heading" style={{ color: TEXT_PRIMARY }}>
          Match Complete
        </h2>
        <p className="text-sm text-center mb-6" style={{ color: TEXT_MUTED }}>
          Who won this match?
        </p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            className="rounded-xl border px-4 py-3 text-sm font-semibold transition-all"
            style={{
              borderColor: 'rgba(140, 200, 120, 0.5)',
              background: 'rgba(80, 150, 80, 0.12)',
              color: '#a0e8a0',
            }}
            onClick={() => this.proposeWinner('me')}
          >
            I won
          </button>
          <button
            type="button"
            className="rounded-xl border px-4 py-3 text-sm font-semibold transition-all"
            style={{
              borderColor: 'rgba(200, 100, 100, 0.5)',
              background: 'rgba(150, 60, 60, 0.12)',
              color: '#e8a0a0',
            }}
            onClick={() => this.proposeWinner('opponent')}
          >
            My opponent won
          </button>
          <button
            type="button"
            className="rounded-xl px-4 py-2 text-xs hover:bg-white/5 transition-all"
            style={{ color: TEXT_MUTED }}
            onClick={this.props.onClose}
          >
            Cancel
          </button>
        </div>
      </>
    );
  }

  renderWaiting() {
    return (
      <>
        <h2 className="text-xl font-bold text-center mb-2 arena-heading" style={{ color: TEXT_PRIMARY }}>
          Waiting for opponent
        </h2>
        <p className="text-sm text-center mb-4" style={{ color: TEXT_BODY }}>
          You proposed:{' '}
          <span className="font-semibold" style={{ color: TEXT_PRIMARY }}>
            {this.state.proposedWinner === 'me' ? 'You won' : 'Opponent won'}
          </span>
        </p>
        <p className="text-xs text-center" style={{ color: TEXT_MUTED }}>
          Waiting for them to confirm...
        </p>
      </>
    );
  }

  renderConfirm() {
    return (
      <>
        <h2 className="text-xl font-bold text-center mb-2 arena-heading" style={{ color: TEXT_PRIMARY }}>
          Confirm Result
        </h2>
        <p className="text-sm text-center mb-6" style={{ color: TEXT_BODY }}>
          Your opponent says:{' '}
          <span className="font-semibold" style={{ color: TEXT_PRIMARY }}>
            {this.state.remoteProposal === 'me' ? 'They won' : 'You won'}
          </span>
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all"
            style={{
              borderColor: 'rgba(140, 200, 120, 0.5)',
              background: 'rgba(80, 150, 80, 0.12)',
              color: '#a0e8a0',
            }}
            onClick={this.confirmResult}
          >
            Confirm
          </button>
          <button
            type="button"
            className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all"
            style={{
              borderColor: 'rgba(200, 100, 100, 0.5)',
              background: 'rgba(150, 60, 60, 0.12)',
              color: '#e8a0a0',
            }}
            onClick={this.rejectResult}
          >
            Reject
          </button>
        </div>
      </>
    );
  }

  renderClaiming() {
    return (
      <>
        <h2 className="text-xl font-bold text-center mb-2 arena-heading" style={{ color: TEXT_PRIMARY }}>
          Tallying Rewards
        </h2>
        <p className="text-sm text-center" style={{ color: TEXT_MUTED }}>
          Claiming your match reward from the server...
        </p>
      </>
    );
  }

  renderRewards() {
    const { myReward, claimError } = this.state;
    const { roundsPlayed } = this.props;
    const won = myReward.won;
    const titleColor = won ? '#f5d782' : '#e89090';
    const subtitleColor = won ? GOLD_TEXT + ' 0.85)' : 'rgba(232, 144, 144, 0.85)';

    // Stagger the rows so each one slides in after the previous.
    // First row reveals at 600ms (after the banner has settled).
    const ROW_BASE_DELAY = 600;
    const ROW_STAGGER = 180;

    return (
      <div className="relative">
        {/* Atmospheric backdrop tint */}
        <div
          className={cn(
            'absolute inset-0 pointer-events-none rounded-xl',
            won ? 'match-result-radial-victory' : 'match-result-radial-defeat',
          )}
        />

        {won ? <VictoryParticles /> : null}

        <div className="relative">
          {/* Big banner */}
          <h2
            className={cn(
              'text-center font-bold tracking-wider arena-heading',
              won ? 'match-result-banner-victory' : 'match-result-banner-defeat',
            )}
            style={{
              fontSize: '46px',
              lineHeight: 1.05,
              color: titleColor,
              marginTop: '4px',
              marginBottom: '6px',
            }}
          >
            {won ? 'VICTORY' : 'DEFEAT'}
          </h2>

          {/* Stats row */}
          <div className="flex items-center justify-center gap-3 mb-4" style={{ color: subtitleColor }}>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-widest opacity-70">Duration</span>
              <span className="text-sm font-semibold tabular-nums">
                {myReward.durationMinutes ?? 0}m
              </span>
            </div>
            <span className="opacity-30">·</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-widest opacity-70">Rounds</span>
              <span className="text-sm font-semibold tabular-nums">
                {roundsPlayed ?? '—'}
              </span>
            </div>
          </div>

          {/* Animated divider */}
          <div className="match-result-divider mb-4 mx-auto" style={{
            height: 1,
            width: '70%',
            background: `linear-gradient(90deg, transparent, ${GOLD} 0.5), transparent)`,
          }} />

          {/* Reward rows */}
          <div className="flex flex-col gap-2 mb-5">
            {REWARD_DEFS.map((def, i) => (
              <RewardRow
                key={def.key}
                icon={def.icon}
                label={def.label}
                color={def.color}
                value={myReward[def.key] || 0}
                delay={ROW_BASE_DELAY + i * ROW_STAGGER}
              />
            ))}
          </div>

          {/* Ranked ladder update — appears under the reward rows so the
              promotion fanfare lands after the count-up animations. */}
          {myReward.newTotals?.rank ? (() => {
            const rank = myReward.newTotals.rank;
            const lpDelta = myReward.lpDelta || 0;
            const isPositive = lpDelta > 0;
            const isNegative = lpDelta < 0;
            const lpColor = isPositive ? '#7dd3fc' : isNegative ? '#e89090' : TEXT_MUTED;

            // Headline message describing what happened to the rank.
            let headline = null;
            let headlineColor = TEXT_BODY;
            if (myReward.tierPromoted) {
              headline = `Promoted to ${formatRank(rank.tier, rank.division)}!`;
              headlineColor = ACCENT_GOLD;
            } else if (myReward.promoted) {
              headline = `Promoted to ${formatRank(rank.tier, rank.division)}`;
              headlineColor = ACCENT_GOLD;
            } else if (myReward.tierDemoted) {
              headline = `Demoted to ${formatRank(rank.tier, rank.division)}`;
              headlineColor = '#e89090';
            } else if (myReward.demoted) {
              headline = `Demoted to ${formatRank(rank.tier, rank.division)}`;
              headlineColor = '#e89090';
            } else if (myReward.shielded) {
              const left = myReward.newTotals.shieldGamesLeft ?? 0;
              headline = `Promotion shield held — ${left} ${left === 1 ? 'game' : 'games'} left`;
              headlineColor = '#7dd3fc';
            }

            return (
              <div
                className="match-result-row flex flex-col items-center justify-center px-4 py-3 rounded-lg mb-5"
                style={{
                  background: 'rgba(0,0,0,0.4)',
                  border: `1px solid ${myReward.tierPromoted ? ACCENT_GOLD : `${GOLD} 0.18)`}`,
                  animationDelay: `${ROW_BASE_DELAY + REWARD_DEFS.length * ROW_STAGGER}ms`,
                  boxShadow: myReward.tierPromoted
                    ? `0 0 24px ${ACCENT_GOLD}55, inset 0 0 16px ${ACCENT_GOLD}22`
                    : 'none',
                }}
              >
                {headline ? (
                  <div className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: headlineColor }}>
                    {headline}
                  </div>
                ) : null}
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>
                    {formatRank(rank.tier, rank.division)}
                  </span>
                  <span className="text-xs tabular-nums" style={{ color: TEXT_MUTED }}>
                    {rank.lp} LP
                  </span>
                  {lpDelta !== 0 ? (
                    <span className="text-xs font-bold tabular-nums" style={{ color: lpColor }}>
                      {isPositive ? '+' : ''}{lpDelta}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })() : null}

          {claimError ? (
            <p className="text-xs text-center mb-3" style={{ color: '#e89090' }}>
              {claimError}
            </p>
          ) : null}

          <button
            type="button"
            className="w-full rounded-xl px-4 py-3 text-sm font-bold tracking-wider uppercase transition-all"
            style={{
              background: `linear-gradient(180deg, ${GOLD} 0.18), ${GOLD} 0.08))`,
              border: `1px solid ${GOLD} 0.5)`,
              color: TEXT_PRIMARY,
              boxShadow: `0 0 24px ${GOLD} 0.15), inset 0 1px 0 ${GOLD} 0.25)`,
            }}
            onClick={this.props.onClose}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  render() {
    const { phase } = this.state;
    const isRewards = phase === 'rewards';

    return (
      <div className="fixed inset-0 z-[1200] flex items-center justify-center" style={{
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(6px)',
      }}>
        <div
          className="match-result-card relative w-[420px] rounded-2xl p-7 overflow-hidden"
          style={{
            background: PANEL_BG,
            border: `1px solid ${GOLD} 0.35)`,
            boxShadow: `0 0 80px rgba(0,0,0,0.6), 0 0 40px ${GOLD} 0.08), inset 0 1px 0 ${GOLD} 0.18)`,
            zoom: this.state.viewScale,
            isolation: 'isolate',
          }}
        >
          <FourCorners radius={16} knots />

          {phase === 'propose'  ? this.renderPropose()  : null}
          {phase === 'waiting'  ? this.renderWaiting()  : null}
          {phase === 'confirm'  ? this.renderConfirm()  : null}
          {phase === 'claiming' ? this.renderClaiming() : null}
          {isRewards            ? this.renderRewards()  : null}
        </div>
      </div>
    );
  }
}
