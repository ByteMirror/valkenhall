import { Component } from 'preact';
import { formatRank, TIER_COLORS } from '../utils/arena/rankUtils';
import { cn } from '../lib/utils';

export default class ArenaMatchmaking extends Component {
  constructor(props) {
    super(props);
    this.state = { elapsed: 0 };
    this.timer = null;
  }

  componentDidMount() {
    this.timer = setInterval(() => {
      this.setState((s) => ({ elapsed: s.elapsed + 1 }));
    }, 1000);
  }

  componentWillUnmount() {
    clearInterval(this.timer);
  }

  render() {
    const { opponent, onCancel } = this.props;
    const { elapsed } = this.state;
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    if (opponent) {
      const rankColor = TIER_COLORS[opponent.tier] || 'text-white';
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-green-400 mb-4">Opponent Found!</h2>
            <div className="text-lg text-white font-semibold mb-1 arena-heading">{opponent.name}</div>
            <div className={cn('text-sm font-medium mb-6', rankColor)}>
              {formatRank(opponent.tier, opponent.division)}
            </div>
            <div className="text-sm text-muted-foreground animate-pulse">Connecting...</div>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="mb-6">
            <div className="size-12 border-2 border-white/20 border-t-amber-400 rounded-full animate-spin mx-auto" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Finding Opponent</h2>
          <div className="text-sm text-muted-foreground mb-1">
            {minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`}
          </div>
          <div className="text-xs text-muted-foreground/60 mb-8">
            {elapsed < 30 ? 'Matching within your tier...' : elapsed < 60 ? 'Expanding search range...' : 'Searching all ranks...'}
          </div>
          <button
            type="button"
            className="rounded-xl border border-white/30 px-6 py-2 text-sm text-white/70 hover:bg-white/10 transition-all"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }
}
