import { Component } from 'preact';
import { listGameSessions, deleteGameSession } from '../utils/game/sessionStorage';
import { cn } from '../lib/utils';

export default class SessionLobby extends Component {
  constructor(props) {
    super(props);
    this.state = {
      sessions: [],
      loading: true,
      joinCode: '',
      joinError: '',
      tab: 'new',
    };
  }

  componentDidMount() {
    this.loadSessions();
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
    const { sessions, loading, joinCode, joinError, tab } = this.state;

    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="w-[520px] max-h-[80vh] flex flex-col rounded-2xl border border-white/10 bg-card/95 shadow-2xl backdrop-blur-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <h1 className="text-xl font-bold arena-heading">Sorcery — Game Session</h1>
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
              onClick={onExit}
            >
              Back
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/10">
            {[
              { id: 'new', label: 'New Session' },
              ...(!this.props.isArenaMatch ? [{ id: 'load', label: 'Load Session' }] : []),
              { id: 'join', label: 'Join Session' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                className={cn(
                  'flex-1 py-3 text-sm font-medium transition-colors',
                  tab === t.id
                    ? 'text-white border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-white'
                )}
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
                <p className="text-sm text-muted-foreground text-center max-w-sm">
                  Start a fresh game table. A room code will be generated so a friend can join anytime.
                </p>
                <button
                  type="button"
                  className="rounded-xl bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90"
                  onClick={this.handleNewSession}
                >
                  Create New Session
                </button>
              </div>
            ) : null}

            {tab === 'load' ? (
              <div className="flex flex-col gap-2">
                {loading ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
                ) : sessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No saved sessions yet.</p>
                ) : (
                  sessions.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      className="flex items-center justify-between rounded-xl border border-white/10 p-4 text-left hover:bg-muted/50 transition-colors"
                      onClick={() => this.handleLoadSession(session.id)}
                    >
                      <div>
                        <div className="font-medium text-sm">{session.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {session.cardCount || 0} cards · {new Date(session.savedAt).toLocaleString()}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-lg px-2 py-1 text-xs text-red-400 hover:bg-red-500/20"
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
                <p className="text-sm text-muted-foreground text-center max-w-sm">
                  Enter the room code shared by your friend to join their game.
                </p>
                <input
                  type="text"
                  maxLength={12}
                  placeholder="SCR-XXXX"
                  value={joinCode}
                  onInput={(e) => this.setState({ joinCode: e.target.value.toUpperCase(), joinError: '' })}
                  className="w-52 rounded-xl border border-white/20 bg-background px-4 py-3 text-center text-xl font-bold tracking-[0.15em] uppercase outline-none focus:border-primary"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') this.handleJoinSession(); }}
                />
                {joinError ? <p className="text-xs text-red-400">{joinError}</p> : null}
                <button
                  type="button"
                  className="rounded-xl bg-primary px-8 py-3 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90"
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
