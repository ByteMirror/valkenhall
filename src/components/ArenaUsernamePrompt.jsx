import { Component } from 'preact';
import RuneSpinner from './RuneSpinner';
import { cn } from '../lib/utils';
import {
  BG_ATMOSPHERE, VIGNETTE, GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED,
  DIALOG_STYLE, GOLD_BTN, BEVELED_BTN, INPUT_STYLE, ACCENT_GOLD,
  FourCorners, OrnamentalDivider, getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';

export default class ArenaUsernamePrompt extends Component {
  constructor(props) {
    super(props);
    this.state = {
      username: props.currentName || '',
      error: null,
      loading: false,
      viewScale: getViewportScale(),
    };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
  }

  componentWillUnmount() {
    this.unsubScale?.();
  }

  handleSubmit = async () => {
    const name = this.state.username.trim();
    if (name.length < 2 || name.length > 24) {
      this.setState({ error: 'Username must be 2-24 characters' });
      return;
    }
    this.setState({ loading: true, error: null });
    try {
      await this.props.onRegister(name);
    } catch (error) {
      this.setState({ loading: false, error: error.message });
    }
  };

  render() {
    const { username, error, loading, viewScale } = this.state;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: BG_ATMOSPHERE }}>
        <div className="fixed inset-0 pointer-events-none" style={{ background: VIGNETTE }} />

        <div className="relative w-full max-w-md px-6" style={{ zoom: viewScale }}>
          <div className="relative p-8" style={DIALOG_STYLE}>
            <FourCorners radius={12} />

            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold arena-heading mb-2" style={{ color: TEXT_PRIMARY, textShadow: '0 2px 4px rgba(0,0,0,0.5), 0 0 20px rgba(200,160,60,0.1)' }}>Choose Your Username</h1>
              <p className="text-sm" style={{ color: TEXT_MUTED }}>This will be visible to other players in matchmaking and on the leaderboard.</p>
            </div>

            <OrnamentalDivider className="mb-6" />

            <div className="flex flex-col gap-4">
              <input
                type="text"
                value={username}
                maxLength={24}
                placeholder="Enter a unique username..."
                className="w-full px-4 py-3 text-lg text-center outline-none"
                style={{
                  ...INPUT_STYLE,
                  borderRadius: '8px',
                  color: TEXT_PRIMARY,
                  fontSize: '18px',
                  letterSpacing: '0.02em',
                }}
                onInput={(e) => this.setState({ username: e.target.value, error: null })}
                onKeyDown={(e) => { if (e.key === 'Enter') this.handleSubmit(); }}
                autoFocus
              />

              {error ? (
                <div className="text-center text-sm" style={{ color: '#c45050' }}>{error}</div>
              ) : null}

              <button
                type="button"
                disabled={!username.trim() || loading}
                className="w-full py-3 text-sm font-semibold arena-heading cursor-pointer transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={username.trim() && !loading ? GOLD_BTN : { ...BEVELED_BTN, color: TEXT_MUTED, borderRadius: '6px' }}
                onMouseEnter={(e) => { if (username.trim() && !loading) { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 0 30px rgba(212,168,67,0.3), inset 0 1px 0 rgba(255,255,255,0.2)'; } }}
                onMouseLeave={(e) => { if (username.trim() && !loading) { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = GOLD_BTN.boxShadow; } }}
                onClick={this.handleSubmit}
              >
                {loading ? <RuneSpinner size={18} className="inline-block" /> : 'Confirm Username'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
