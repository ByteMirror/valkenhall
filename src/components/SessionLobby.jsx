import { Component } from 'preact';
import RuneSpinner from './RuneSpinner';
import { listGameSessions, deleteGameSession } from '../utils/game/sessionStorage';
import { cn } from '../lib/utils';
import { UI } from '../utils/arena/uiSounds';
import {
  BG_ATMOSPHERE, VIGNETTE, GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED,
  DIALOG_STYLE, PANEL_BG, PANEL_BORDER, BEVELED_BTN, GOLD_BTN, DANGER_BTN,
  INPUT_STYLE, TAB_ACTIVE, TAB_INACTIVE, FourCorners, OrnamentalDivider,
  getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';

export default class SessionLobby extends Component {
  constructor(props) {
    super(props);
    this.state = {
      sessions: [],
      loading: true,
      joinCode: '',
      joinError: '',
      tab: 'new',
      viewScale: getViewportScale(),
    };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
    this.loadSessions();
  }

  componentWillUnmount() {
    this.unsubScale?.();
  }

  loadSessions = async () => {
    try {
      const sessions = await listGameSessions();
      this.setState({ sessions, loading: false });
    } catch {
      this.setState({ sessions: [], loading: false });
    }
  };

  handleNewSession = () => {
    this.props.onNewSession();
  };

  handleLoadSession = (sessionId) => {
    this.props.onLoadSession(sessionId);
  };

  handleDeleteSession = async (sessionId, event) => {
    event.stopPropagation();
    try {
      await deleteGameSession(sessionId);
      this.setState((state) => ({
        sessions: state.sessions.filter((s) => s.id !== sessionId),
      }));
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

  handleJoinSession = () => {
    const code = this.state.joinCode.trim();
    if (code.length < 4) {
      this.setState({ joinError: 'Please enter the room code' });
      return;
    }
    this.setState({ joinError: '' });
    this.props.onJoinSession(code);
  };

  render() {
    const { onExit } = this.props;
    const { sessions, loading, joinCode, joinError, tab, viewScale } = this.state;

    const tabs = [
      { id: 'new', label: 'New Session' },
      ...(!this.props.isArenaMatch ? [{ id: 'load', label: 'Load Session' }] : []),
      { id: 'join', label: 'Join Session' },
    ];

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: BG_ATMOSPHERE, zoom: viewScale }}>
        <div className="fixed inset-0 pointer-events-none" style={{ background: VIGNETTE }} />
        <div className="relative w-[520px] max-h-[80vh] flex flex-col overflow-hidden" style={DIALOG_STYLE}>
          <FourCorners radius={12} />

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: `1px solid ${GOLD} 0.12)` }}>
            <h1 className="text-xl font-bold arena-heading" style={{ color: TEXT_PRIMARY, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>Sorcery — Game Session</h1>
            <button
              type="button"
              className="px-3 py-1.5 text-xs cursor-pointer transition-all"
              style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.5)`; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.3)`; }}
              data-sound={UI.CANCEL}
              onClick={onExit}
            >
              Back
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 px-6 py-3" style={{ borderBottom: `1px solid ${GOLD} 0.08)` }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className="flex-1 py-2 text-xs font-medium transition-colors cursor-pointer"
                style={tab === t.id ? TAB_ACTIVE : TAB_INACTIVE}
                onClick={() => this.setState({ tab: t.id })}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {tab === 'new' ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <p className="text-sm text-center max-w-sm" style={{ color: TEXT_MUTED }}>
                  Start a fresh game table. A room code will be generated so a friend can join anytime.
                </p>
                <button
                  type="button"
                  className="px-8 py-3 text-sm font-semibold arena-heading cursor-pointer transition-all"
                  style={GOLD_BTN}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 0 30px rgba(212,168,67,0.3), inset 0 1px 0 rgba(255,255,255,0.2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = GOLD_BTN.boxShadow; }}
                  data-sound={UI.MATCH_START}
                  onClick={this.handleNewSession}
                >
                  Create New Session
                </button>
              </div>
            ) : null}

            {tab === 'load' ? (
              <div className="flex flex-col gap-2">
                {loading ? (
                  <div className="flex justify-center py-8"><RuneSpinner size={48} /></div>
                ) : sessions.length === 0 ? (
                  <p className="text-sm text-center py-8" style={{ color: TEXT_MUTED }}>No saved sessions yet.</p>
                ) : (
                  sessions.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      className="relative flex items-center justify-between p-4 text-left cursor-pointer transition-all"
                      style={{ background: PANEL_BG, border: `1px solid ${GOLD} 0.15)`, borderRadius: '8px' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.35)`; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.15)`; }}
                      data-sound={UI.MATCH_START}
                      onClick={() => this.handleLoadSession(session.id)}
                    >
                      <FourCorners />
                      <div>
                        <div className="font-medium text-sm" style={{ color: TEXT_PRIMARY }}>{session.name}</div>
                        <div className="text-xs mt-0.5" style={{ color: TEXT_MUTED }}>
                          {session.cardCount || 0} cards &middot; {new Date(session.savedAt).toLocaleString()}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="px-2 py-1 text-xs cursor-pointer transition-all"
                        style={DANGER_BTN}
                        data-sound={UI.CANCEL}
                        onClick={(e) => this.handleDeleteSession(session.id, e)}
                      >
                        Delete
                      </button>
                    </button>
                  ))
                )}
              </div>
            ) : null}

            {tab === 'join' ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <p className="text-sm text-center max-w-sm" style={{ color: TEXT_MUTED }}>
                  Enter the room code shared by your friend to join their game.
                </p>
                <input
                  type="text"
                  maxLength={12}
                  placeholder="SCR-XXXX"
                  value={joinCode}
                  onInput={(e) => this.setState({ joinCode: e.target.value.toUpperCase(), joinError: '' })}
                  className="w-52 px-4 py-3 text-center text-xl font-bold tracking-[0.15em] uppercase outline-none"
                  style={{ ...INPUT_STYLE, borderRadius: '8px', color: TEXT_PRIMARY }}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') this.handleJoinSession(); }}
                />
                {joinError ? <p className="text-xs" style={{ color: '#c45050' }}>{joinError}</p> : null}
                <button
                  type="button"
                  className="px-8 py-3 text-sm font-semibold arena-heading cursor-pointer transition-all"
                  style={GOLD_BTN}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 0 30px rgba(212,168,67,0.3), inset 0 1px 0 rgba(255,255,255,0.2)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = GOLD_BTN.boxShadow; }}
                  data-sound={UI.MATCH_START}
                  onClick={this.handleJoinSession}
                >
                  Join Game
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
}
