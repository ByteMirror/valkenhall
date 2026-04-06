import { Component } from 'preact';
import RuneSpinner from './RuneSpinner';
import { getSoundSettings, saveSoundSettings } from '../utils/arena/soundSettings';
import { updateMusicVolume } from '../utils/arena/musicManager';
import { UI } from '../utils/arena/uiSounds';
import {
  GOLD, GOLD_TEXT, BG_ATMOSPHERE, VIGNETTE,
  TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD, PARCHMENT, PANEL_BG,
  DIALOG_STYLE, BEVELED_BTN, GOLD_BTN, DANGER_BTN,
  FourCorners, CornerPlating, OrnamentalDivider, getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';

const SECTIONS = [
  { key: 'sound', label: 'Sound', icon: '\u266B' },
  { key: 'profile', label: 'Profile', icon: '\u2726' },
  { key: 'updates', label: 'Updates', icon: '\u2B06' },
  { key: 'danger', label: 'Account', icon: '\u26A0' },
];

const TOGGLE_ON = { border: `1px solid ${GOLD} 0.4)`, background: `${GOLD} 0.12)`, color: '#d4a843' };
const TOGGLE_OFF = { border: `1px solid ${GOLD} 0.1)`, background: 'transparent', color: TEXT_MUTED };
const SECTION_LABEL = { color: `${GOLD} 0.55)`, textShadow: `0 0 12px ${GOLD} 0.15)` };
const ROW_BORDER = { borderBottom: `1px solid ${GOLD} 0.06)` };
const PANEL = { background: PANEL_BG, border: `1px solid ${GOLD} 0.12)`, borderRadius: '8px' };

export default class SettingsScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      activeSection: 'sound',
      soundSettings: getSoundSettings(),
      showResetConfirm: false,
      checking: false,
      retrying: false,
      viewScale: getViewportScale(),
    };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
  }

  componentWillUnmount() {
    this.unsubScale?.();
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
        <div className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={SECTION_LABEL}>Sound</div>
        <div className="flex flex-col overflow-hidden" style={PANEL}>
          <div className="flex items-center justify-between px-4 py-3" style={ROW_BORDER}>
            <span className="text-sm" style={{ color: TEXT_PRIMARY }}>Master Volume</span>
            <div className="flex items-center gap-3">
              <input type="range" min="0" max="100" value={Math.round(ss.masterVolume * 100)} className="w-28 h-1 accent-amber-500 cursor-pointer" onInput={(e) => this.updateSound('masterVolume', parseInt(e.target.value, 10) / 100)} />
              <span className="text-xs w-8 text-right tabular-nums" style={{ color: TEXT_MUTED }}>{Math.round(ss.masterVolume * 100)}%</span>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-3" style={ROW_BORDER}>
            <span className="text-sm" style={{ color: TEXT_PRIMARY }}>Music</span>
            <div className="flex items-center gap-3">
              <button type="button" className="rounded-md px-2 py-0.5 text-[10px] font-medium cursor-pointer transition-colors" style={ss.musicEnabled ? TOGGLE_ON : TOGGLE_OFF} onClick={() => this.updateSound('musicEnabled', !ss.musicEnabled)}>{ss.musicEnabled ? 'On' : 'Off'}</button>
              <input type="range" min="0" max="100" value={Math.round(ss.musicVolume * 100)} className="w-24 h-1 accent-amber-500 cursor-pointer" disabled={!ss.musicEnabled} onInput={(e) => this.updateSound('musicVolume', parseInt(e.target.value, 10) / 100)} />
              <span className="text-xs w-8 text-right tabular-nums" style={{ color: TEXT_MUTED }}>{Math.round(ss.musicVolume * 100)}%</span>
            </div>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm" style={{ color: TEXT_PRIMARY }}>Sound Effects</span>
            <div className="flex items-center gap-3">
              <button type="button" className="rounded-md px-2 py-0.5 text-[10px] font-medium cursor-pointer transition-colors" style={ss.sfxEnabled ? TOGGLE_ON : TOGGLE_OFF} onClick={() => this.updateSound('sfxEnabled', !ss.sfxEnabled)}>{ss.sfxEnabled ? 'On' : 'Off'}</button>
              <input type="range" min="0" max="100" value={Math.round(ss.sfxVolume * 100)} className="w-24 h-1 accent-amber-500 cursor-pointer" disabled={!ss.sfxEnabled} onInput={(e) => this.updateSound('sfxVolume', parseInt(e.target.value, 10) / 100)} />
              <span className="text-xs w-8 text-right tabular-nums" style={{ color: TEXT_MUTED }}>{Math.round(ss.sfxVolume * 100)}%</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  renderProfileSection() {
    const { profile, onChangeAvatar } = this.props;
    if (!profile) return null;

    return (
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={SECTION_LABEL}>Profile</div>
        <div className="flex flex-col overflow-hidden" style={PANEL}>
          <div className="flex items-center justify-between px-4 py-3" style={ROW_BORDER}>
            <div>
              <div className="text-sm" style={{ color: TEXT_PRIMARY }}>Username</div>
              <div className="text-xs" style={{ color: TEXT_MUTED }}>{profile.name}</div>
            </div>
            <span className="text-[10px]" style={{ color: `${GOLD} 0.25)` }}>Set at registration</span>
          </div>
          {onChangeAvatar ? (
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm" style={{ color: TEXT_PRIMARY }}>Avatar</div>
                <div className="text-xs" style={{ color: TEXT_MUTED }}>Change your profile picture</div>
              </div>
              <button
                type="button"
                className="px-3 py-1 text-xs font-medium cursor-pointer transition-all"
                style={{ ...BEVELED_BTN, color: `${GOLD_TEXT} 0.6)`, borderRadius: '6px' }}
                onClick={() => { this.props.onBack(); onChangeAvatar(); }}
              >
                Change
              </button>
            </div>
          ) : null}
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
        <div className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={SECTION_LABEL}>Updates</div>
        <div className="flex flex-col overflow-hidden" style={PANEL}>
          <div className="flex items-center justify-between px-4 py-3" style={ROW_BORDER}>
            <span className="text-sm" style={{ color: TEXT_PRIMARY }}>Current Version</span>
            <span className="text-sm tabular-nums" style={{ color: TEXT_BODY }}>{status.currentVersion || 'Unknown'}</span>
          </div>

          <div className="flex items-center justify-between px-4 py-3" style={ROW_BORDER}>
            <span className="text-sm" style={{ color: TEXT_PRIMARY }}>Status</span>
            <span className="text-sm font-medium" style={{ color: stateColors[status.state] || TEXT_MUTED }}>
              {stateLabels[status.state] || status.state || 'Unknown'}
            </span>
          </div>

          {status.state === 'DOWNLOAD_FAILED' && status.error ? (
            <div className="px-4 py-2 text-xs" style={{ color: '#b04040', ...ROW_BORDER }}>
              {status.error}
            </div>
          ) : null}

          {status.state === 'DOWNLOADING' && status.downloadProgress != null ? (
            <div className="px-4 py-2" style={ROW_BORDER}>
              <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: `${GOLD} 0.1)` }}>
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${status.downloadProgress}%`, background: ACCENT_GOLD }} />
              </div>
            </div>
          ) : null}

          {status.releaseNotes && (status.state === 'READY_TO_INSTALL' || status.state === 'DOWNLOADING' || status.state === 'UPDATE_AVAILABLE') ? (
            <div className="px-4 py-3" style={ROW_BORDER}>
              <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: `${GOLD} 0.4)` }}>
                What's New in {status.newVersion || 'this update'}
              </div>
              <div className="text-xs leading-relaxed max-h-32 overflow-y-auto" style={{ color: TEXT_BODY, whiteSpace: 'pre-wrap' }}>
                {status.releaseNotes}
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 px-4 py-3">
            {status.state === 'DOWNLOAD_FAILED' ? (
              <button type="button" className="px-4 py-1.5 text-xs font-medium cursor-pointer transition-all" style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px', opacity: retrying ? 0.6 : 1 }} disabled={retrying} onClick={this.handleRetry}>
                {retrying ? <><RuneSpinner size={14} className="inline-block" /><span className="invisible">Retry Download</span></> : 'Retry Download'}
              </button>
            ) : null}
            {status.state === 'UP_TO_DATE' || status.state === 'DOWNLOAD_FAILED' ? (
              <button type="button" className="px-4 py-1.5 text-xs font-medium cursor-pointer transition-all" style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px', opacity: checking ? 0.6 : 1 }} disabled={checking} onClick={this.handleCheck}>
                {checking ? <><RuneSpinner size={14} className="inline-block" /><span className="invisible">Check for Updates</span></> : 'Check for Updates'}
              </button>
            ) : null}
            {status.state === 'READY_TO_INSTALL' ? (
              <button type="button" className="px-4 py-1.5 text-xs font-bold arena-heading cursor-pointer transition-all" style={{ ...GOLD_BTN, borderRadius: '6px' }} data-sound={UI.CONFIRM} onClick={onApply}>
                Restart to Update
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  renderDangerSection() {
    const { onLogout, onResetProfile, onQuit } = this.props;
    const { showResetConfirm } = this.state;

    return (
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'rgba(180,60,60,0.55)', textShadow: '0 0 12px rgba(180,60,60,0.15)' }}>Account</div>
        <div className="flex flex-col overflow-hidden" style={{ background: PANEL_BG, border: '1px solid rgba(180,60,60,0.15)', borderRadius: '8px' }}>
          {onLogout ? (
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(180,60,60,0.08)' }}>
              <div>
                <div className="text-sm" style={{ color: TEXT_BODY }}>Log Out</div>
                <div className="text-xs" style={{ color: TEXT_MUTED }}>Sign out and switch to another account</div>
              </div>
              <button type="button" className="px-3 py-1 text-xs cursor-pointer transition-all" style={{ ...BEVELED_BTN, borderRadius: '6px' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(166,160,155,0.55)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = BEVELED_BTN.borderColor; }}
                data-sound={UI.CANCEL}
                onClick={() => { this.props.onBack(); onLogout(); }}
              >
                Log Out
              </button>
            </div>
          ) : null}
          {onResetProfile ? (
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid rgba(180,60,60,0.08)' }}>
              <div>
                <div className="text-sm" style={{ color: '#c45050' }}>Reset Profile</div>
                <div className="text-xs" style={{ color: TEXT_MUTED }}>Delete all progress and start over</div>
              </div>
              {showResetConfirm ? (
                <div className="flex items-center gap-2">
                  <button type="button" className="px-3 py-1 text-xs font-medium cursor-pointer transition-all" style={{ ...DANGER_BTN, background: 'rgba(180,60,60,0.8)', color: '#fff', borderRadius: '6px' }} data-sound={UI.CANCEL} onClick={() => { this.setState({ showResetConfirm: false }); this.props.onBack(); onResetProfile(); }}>
                    Confirm
                  </button>
                  <button type="button" className="px-3 py-1 text-xs cursor-pointer transition-all" style={{ ...BEVELED_BTN, color: TEXT_MUTED, borderRadius: '6px' }} onClick={() => this.setState({ showResetConfirm: false })}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" className="px-3 py-1 text-xs cursor-pointer transition-all" style={{ ...DANGER_BTN, borderRadius: '6px' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(180,60,60,0.55)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(180,60,60,0.35)'; }}
                  data-sound={UI.CANCEL}
                  onClick={() => this.setState({ showResetConfirm: true })}
                >
                  Reset
                </button>
              )}
            </div>
          ) : null}
          {onQuit ? (
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="text-sm" style={{ color: '#c45050' }}>Quit Game</div>
                <div className="text-xs" style={{ color: TEXT_MUTED }}>Close Valkenhall</div>
              </div>
              <button type="button" className="px-3 py-1 text-xs cursor-pointer transition-all" style={{ ...DANGER_BTN, borderRadius: '6px' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(180,60,60,0.55)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(180,60,60,0.35)'; }}
                data-sound={UI.CANCEL}
                onClick={() => { this.props.onBack(); onQuit(); }}
              >
                Quit
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  render() {
    const { onBack, profile } = this.props;
    const { activeSection, viewScale } = this.state;

    // Filter sections based on available props
    const visibleSections = SECTIONS.filter((s) => {
      if (s.key === 'profile' && !profile) return false;
      if (s.key === 'danger' && !this.props.onLogout && !this.props.onResetProfile && !this.props.onQuit) return false;
      return true;
    });

    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: `url("/tex-noise-panel.webp"), rgba(0,0,0,0.85)`, backdropFilter: 'blur(4px)' }}>
        <div className="fixed inset-0 pointer-events-none" style={{ background: VIGNETTE }} />
        <div className="relative w-full max-w-2xl mx-auto flex flex-col" style={{ ...DIALOG_STYLE, zoom: viewScale, maxHeight: `${80 / viewScale}vh`, background: `url("/tex-noise.webp"), url("/tex-stone.webp"), ${DIALOG_STYLE.background}` }}>
          <FourCorners radius={12} />

          {/* Header */}
          <div className="flex items-center justify-between px-8 pt-6 pb-4 shrink-0">
            <h2 className="text-xl font-bold arena-heading" style={{ color: TEXT_PRIMARY, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
              Settings
            </h2>
            <button
              type="button"
              className="px-4 py-1.5 text-xs cursor-pointer transition-all"
              style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
              data-sound={UI.CANCEL}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.5)`; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${GOLD} 0.3)`; }}
              onClick={onBack}
            >
              Close
            </button>
          </div>

          <div className="px-8 shrink-0"><OrnamentalDivider /></div>

          {/* Layout: sidebar + scrollable content */}
          <div className="flex flex-1 min-h-0 px-8 py-5 gap-6">
            {/* Sidebar */}
            <div
              className="relative w-40 shrink-0 flex flex-col gap-1 p-2.5 rounded-lg"
              style={{
                background: `url("/tex-noise.webp"), rgba(0,0,0,0.25)`,
                border: `1px solid ${GOLD} 0.1)`,
                boxShadow: `inset 0 2px 6px rgba(0,0,0,0.4), inset 0 -1px 0 ${GOLD} 0.04)`,
              }}
            >
              <CornerPlating position="top-left" color={`${GOLD} 0.25)`} radius={8} />
              <CornerPlating position="top-right" color={`${GOLD} 0.25)`} radius={8} />
              <CornerPlating position="bottom-left" color={`${GOLD} 0.25)`} radius={8} />
              <CornerPlating position="bottom-right" color={`${GOLD} 0.25)`} radius={8} />
              {visibleSections.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  className="text-left px-3 py-2.5 text-sm font-medium cursor-pointer transition-all rounded-md flex items-center gap-2.5"
                  style={{
                    color: activeSection === section.key ? TEXT_PRIMARY : TEXT_MUTED,
                    background: activeSection === section.key ? `${GOLD} 0.08)` : 'transparent',
                    border: activeSection === section.key ? `1px solid ${GOLD} 0.15)` : '1px solid transparent',
                  }}
                  onMouseEnter={(e) => { if (activeSection !== section.key) e.currentTarget.style.background = `${GOLD} 0.04)`; }}
                  onMouseLeave={(e) => { if (activeSection !== section.key) e.currentTarget.style.background = 'transparent'; }}
                  onClick={() => this.setState({ activeSection: section.key, showResetConfirm: false })}
                >
                  <span className="text-xs opacity-50">{section.icon}</span>
                  {section.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 overflow-y-auto">
              {activeSection === 'sound' ? this.renderSoundSection() : null}
              {activeSection === 'profile' ? this.renderProfileSection() : null}
              {activeSection === 'updates' ? this.renderUpdatesSection() : null}
              {activeSection === 'danger' ? this.renderDangerSection() : null}
            </div>
          </div>
        </div>
      </div>
    );
  }
}
