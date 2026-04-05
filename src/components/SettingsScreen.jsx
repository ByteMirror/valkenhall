import { Component } from 'preact';
import { getSoundSettings, saveSoundSettings } from '../utils/arena/soundSettings';
import { updateMusicVolume } from '../utils/arena/musicManager';
import {
  GOLD, GOLD_TEXT, BG_ATMOSPHERE, VIGNETTE,
  TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD,
  DIALOG_STYLE, PANEL_BG, PANEL_STYLE, BEVELED_BTN, GOLD_BTN,
  FourCorners, OrnamentalDivider,
} from '../lib/medievalTheme';

const SECTIONS = [
  { key: 'sound', label: 'Sound' },
  { key: 'updates', label: 'Updates' },
];

export default class SettingsScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      activeSection: 'sound',
      soundSettings: getSoundSettings(),
      checking: false,
      retrying: false,
    };
  }

  updateSound = (key, value) => {
    const next = { ...this.state.soundSettings, [key]: value };
    saveSoundSettings(next);
    this.setState({ soundSettings: next });
    updateMusicVolume();
  };

  handleCheck = async () => {
    this.setState({ checking: true });
    await this.props.updateManager?.check();
    this.setState({ checking: false });
  };

  handleRetry = async () => {
    this.setState({ retrying: true });
    await this.props.updateManager?.retry();
    this.setState({ retrying: false });
  };

  renderSoundSection() {
    const ss = this.state.soundSettings;

    return (
      <div>
        <div
          className="text-[10px] font-semibold uppercase tracking-widest mb-3"
          style={{ color: `${GOLD} 0.55)`, textShadow: `0 0 12px ${GOLD} 0.15)` }}
        >
          Sound
        </div>
        <div
          className="flex flex-col overflow-hidden"
          style={{ background: PANEL_BG, border: `1px solid ${GOLD} 0.12)`, borderRadius: '8px' }}
        >
          {/* Master Volume */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${GOLD} 0.06)` }}>
            <span className="text-sm" style={{ color: TEXT_PRIMARY }}>Master Volume</span>
            <div className="flex items-center gap-3">
              <input type="range" min="0" max="100" value={Math.round(ss.masterVolume * 100)} className="w-24 h-1 accent-amber-500 cursor-pointer" onInput={(e) => this.updateSound('masterVolume', parseInt(e.target.value, 10) / 100)} />
              <span className="text-xs w-8 text-right tabular-nums" style={{ color: TEXT_MUTED }}>{Math.round(ss.masterVolume * 100)}%</span>
            </div>
          </div>
          {/* Music */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${GOLD} 0.06)` }}>
            <span className="text-sm" style={{ color: TEXT_PRIMARY }}>Music</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-md px-2 py-0.5 text-[10px] font-medium cursor-pointer transition-colors"
                style={ss.musicEnabled
                  ? { border: `1px solid ${GOLD} 0.4)`, background: `${GOLD} 0.12)`, color: '#d4a843' }
                  : { border: `1px solid ${GOLD} 0.1)`, background: 'transparent', color: TEXT_MUTED }
                }
                onClick={() => this.updateSound('musicEnabled', !ss.musicEnabled)}
              >{ss.musicEnabled ? 'On' : 'Off'}</button>
              <input type="range" min="0" max="100" value={Math.round(ss.musicVolume * 100)} className="w-20 h-1 accent-amber-500 cursor-pointer" disabled={!ss.musicEnabled} onInput={(e) => this.updateSound('musicVolume', parseInt(e.target.value, 10) / 100)} />
              <span className="text-xs w-8 text-right tabular-nums" style={{ color: TEXT_MUTED }}>{Math.round(ss.musicVolume * 100)}%</span>
            </div>
          </div>
          {/* SFX */}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm" style={{ color: TEXT_PRIMARY }}>Sound Effects</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-md px-2 py-0.5 text-[10px] font-medium cursor-pointer transition-colors"
                style={ss.sfxEnabled
                  ? { border: `1px solid ${GOLD} 0.4)`, background: `${GOLD} 0.12)`, color: '#d4a843' }
                  : { border: `1px solid ${GOLD} 0.1)`, background: 'transparent', color: TEXT_MUTED }
                }
                onClick={() => this.updateSound('sfxEnabled', !ss.sfxEnabled)}
              >{ss.sfxEnabled ? 'On' : 'Off'}</button>
              <input type="range" min="0" max="100" value={Math.round(ss.sfxVolume * 100)} className="w-20 h-1 accent-amber-500 cursor-pointer" disabled={!ss.sfxEnabled} onInput={(e) => this.updateSound('sfxVolume', parseInt(e.target.value, 10) / 100)} />
              <span className="text-xs w-8 text-right tabular-nums" style={{ color: TEXT_MUTED }}>{Math.round(ss.sfxVolume * 100)}%</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  renderUpdatesSection() {
    const { updateStatus, onApply } = this.props;
    const { checking, retrying } = this.state;
    const status = updateStatus || {};

    const stateLabels = {
      UP_TO_DATE: 'Up to date',
      CHECKING: 'Checking for updates...',
      UPDATE_AVAILABLE: 'Update available',
      DOWNLOADING: status.downloadProgress != null ? `Downloading... ${status.downloadProgress}%` : 'Downloading update...',
      DOWNLOAD_FAILED: 'Download failed',
      READY_TO_INSTALL: 'Update ready!',
      APPLYING: 'Applying update...',
    };

    const stateColors = {
      UP_TO_DATE: TEXT_MUTED,
      CHECKING: ACCENT_GOLD,
      UPDATE_AVAILABLE: ACCENT_GOLD,
      DOWNLOADING: ACCENT_GOLD,
      DOWNLOAD_FAILED: '#b04040',
      READY_TO_INSTALL: '#70b060',
      APPLYING: ACCENT_GOLD,
    };

    return (
      <div>
        <div
          className="text-[10px] font-semibold uppercase tracking-widest mb-3"
          style={{ color: `${GOLD} 0.55)`, textShadow: `0 0 12px ${GOLD} 0.15)` }}
        >
          Updates
        </div>
        <div
          className="flex flex-col overflow-hidden"
          style={{ background: PANEL_BG, border: `1px solid ${GOLD} 0.12)`, borderRadius: '8px' }}
        >
          {/* Current version */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${GOLD} 0.06)` }}>
            <span className="text-sm" style={{ color: TEXT_PRIMARY }}>Current Version</span>
            <span className="text-sm tabular-nums" style={{ color: TEXT_BODY }}>{status.currentVersion || 'Unknown'}</span>
          </div>

          {/* Update status */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${GOLD} 0.06)` }}>
            <span className="text-sm" style={{ color: TEXT_PRIMARY }}>Status</span>
            <span className="text-sm font-medium" style={{ color: stateColors[status.state] || TEXT_MUTED }}>
              {stateLabels[status.state] || status.state || 'Unknown'}
            </span>
          </div>

          {/* Error message */}
          {status.state === 'DOWNLOAD_FAILED' && status.error ? (
            <div className="px-4 py-2 text-xs" style={{ color: '#b04040', borderBottom: `1px solid ${GOLD} 0.06)` }}>
              {status.error}
            </div>
          ) : null}

          {/* Download progress bar */}
          {status.state === 'DOWNLOADING' && status.downloadProgress != null ? (
            <div className="px-4 py-2" style={{ borderBottom: `1px solid ${GOLD} 0.06)` }}>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: `${GOLD} 0.1)` }}>
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${status.downloadProgress}%`, background: ACCENT_GOLD }}
                />
              </div>
            </div>
          ) : null}

          {/* Release notes */}
          {status.releaseNotes && (status.state === 'READY_TO_INSTALL' || status.state === 'DOWNLOADING' || status.state === 'UPDATE_AVAILABLE') ? (
            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${GOLD} 0.06)` }}>
              <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: `${GOLD} 0.4)` }}>
                What's New in {status.newVersion || 'this update'}
              </div>
              <div className="text-xs leading-relaxed max-h-32 overflow-y-auto" style={{ color: TEXT_BODY, whiteSpace: 'pre-wrap' }}>
                {status.releaseNotes}
              </div>
            </div>
          ) : null}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 px-4 py-3">
            {status.state === 'DOWNLOAD_FAILED' ? (
              <button
                type="button"
                className="px-4 py-1.5 text-xs font-medium cursor-pointer transition-all"
                style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px', opacity: retrying ? 0.6 : 1 }}
                disabled={retrying}
                onClick={this.handleRetry}
              >
                {retrying ? 'Retrying...' : 'Retry Download'}
              </button>
            ) : null}

            {status.state === 'UP_TO_DATE' || status.state === 'DOWNLOAD_FAILED' ? (
              <button
                type="button"
                className="px-4 py-1.5 text-xs font-medium cursor-pointer transition-all"
                style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px', opacity: checking ? 0.6 : 1 }}
                disabled={checking}
                onClick={this.handleCheck}
              >
                {checking ? 'Checking...' : 'Check for Updates'}
              </button>
            ) : null}

            {status.state === 'READY_TO_INSTALL' ? (
              <button
                type="button"
                className="px-4 py-1.5 text-xs font-bold arena-heading cursor-pointer transition-all"
                style={{ ...GOLD_BTN, borderRadius: '6px' }}
                onClick={onApply}
              >
                Restart to Update
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  render() {
    const { onBack } = this.props;
    const { activeSection } = this.state;

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: BG_ATMOSPHERE }}>
        <div className="fixed inset-0 pointer-events-none" style={{ background: VIGNETTE }} />
        <div className="relative w-full max-w-2xl mx-auto p-8" style={DIALOG_STYLE}>
          <FourCorners />

          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <h2
              className="text-lg font-semibold arena-heading"
              style={{ color: TEXT_PRIMARY, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
            >
              Settings
            </h2>
            <button
              type="button"
              className="px-4 py-1.5 text-xs cursor-pointer transition-all"
              style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
              onClick={onBack}
            >
              Back
            </button>
          </div>

          <OrnamentalDivider className="mb-5" />

          {/* Layout: sidebar + content */}
          <div className="flex gap-6">
            {/* Sidebar */}
            <div className="w-32 shrink-0 flex flex-col gap-1">
              {SECTIONS.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  className="text-left px-3 py-2 text-sm font-medium cursor-pointer transition-all rounded-md"
                  style={{
                    color: activeSection === section.key ? TEXT_PRIMARY : TEXT_MUTED,
                    background: activeSection === section.key ? `${GOLD} 0.08)` : 'transparent',
                    border: activeSection === section.key ? `1px solid ${GOLD} 0.15)` : '1px solid transparent',
                  }}
                  onClick={() => this.setState({ activeSection: section.key })}
                >
                  {section.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {activeSection === 'sound' ? this.renderSoundSection() : null}
              {activeSection === 'updates' ? this.renderUpdatesSection() : null}
            </div>
          </div>
        </div>
      </div>
    );
  }
}
