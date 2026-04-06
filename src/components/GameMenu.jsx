import { Component } from 'preact';
import { UI } from '../utils/arena/uiSounds';
import {
  VIGNETTE, GOLD, TEXT_PRIMARY, TEXT_BODY,
  DANGER_BTN, FourCorners, OrnamentalDivider, MenuButton, getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';

export default class GameMenu extends Component {
  constructor(props) {
    super(props);
    this.state = { viewScale: getViewportScale() };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
  }

  componentWillUnmount() {
    this.unsubScale?.();
  }

  render() {
    const { onResume, onQuit, onOpenSettings } = this.props;
    const { viewScale } = this.state;

    return (
      <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', zoom: viewScale }}>
        <div className="fixed inset-0 pointer-events-none" style={{ background: VIGNETTE }} />
        <img src="/valkenhall-logo.png" alt="Valkenhall" className="w-80 mb-12 relative" draggable={false} />
        <div className="flex flex-col gap-1 w-64 relative">
          <MenuButton title="Resume" onClick={onResume} />
          <MenuButton title="Settings" onClick={onOpenSettings} />
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
      </div>
    );
  }
}
