import { Component } from 'preact';
import RuneSpinner from './RuneSpinner';
import { formatRank, TIER_COLORS } from '../utils/arena/rankUtils';
import { cn } from '../lib/utils';
import { UI } from '../utils/arena/uiSounds';
import {
  BG_ATMOSPHERE, VIGNETTE, GOLD, TEXT_PRIMARY, TEXT_BODY,
  BEVELED_BTN, GOLD_BTN, DIALOG_STYLE, FourCorners, OrnamentalDivider,
  getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';

export default class ArenaMatchmaking extends Component {
  constructor(props) {
    super(props);
    this.state = { elapsed: 0, viewScale: getViewportScale() };
    this.timer = null;
  }

  componentDidMount() {
    this.timer = setInterval(() => {
      this.setState((s) => ({ elapsed: s.elapsed + 1 }));
    }, 1000);
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
  }

  componentWillUnmount() {
    clearInterval(this.timer);
    this.unsubScale?.();
  }

  render() {
    const { opponent, onCancel } = this.props;
    const { elapsed, viewScale } = this.state;
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    if (opponent) {
      const tier = opponent.rank?.tier || opponent.tier;
      const division = opponent.rank?.division || opponent.division;
      const rankColor = TIER_COLORS[tier] || 'text-white';
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: BG_ATMOSPHERE }}>
          <div className="fixed inset-0 pointer-events-none" style={{ background: VIGNETTE }} />
          <div className="relative text-center p-10" style={{ ...DIALOG_STYLE, zoom: viewScale }}>
            <FourCorners radius={12} knots />
            <OrnamentalDivider className="mb-5" />
            <h2 className="text-2xl font-bold arena-heading mb-4" style={{ color: '#d4a843', textShadow: '0 2px 4px rgba(0,0,0,0.5), 0 0 20px rgba(200,160,60,0.15)' }}>Opponent Found!</h2>
            <div className="text-lg font-semibold mb-1 arena-heading" style={{ color: TEXT_PRIMARY, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{opponent.name}</div>
            <div className={cn('text-sm font-medium mb-6', rankColor)}>
              {formatRank(tier, division)}
            </div>
            <OrnamentalDivider className="mb-4" />
            <div className="text-sm animate-pulse" style={{ color: TEXT_BODY }}>Connecting...</div>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: BG_ATMOSPHERE }}>
        <div className="fixed inset-0 pointer-events-none" style={{ background: VIGNETTE }} />
        <div className="relative text-center p-10" style={{ ...DIALOG_STYLE, zoom: viewScale }}>
          <FourCorners radius={12} knots />
          <div className="mb-6 flex justify-center">
            <RuneSpinner size={64} />
          </div>
          <h2 className="text-xl font-bold arena-heading mb-2" style={{ color: TEXT_PRIMARY, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>Finding Opponent</h2>
          <div className="text-sm mb-1" style={{ color: TEXT_BODY }}>
            {minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`}
          </div>
          <div className="text-xs mb-8" style={{ color: 'rgba(166,160,155,0.4)' }}>
            {elapsed < 30 ? 'Matching within your tier...' : elapsed < 60 ? 'Expanding search range...' : 'Searching all ranks...'}
          </div>
          <OrnamentalDivider className="mb-5" />
          <button
            type="button"
            className="px-6 py-2 text-sm transition-all cursor-pointer"
            style={{ ...BEVELED_BTN, color: TEXT_BODY }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.borderColor = `${GOLD} 0.5)`; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = `${GOLD} 0.3)`; }}
            data-sound={UI.CANCEL}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }
}
