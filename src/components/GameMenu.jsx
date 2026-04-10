import { Component } from 'preact';
import { UI } from '../utils/arena/uiSounds';
import {
  VIGNETTE, GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, PANEL_BG, BEVELED_BTN,
  DANGER_BTN, FourCorners, OrnamentalDivider, MenuButton, getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';
import ReportIssueDialog from './ReportIssueDialog';

export default class GameMenu extends Component {
  constructor(props) {
    super(props);
    this.state = { viewScale: getViewportScale(), confirmMainMenu: false, showReport: false };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
  }

  componentWillUnmount() {
    this.unsubScale?.();
  }

  handleMainMenuClick = () => {
    if (this.props.inSession) {
      this.setState({ confirmMainMenu: true });
    } else {
      this.props.onMainMenu?.();
    }
  };

  confirmMainMenu = () => {
    this.setState({ confirmMainMenu: false });
    this.props.onMainMenu?.();
  };

  cancelMainMenu = () => this.setState({ confirmMainMenu: false });

  render() {
    const { onResume, onQuit, onOpenSettings, onMainMenu, appVersion } = this.props;
    const { viewScale, confirmMainMenu, showReport } = this.state;

    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', zoom: viewScale }}>
        <div className="fixed inset-0 pointer-events-none" style={{ background: VIGNETTE }} />
        <img src="/valkenhall-logo.png" alt="Valkenhall" className="w-80 mb-12 relative" draggable={false} />
        <div className="flex flex-col gap-1 w-64 relative">
          <MenuButton title="Resume" onClick={onResume} />
          <MenuButton title="Settings" onClick={onOpenSettings} />
          <MenuButton title="Report Issue" onClick={() => this.setState({ showReport: true })} />
          {onMainMenu ? <MenuButton title="Main Menu" onClick={this.handleMainMenuClick} /> : null}
          <OrnamentalDivider className="my-2" />
          <button
            type="button"
            className="relative w-full py-3 text-sm font-semibold arena-heading cursor-pointer transition-all"
            style={{ ...DANGER_BTN, borderRadius: '6px' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(180,60,60,0.55)'; e.currentTarget.style.transform = 'scale(1.02)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(180,60,60,0.35)'; e.currentTarget.style.transform = 'scale(1)'; }}
            data-sound={UI.CANCEL}
            onClick={onQuit}
          >
            Quit Game
          </button>
        </div>

        {showReport ? (
          <ReportIssueDialog
            appVersion={appVersion}
            onClose={() => this.setState({ showReport: false })}
          />
        ) : null}

        {confirmMainMenu ? (
          <div className="fixed inset-0 z-[210] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
            <div className="relative w-80 p-5" style={{ background: PANEL_BG, border: `1px solid ${GOLD} 0.25)`, borderRadius: '12px', boxShadow: '0 0 60px rgba(0,0,0,0.5)', isolation: 'isolate' }}>
              <FourCorners radius={12} />
              <h2 className="mb-2 text-lg font-semibold arena-heading" style={{ color: TEXT_PRIMARY }}>Return to main menu?</h2>
              <p className="mb-4 text-sm" style={{ color: TEXT_MUTED }}>Your game will be auto-saved and the session will end.</p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium cursor-pointer transition-all"
                  style={{ ...BEVELED_BTN, color: TEXT_BODY, borderRadius: '6px' }}
                  data-sound={UI.CANCEL}
                  onClick={this.cancelMainMenu}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium cursor-pointer transition-all"
                  style={{ ...DANGER_BTN, borderRadius: '6px' }}
                  data-sound={UI.CONFIRM}
                  onClick={this.confirmMainMenu}
                >
                  Main Menu
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  }
}
