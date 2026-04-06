import { Component } from 'preact';
import { cn } from '../lib/utils';
import { requestLoginCode, verifyLoginCode, setStoredToken } from '../utils/authApi';

export default class LoginScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      step: 'email',
      email: '',
      code: '',
      error: null,
      loading: false,
    };
  }

  handleEmailSubmit = async (e) => {
    e.preventDefault();
    const { email } = this.state;
    if (!email.trim()) return;

    this.setState({ loading: true, error: null });
    try {
      await requestLoginCode(email.trim());
      this.setState({ step: 'code', loading: false });
    } catch (err) {
      this.setState({ error: err.message, loading: false });
    }
  };

  handleCodeSubmit = async (e) => {
    e.preventDefault();
    const { email, code } = this.state;
    if (!code.trim()) return;

    this.setState({ loading: true, error: null });
    try {
      const result = await verifyLoginCode(email.trim(), code.trim());
      await setStoredToken(result.token);
      this.props.onLogin(result);
    } catch (err) {
      this.setState({ error: err.message, loading: false });
    }
  };

  handleCodeInput = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    this.setState({ code: value });
  };

  render() {
    const { step, email, code, error, loading } = this.state;

    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
        <img src="/valkenhall-logo.png" alt="Valkenhall" className="w-[48rem] max-w-[90vw] mb-10" draggable={false} />
        <div className="w-full max-w-sm">

          {step === 'email' ? (
            <form onSubmit={this.handleEmailSubmit}>
              <label className="block text-sm text-white/70 mb-2">Email address</label>
              <input
                type="email"
                value={email}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white placeholder-white/30 outline-none focus:border-white/40 mb-4"
                onInput={(e) => this.setState({ email: e.target.value, error: null })}
                autoFocus
                disabled={loading}
              />
              {error ? <p className="text-red-400 text-sm mb-3">{error}</p> : null}
              <button
                type="submit"
                disabled={loading || !email.trim()}
                className={cn(
                  'w-full rounded-xl py-3 text-sm font-semibold transition-all',
                  loading || !email.trim()
                    ? 'bg-white/5 text-white/20 cursor-not-allowed'
                    : 'bg-amber-500 text-black hover:bg-amber-400'
                )}
              >
                {loading ? 'Sending...' : 'Send Login Code'}
              </button>
            </form>
          ) : (
            <form onSubmit={this.handleCodeSubmit}>
              <p className="text-sm text-white/70 mb-1">We sent a 6-digit code to</p>
              <p className="text-sm text-white font-medium mb-4">{email}</p>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                placeholder="000000"
                className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white text-center text-2xl tracking-[0.5em] font-mono placeholder-white/20 outline-none focus:border-white/40 mb-4"
                onInput={this.handleCodeInput}
                autoFocus
                disabled={loading}
                maxLength={6}
              />
              {error ? <p className="text-red-400 text-sm mb-3">{error}</p> : null}
              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className={cn(
                  'w-full rounded-xl py-3 text-sm font-semibold transition-all mb-3',
                  loading || code.length !== 6
                    ? 'bg-white/5 text-white/20 cursor-not-allowed'
                    : 'bg-amber-500 text-black hover:bg-amber-400'
                )}
              >
                {loading ? 'Verifying...' : 'Verify'}
              </button>
              <button
                type="button"
                className="w-full text-xs text-white/40 hover:text-white/60"
                onClick={() => this.setState({ step: 'email', code: '', error: null })}
              >
                Use a different email
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }
}
