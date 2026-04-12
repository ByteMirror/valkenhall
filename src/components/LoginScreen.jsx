import { Component } from 'preact';
import { cn } from '../lib/utils';
import { requestLoginCode, verifyLoginCode, setStoredToken, validateInviteCode } from '../utils/authApi';

export default class LoginScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      step: 'email', // 'email' | 'invite' | 'code'
      email: '',
      code: '',
      inviteCode: '',
      inviterName: null,
      isExistingUser: false,
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
      // Check if this email is already registered WITHOUT sending a
      // login code. New users need to enter an invite code first —
      // the email is only sent after the invite is validated so the
      // user doesn't get a 6-digit code while staring at an 8-char
      // invite field.
      const result = await requestLoginCode(email.trim(), { checkOnly: true });
      if (result.isExistingUser) {
        // Existing user — send the code now and go straight to verification
        await requestLoginCode(email.trim());
        this.setState({ step: 'code', isExistingUser: true, loading: false });
      } else {
        this.setState({ step: 'invite', isExistingUser: false, loading: false });
      }
    } catch (err) {
      this.setState({ error: err.message, loading: false });
    }
  };

  handleInviteSubmit = async (e) => {
    e.preventDefault();
    const { email, inviteCode } = this.state;
    if (!inviteCode.trim()) return;

    this.setState({ loading: true, error: null });
    try {
      const result = await validateInviteCode(inviteCode.trim());
      if (!result.valid) {
        this.setState({ error: 'Invalid or already used invite code', loading: false });
        return;
      }
      // Invite is valid — NOW send the login code email
      await requestLoginCode(email.trim());
      this.setState({
        step: 'code',
        inviterName: result.inviterName,
        loading: false,
      });
    } catch (err) {
      this.setState({ error: err.message, loading: false });
    }
  };

  handleCodeSubmit = async (e) => {
    e.preventDefault();
    const { email, code, inviteCode, isExistingUser } = this.state;
    if (!code.trim()) return;

    this.setState({ loading: true, error: null });
    try {
      const result = await verifyLoginCode(
        email.trim(),
        code.trim(),
        isExistingUser ? null : inviteCode.trim(),
      );
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
    const { step, email, code, inviteCode, inviterName, error, loading } = this.state;

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
          ) : step === 'invite' ? (
            <form onSubmit={this.handleInviteSubmit}>
              <p className="text-sm text-white/70 mb-1">New account for</p>
              <p className="text-sm text-white font-medium mb-4">{email}</p>
              <p className="text-xs text-white/50 mb-3">
                Valkenhall is in closed beta. Enter an invite code from an existing player to continue.
              </p>
              <label className="block text-sm text-white/70 mb-2">Invite Code</label>
              <input
                type="text"
                value={inviteCode}
                placeholder="ABCD1234"
                className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white text-center text-lg tracking-[0.3em] font-mono uppercase placeholder-white/20 outline-none focus:border-white/40 mb-4"
                onInput={(e) => this.setState({ inviteCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8), error: null })}
                autoFocus
                disabled={loading}
                maxLength={8}
              />
              {error ? <p className="text-red-400 text-sm mb-3">{error}</p> : null}
              <button
                type="submit"
                disabled={loading || inviteCode.length < 8}
                className={cn(
                  'w-full rounded-xl py-3 text-sm font-semibold transition-all mb-3',
                  loading || inviteCode.length < 8
                    ? 'bg-white/5 text-white/20 cursor-not-allowed'
                    : 'bg-amber-500 text-black hover:bg-amber-400'
                )}
              >
                {loading ? 'Checking...' : 'Validate Invite'}
              </button>
              <button
                type="button"
                className="w-full text-xs text-white/40 hover:text-white/60"
                onClick={() => this.setState({ step: 'email', inviteCode: '', error: null, loading: false })}
              >
                Use a different email
              </button>
            </form>
          ) : (
            <form onSubmit={this.handleCodeSubmit}>
              <p className="text-sm text-white/70 mb-1">We sent a 6-digit code to</p>
              <p className="text-sm text-white font-medium mb-2">{email}</p>
              {inviterName ? (
                <p className="text-xs text-amber-400/70 mb-4">Invited by {inviterName}</p>
              ) : null}
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
                onClick={() => this.setState({ step: 'email', code: '', error: null, loading: false })}
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
