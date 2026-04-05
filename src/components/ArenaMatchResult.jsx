import { Component } from 'preact';
import { CURRENCY, XP } from '../utils/arena/profileDefaults';
import { cn } from '../lib/utils';

export default class ArenaMatchResult extends Component {
  constructor(props) {
    super(props);
    this.state = {
      phase: 'propose',
      proposedWinner: null,
      remoteProposal: null,
      myReward: null,
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
  }

  proposeWinner = (winner) => {
    const { onProposeWinner } = this.props;
    this.setState({ proposedWinner: winner, phase: 'waiting' });
    if (onProposeWinner) onProposeWinner(winner);
  };

  confirmResult = () => {
    const { remoteProposal } = this.state;
    const iWon = remoteProposal === 'opponent';
    this.applyRewards(iWon);
  };

  rejectResult = () => {
    const { onRejectProposal } = this.props;
    this.setState({ phase: 'propose', remoteProposal: null });
    if (onRejectProposal) onRejectProposal();
  };

  applyRewards = (iWon) => {
    const { matchDurationMinutes, onRewardsApplied } = this.props;
    const coins = iWon ? CURRENCY.WIN_REWARD : CURRENCY.LOSS_REWARD;
    const xp = Math.round((matchDurationMinutes || 0) * XP.PER_MINUTE);

    const reward = { coins, xp, won: iWon };
    this.setState({ phase: 'rewards', myReward: reward });

    if (onRewardsApplied) onRewardsApplied(reward);
  };

  render() {
    const { onClose } = this.props;
    const { phase, proposedWinner, remoteProposal, myReward } = this.state;

    return (
      <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="w-96 rounded-2xl border border-border/70 bg-card p-6 shadow-2xl">

          {phase === 'propose' ? (
            <>
              <h2 className="text-xl font-bold text-center mb-2 arena-heading">Match Complete</h2>
              <p className="text-sm text-muted-foreground text-center mb-6">Who won this match?</p>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  className="rounded-xl border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm font-semibold text-green-400 hover:bg-green-500/20 transition-all"
                  onClick={() => this.proposeWinner('me')}
                >
                  I won
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-400 hover:bg-red-500/20 transition-all"
                  onClick={() => this.proposeWinner('opponent')}
                >
                  My opponent won
                </button>
                <button
                  type="button"
                  className="rounded-xl px-4 py-2 text-xs text-muted-foreground hover:bg-muted transition-all"
                  onClick={onClose}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : null}

          {phase === 'waiting' ? (
            <>
              <h2 className="text-xl font-bold text-center mb-2 arena-heading">Waiting for opponent</h2>
              <p className="text-sm text-muted-foreground text-center mb-4">
                You proposed: <span className="font-semibold text-white">{proposedWinner === 'me' ? 'You won' : 'Opponent won'}</span>
              </p>
              <p className="text-xs text-muted-foreground/60 text-center">Waiting for them to confirm...</p>
            </>
          ) : null}

          {phase === 'confirm' ? (
            <>
              <h2 className="text-xl font-bold text-center mb-2 arena-heading">Confirm Result</h2>
              <p className="text-sm text-muted-foreground text-center mb-6">
                Your opponent says: <span className="font-semibold text-white">
                  {remoteProposal === 'me' ? 'They won' : 'You won'}
                </span>
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="flex-1 rounded-xl border border-green-500/50 bg-green-500/10 px-4 py-2.5 text-sm font-semibold text-green-400 hover:bg-green-500/20 transition-all"
                  onClick={this.confirmResult}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/20 transition-all"
                  onClick={this.rejectResult}
                >
                  Reject
                </button>
              </div>
            </>
          ) : null}

          {phase === 'rewards' && myReward ? (
            <>
              <h2 className={cn('text-2xl font-bold text-center mb-4', myReward.won ? 'text-green-400' : 'text-red-400')}>
                {myReward.won ? 'Victory!' : 'Defeat'}
              </h2>
              <div className="flex flex-col items-center gap-3 mb-6">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-yellow-300">+{myReward.coins}</span>
                  <span className="text-sm text-muted-foreground">coins</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-amber-400">+{myReward.xp}</span>
                  <span className="text-sm text-muted-foreground">XP</span>
                </div>
              </div>
              <button
                type="button"
                className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20 transition-all"
                onClick={onClose}
              >
                Continue
              </button>
            </>
          ) : null}

        </div>
      </div>
    );
  }
}
