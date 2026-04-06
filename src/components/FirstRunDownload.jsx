import { Component } from 'preact';
import RuneSpinner from './RuneSpinner';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD,
  BG_ATMOSPHERE, VIGNETTE, DIALOG_STYLE, PANEL_BG,
  FourCorners, OrnamentalDivider, getViewportScale,
} from '../lib/medievalTheme';
import { getLocalApiOrigin } from '../utils/localApi';

/**
 * First-run asset download screen.
 * Pre-downloads all card images from CDN on first launch.
 * Shows a medieval-themed progress screen.
 */
export default class FirstRunDownload extends Component {
  constructor(props) {
    super(props);
    this.state = {
      phase: 'checking', // checking | downloading | complete | error
      totalSlugs: 0, // total number of card images that should exist
      downloaded: 0,
      failed: 0,
      cached: 0, // how many are already on disk
      errorMessage: null,
    };
    this.pollTimer = null;
  }

  componentDidMount() {
    this.checkAndStart();
  }

  componentWillUnmount() {
    clearInterval(this.pollTimer);
  }

  async checkAndStart() {
    const api = getLocalApiOrigin();

    // Check current status
    try {
      const statusRes = await fetch(`${api}/api/assets/status`);
      const status = await statusRes.json();

      // Get all slugs from sorcery cards
      const cardsRes = await fetch(`${api}/api/sorcery/cards`);
      const cards = await cardsRes.json();

      const slugs = [];
      for (const card of cards) {
        for (const set of (card.sets || [])) {
          for (const variant of (set.variants || [])) {
            if (variant.slug) slugs.push(variant.slug);
          }
        }
      }

      if (status.cached >= slugs.length) {
        // All images already cached
        this.setState({ phase: 'complete', totalSlugs: slugs.length, cached: status.cached });
        setTimeout(() => this.props.onComplete(), 500);
        return;
      }

      // Start download
      this.setState({ phase: 'downloading', totalSlugs: slugs.length, cached: status.cached });

      const downloadRes = await fetch(`${api}/api/assets/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slugs }),
      });
      const downloadStatus = await downloadRes.json();

      if (downloadStatus.status === 'complete') {
        this.setState({ phase: 'complete', downloaded: downloadStatus.downloaded });
        setTimeout(() => this.props.onComplete(), 500);
        return;
      }

      // Poll for progress
      this.pollTimer = setInterval(() => this.pollProgress(), 500);
    } catch (err) {
      this.setState({ phase: 'error', errorMessage: err.message });
    }
  }

  async pollProgress() {
    try {
      const api = getLocalApiOrigin();
      const res = await fetch(`${api}/api/assets/status`);
      const status = await res.json();

      this.setState({
        cached: status.cached,
        downloaded: status.downloaded,
        failed: status.failed,
      });

      if (status.done) {
        clearInterval(this.pollTimer);
        this.setState({ phase: 'complete' });
        setTimeout(() => this.props.onComplete(), 1000);
      }
    } catch {}
  }

  render() {
    const { phase, totalSlugs, downloaded, cached, failed, errorMessage } = this.state;
    const viewScale = getViewportScale();
    const progress = totalSlugs > 0 ? Math.min(100, Math.round((cached / totalSlugs) * 100)) : 0;
    const remaining = Math.max(0, totalSlugs - cached);

    return (
      <div className="fixed inset-0 z-[95] grid place-items-center" style={{ background: BG_ATMOSPHERE }}>
        <div className="fixed inset-0 pointer-events-none" style={{ background: VIGNETTE }} />

        <div className="relative w-full max-w-lg p-8" style={{ ...DIALOG_STYLE, zoom: viewScale }}>
          <FourCorners radius={12} />

          <div className="text-center">
            <img src="/valkenhall-logo.png" alt="Valkenhall" className="h-16 mx-auto mb-6" draggable={false} />

            {phase === 'checking' && (
              <>
                <div className="flex justify-center mb-4">
                  <RuneSpinner size={56} />
                </div>
                <h2 className="text-xl font-bold arena-heading mb-2" style={{ color: TEXT_PRIMARY }}>Preparing the Arena</h2>
                <p className="text-sm" style={{ color: TEXT_MUTED }}>Checking game assets...</p>
              </>
            )}

            {phase === 'downloading' && (
              <>
                <h2 className="text-xl font-bold arena-heading mb-2" style={{ color: TEXT_PRIMARY }}>Downloading Card Art</h2>
                <p className="text-sm mb-4" style={{ color: TEXT_MUTED }}>
                  This only happens once. Your collection is being assembled.
                </p>

                {/* Progress bar */}
                <div
                  className="w-full h-3 rounded-full overflow-hidden mb-3"
                  style={{ background: `${GOLD} 0.08)`, border: `1px solid ${GOLD} 0.12)` }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${progress}%`,
                      background: 'linear-gradient(90deg, #8b6914, #d4a843, #c49a38)',
                      boxShadow: '0 0 8px rgba(212,168,67,0.3)',
                    }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs" style={{ color: TEXT_MUTED }}>
                  <span>{Math.min(cached, totalSlugs)} / {totalSlugs} images</span>
                  <span className="font-bold" style={{ color: ACCENT_GOLD }}>{progress}%</span>
                </div>

                {remaining > 0 && (
                  <p className="text-xs mt-3" style={{ color: TEXT_MUTED }}>
                    {remaining.toLocaleString()} remaining
                    {failed > 0 && <span style={{ color: '#c45050' }}> · {failed} failed</span>}
                  </p>
                )}
              </>
            )}

            {phase === 'complete' && (
              <>
                <div className="text-4xl mb-4">⚔️</div>
                <h2 className="text-xl font-bold arena-heading mb-2" style={{ color: TEXT_PRIMARY }}>Ready for Battle</h2>
                <p className="text-sm" style={{ color: TEXT_MUTED }}>All assets downloaded. Entering the arena...</p>
              </>
            )}

            {phase === 'error' && (
              <>
                <h2 className="text-xl font-bold arena-heading mb-2" style={{ color: '#c45050' }}>Download Failed</h2>
                <p className="text-sm mb-4" style={{ color: TEXT_MUTED }}>{errorMessage || 'Could not download game assets.'}</p>
                <div className="flex justify-center gap-3">
                  <button
                    type="button"
                    className="px-5 py-2 text-sm font-semibold arena-heading cursor-pointer transition-all"
                    style={{
                      background: 'linear-gradient(180deg, rgba(212,168,67,0.9) 0%, rgba(160,120,40,0.9) 100%)',
                      border: '1px solid rgba(228,200,100,0.6)',
                      borderRadius: '6px',
                      color: '#1a1408',
                    }}
                    onClick={() => {
                      this.setState({ phase: 'checking', errorMessage: null });
                      this.checkAndStart();
                    }}
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    className="px-5 py-2 text-sm cursor-pointer transition-all"
                    style={{
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(0,0,0,0.12) 100%)',
                      border: `1px solid ${GOLD} 0.3)`,
                      borderRadius: '6px',
                      color: TEXT_BODY,
                    }}
                    onClick={() => this.props.onComplete()}
                  >
                    Skip for Now
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
}
