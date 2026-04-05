import { Component } from 'preact';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED,
  DIALOG_STYLE, PANEL_BG, GOLD_BTN, FourCorners,
} from '../lib/medievalTheme';

export default class UpdateModal extends Component {
  constructor(props) {
    super(props);
    this.state = { applying: false };
  }

  handleRestart = () => {
    this.setState({ applying: true });
    this.props.onApply();
  };

  render() {
    const { newVersion, releaseNotes } = this.props;
    const { applying } = this.state;

    return (
      <div
        className="fixed inset-0 z-[300] flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(6px)' }}
      >
        <div className="relative w-full max-w-lg p-8" style={DIALOG_STYLE}>
          <FourCorners />

          <div className="text-center mb-6">
            <div
              className="text-[10px] font-semibold uppercase tracking-widest mb-2"
              style={{ color: `${GOLD} 0.6)`, textShadow: `0 0 12px ${GOLD} 0.15)` }}
            >
              Update Required
            </div>
            <h2
              className="text-xl font-bold arena-heading"
              style={{ color: TEXT_PRIMARY, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
            >
              {newVersion ? `Version ${newVersion} is Ready` : 'A New Version is Ready'}
            </h2>
          </div>

          {releaseNotes ? (
            <div
              className="mb-6 max-h-64 overflow-y-auto px-4 py-3 text-sm leading-relaxed"
              style={{
                background: PANEL_BG,
                border: `1px solid ${GOLD} 0.12)`,
                borderRadius: '8px',
                color: TEXT_BODY,
              }}
            >
              <div
                className="text-[10px] font-semibold uppercase tracking-widest mb-3"
                style={{ color: `${GOLD} 0.4)` }}
              >
                What's New
              </div>
              <div style={{ color: TEXT_BODY, whiteSpace: 'pre-wrap' }}>
                {releaseNotes}
              </div>
            </div>
          ) : null}

          <div className="text-center">
            <button
              type="button"
              className="px-8 py-3 text-sm font-bold arena-heading cursor-pointer transition-all"
              style={{
                ...GOLD_BTN,
                borderRadius: '8px',
                opacity: applying ? 0.6 : 1,
              }}
              disabled={applying}
              onClick={this.handleRestart}
            >
              {applying ? 'Restarting...' : 'Restart Now'}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
