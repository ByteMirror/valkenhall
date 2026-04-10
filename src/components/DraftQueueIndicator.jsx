import { Component } from 'preact';
import { motion, AnimatePresence } from 'framer-motion';
import RuneSpinner from './RuneSpinner';
import { UI } from '../utils/arena/uiSounds';
import { BOOSTER_SETS } from '../utils/arena/packsApi';
import { getDraftEvent, leaveDraftEvent, cancelDraftEvent, DRAFT_STATUS } from '../utils/arena/draftApi';
import { CoinIcon } from './ui/icons';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD, COIN_COLOR,
  BEVELED_BTN, GOLD_BTN, DANGER_BTN, DIALOG_STYLE,
  FourCorners, OrnamentalDivider,
} from '../lib/medievalTheme';

export default class DraftQueueIndicator extends Component {
  constructor(props) {
    super(props);
    this.state = {
      event: null,
      countdown: '',
      leaving: false,
      cancelling: false,
    };
    this.countdownTimer = null;
    this.pollTimer = null;
  }

  componentDidMount() {
    this.loadEvent();
    this.countdownTimer = setInterval(() => this.updateCountdown(), 1000);
    this.pollTimer = setInterval(() => this.loadEvent(), 15000);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.eventId !== this.props.eventId) {
      this.loadEvent();
    }
  }

  componentWillUnmount() {
    clearInterval(this.countdownTimer);
    clearInterval(this.pollTimer);
  }

  loadEvent = async () => {
    const { eventId } = this.props;
    if (!eventId) return;
    try {
      const event = await getDraftEvent(eventId);
      this.setState({ event });
    } catch {}
  };

  updateCountdown() {
    const { event } = this.state;
    if (!event?.scheduledAt) return;

    const diff = new Date(event.scheduledAt) - Date.now();
    if (diff <= 0) {
      this.setState({ countdown: 'Starting...' });
      return;
    }

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);

    let text = '';
    if (hours > 0) text += `${hours}h `;
    text += `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    this.setState({ countdown: text });
  }

  handleLeave = async () => {
    this.setState({ leaving: true });
    try {
      await leaveDraftEvent(this.props.eventId);
      this.props.onLeft?.();
    } catch (err) {
      this.setState({ leaving: false });
      console.error('[DraftQueue] leave failed:', err);
    }
  };

  handleCancel = async () => {
    this.setState({ cancelling: true });
    try {
      await cancelDraftEvent(this.props.eventId);
      this.props.onCancelled?.();
    } catch (err) {
      this.setState({ cancelling: false });
      console.error('[DraftQueue] cancel failed:', err);
    }
  };

  render() {
    const { open, onToggle, eventId, profile } = this.props;
    const { event, countdown, leaving, cancelling } = this.state;

    if (!eventId) return null;

    const setLabel = event ? (BOOSTER_SETS[event.setKey]?.label || event.setKey) : 'Draft';
    const participantCount = event?.participants?.length || 0;
    const podSize = event?.podSize || '?';
    const isCreator = event?.creatorId === profile?.id;

    return (
      <div className="relative" style={{ zIndex: open ? 61 : 'auto' }}>
        {/* Header button — animated pulsing indicator */}
        <button
          type="button"
          className="relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
          style={{ ...BEVELED_BTN, color: ACCENT_GOLD, borderColor: `${GOLD} 0.4)` }}
          onClick={onToggle}
        >
          {/* Pulsing dot */}
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{
              background: ACCENT_GOLD,
              boxShadow: `0 0 6px rgba(212,168,67,0.6)`,
              animation: 'pulse 2s ease-in-out infinite',
            }}
          />
          Draft
          {event && (
            <span className="text-[9px] font-normal tabular-nums" style={{ color: TEXT_BODY }}>
              {countdown}
            </span>
          )}
        </button>

        {/* Dropdown panel */}
        <AnimatePresence>
          {!open ? null : (
            <>
              <div className="fixed inset-0 z-[59]" onClick={onToggle} />
              <motion.div
                className="absolute flex flex-col z-[60]"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: 320,
                  transformOrigin: 'top right',
                  ...DIALOG_STYLE,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <FourCorners radius={12} />

                {/* Header */}
                <div className="flex items-center justify-between px-3 pt-3 pb-0">
                  <span className="text-xs font-bold arena-heading tracking-wide" style={{ color: TEXT_PRIMARY, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                    Draft Queue
                  </span>
                  <button
                    type="button"
                    className="w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer"
                    style={{ color: TEXT_MUTED }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = TEXT_BODY; e.currentTarget.style.background = `${GOLD} 0.08)`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = TEXT_MUTED; e.currentTarget.style.background = 'transparent'; }}
                    data-sound={UI.CANCEL}
                    onClick={onToggle}
                  >
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                      <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>

                <div className="px-3 py-3">
                  {!event ? (
                    <div className="flex justify-center py-4"><RuneSpinner size={32} /></div>
                  ) : (
                    <>
                      {/* Event info */}
                      <div className="text-sm font-semibold mb-0.5" style={{ color: TEXT_PRIMARY }}>{setLabel} Draft</div>
                      <div className="text-[10px] uppercase tracking-wider mb-3" style={{ color: TEXT_MUTED }}>
                        {event.visibility} event · {participantCount}/{podSize} players
                      </div>

                      {/* Countdown */}
                      <div className="text-center py-3 mb-3 rounded" style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${GOLD} 0.1)` }}>
                        <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: TEXT_MUTED }}>Starting in</div>
                        <div className="text-2xl font-bold tabular-nums arena-heading" style={{ color: TEXT_PRIMARY, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                          {countdown}
                        </div>
                      </div>

                      {/* Participants preview */}
                      <div className="flex flex-wrap gap-1 mb-3">
                        {(event.participants || []).map((p) => (
                          <span
                            key={p.playerId}
                            className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{ background: `${GOLD} 0.08)`, color: p.playerId === profile?.id ? ACCENT_GOLD : TEXT_BODY }}
                          >
                            {p.playerName || 'Player'}
                          </span>
                        ))}
                      </div>

                      <OrnamentalDivider className="mb-3" />

                      {/* Actions */}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="flex-1 py-1.5 text-xs font-semibold transition-all cursor-pointer rounded"
                          style={GOLD_BTN}
                          data-sound={UI.CONFIRM}
                          onClick={() => { onToggle(); this.props.onOpenLobby?.(); }}
                        >
                          Open Lobby
                        </button>
                        {isCreator ? (
                          <button
                            type="button"
                            className="py-1.5 px-3 text-xs transition-all cursor-pointer rounded"
                            style={DANGER_BTN}
                            data-sound={UI.CANCEL}
                            disabled={cancelling}
                            onClick={this.handleCancel}
                          >
                            {cancelling ? '...' : 'Cancel'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="py-1.5 px-3 text-xs transition-all cursor-pointer rounded"
                            style={{ ...BEVELED_BTN, color: TEXT_BODY }}
                            data-sound={UI.CANCEL}
                            disabled={leaving}
                            onClick={this.handleLeave}
                          >
                            {leaving ? '...' : 'Leave'}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  }
}
