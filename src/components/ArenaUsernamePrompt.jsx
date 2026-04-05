import { Component } from 'preact';
import { cn } from '../lib/utils';

export default class ArenaUsernamePrompt extends Component {
  constructor(props) {
    super(props);
    this.state = {
      username: props.currentName || '',
      error: null,
      loading: false,
    };
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
    const { username, error, loading } = this.state;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <div className="w-full max-w-md px-6">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Choose Your Username</h1>
            <p className="text-muted-foreground">This will be visible to other players in matchmaking and on the leaderboard.</p>
          </div>

          <div className="flex flex-col gap-4">
            <input
              type="text"
              value={username}
              maxLength={24}
              placeholder="Enter a unique username..."
              className="w-full rounded-xl border border-white/30 bg-transparent px-4 py-3 text-lg text-white text-center outline-none focus:border-amber-500/50 placeholder-white/30"
              onInput={(e) => this.setState({ username: e.target.value, error: null })}
              onKeyDown={(e) => { if (e.key === 'Enter') this.handleSubmit(); }}
              autoFocus
            />

            {error ? (
              <div className="text-center text-red-400 text-sm">{error}</div>
            ) : null}

            <button
              type="button"
              disabled={!username.trim() || loading}
              className={cn(
                'rounded-xl px-8 py-3 text-sm font-semibold transition-all w-full',
                username.trim() && !loading
                  ? 'bg-amber-500 text-black hover:bg-amber-400 shadow-lg'
                  : 'bg-white/10 text-white/30 cursor-not-allowed'
              )}
              onClick={this.handleSubmit}
            >
              {loading ? 'Registering...' : 'Confirm Username'}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
