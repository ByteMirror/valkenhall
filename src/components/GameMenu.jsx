import { Component } from 'preact';
import { cn } from '../lib/utils';
import { getSoundSettings, saveSoundSettings } from '../utils/arena/soundSettings';
import { updateMusicVolume } from '../utils/arena/musicManager';

export default class GameMenu extends Component {
  constructor(props) {
    super(props);
    this.state = {
      showSettings: false,
      soundSettings: getSoundSettings(),
    };
  }

  updateSound = (key, value) => {
    const next = { ...this.state.soundSettings, [key]: value };
    saveSoundSettings(next);
    this.setState({ soundSettings: next });
    updateMusicVolume();
  };

  handleSettingsClick = () => {
    this.setState({ showSettings: true });
  };

  handleSettingsClose = () => {
    this.setState({ showSettings: false });
  };

  render() {
    const { onResume, onQuit } = this.props;
    const { showSettings, soundSettings } = this.state;
    const ss = soundSettings;

    if (showSettings) {
      return (
        <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-center justify-center">
          <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-white mb-5">Settings</h2>

            <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">Sound</div>
            <div className="flex flex-col mb-5 rounded-xl border border-white/10 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <span className="text-sm text-white">Master Volume</span>
                <div className="flex items-center gap-3">
                  <input type="range" min="0" max="100" value={Math.round(ss.masterVolume * 100)} className="w-24 h-1 accent-amber-500 cursor-pointer" onInput={(e) => this.updateSound('masterVolume', parseInt(e.target.value, 10) / 100)} />
                  <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">{Math.round(ss.masterVolume * 100)}%</span>
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <span className="text-sm text-white">Music</span>
                <div className="flex items-center gap-3">
                  <button type="button" className={cn('rounded-md px-2 py-0.5 text-[10px] font-medium border transition-colors', ss.musicEnabled ? 'border-green-500/40 bg-green-500/15 text-green-400' : 'border-white/15 text-white/30')} onClick={() => this.updateSound('musicEnabled', !ss.musicEnabled)}>{ss.musicEnabled ? 'On' : 'Off'}</button>
                  <input type="range" min="0" max="100" value={Math.round(ss.musicVolume * 100)} className="w-20 h-1 accent-amber-500 cursor-pointer" disabled={!ss.musicEnabled} onInput={(e) => this.updateSound('musicVolume', parseInt(e.target.value, 10) / 100)} />
                  <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">{Math.round(ss.musicVolume * 100)}%</span>
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-white">Sound Effects</span>
                <div className="flex items-center gap-3">
                  <button type="button" className={cn('rounded-md px-2 py-0.5 text-[10px] font-medium border transition-colors', ss.sfxEnabled ? 'border-green-500/40 bg-green-500/15 text-green-400' : 'border-white/15 text-white/30')} onClick={() => this.updateSound('sfxEnabled', !ss.sfxEnabled)}>{ss.sfxEnabled ? 'On' : 'Off'}</button>
                  <input type="range" min="0" max="100" value={Math.round(ss.sfxVolume * 100)} className="w-20 h-1 accent-amber-500 cursor-pointer" disabled={!ss.sfxEnabled} onInput={(e) => this.updateSound('sfxVolume', parseInt(e.target.value, 10) / 100)} />
                  <span className="text-xs text-muted-foreground w-8 text-right tabular-nums">{Math.round(ss.sfxVolume * 100)}%</span>
                </div>
              </div>
            </div>

            <div className="text-right">
              <button type="button" className="rounded-lg border border-white/20 px-4 py-1.5 text-xs text-white/60 hover:bg-white/10" onClick={this.handleSettingsClose}>Close</button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center">
        <img src="/flesh-and-blood-proxies/valkenhall-logo.png" alt="Valkenhall" className="w-80 mb-12" draggable={false} />
        <div className="flex flex-col gap-3 w-64">
          <button
            type="button"
            className="w-full rounded-xl py-3 text-sm font-semibold bg-amber-500 text-black hover:bg-amber-400 transition-colors"
            onClick={onResume}
          >
            Resume
          </button>
          <button
            type="button"
            className="w-full rounded-xl py-3 text-sm font-semibold border border-white/20 text-white/80 hover:bg-white/10 transition-colors"
            onClick={this.handleSettingsClick}
          >
            Settings
          </button>
          <button
            type="button"
            className="w-full rounded-xl py-3 text-sm font-semibold border border-red-500/30 text-red-400/80 hover:bg-red-500/10 transition-colors"
            onClick={onQuit}
          >
            Quit Game
          </button>
        </div>
      </div>
    );
  }
}
