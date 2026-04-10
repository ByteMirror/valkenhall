import { Component } from 'preact';
import RuneSpinner from './RuneSpinner';
import { UI } from '../utils/arena/uiSounds';
import { BOOSTER_SETS } from '../utils/arena/packsApi';
import {
  getDraftEvent, leaveDraftEvent, cancelDraftEvent, startDraftEarly, inviteToDraft,
  subscribeToDraftEvents, DRAFT_STATUS,
} from '../utils/arena/draftApi';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD, COIN_COLOR,
  BEVELED_BTN, GOLD_BTN, DANGER_BTN,
  DIALOG_STYLE, INPUT_STYLE,
  FourCorners, OrnamentalDivider,
  getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';
import DeckCardTile from './DeckCardTile';
import { Select } from './ui/select';
import { CoinIcon } from './ui/icons';

export default class DraftLobby extends Component {
  constructor(props) {
    super(props);
    this.state = {
      event: null,
      loading: true,
      error: null,
      countdown: '',
      showInvite: false,
      invitedIds: new Set(),
      leaving: false,
      cancelling: false,
      starting: false,
      viewScale: getViewportScale(),
    };
    this.countdownTimer = null;
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
    this.unsubDraft = subscribeToDraftEvents({
      joined: () => this.loadEvent(),
      left: () => this.loadEvent(),
      cancelled: (data) => {
        if (data?.eventId === this.props.eventId) {
          this.props.onCancelled?.();
        }
      },
      started: (data) => {
        if (data?.eventId === this.props.eventId) {
          this.props.onDraftStarted?.(data);
        }
      },
    });
    this.loadEvent();
    this.countdownTimer = setInterval(() => this.updateCountdown(), 1000);
  }

  componentWillUnmount() {
    this.unsubScale?.();
    this.unsubDraft?.();
    clearInterval(this.countdownTimer);
  }

  loadEvent = async () => {
    try {
      const event = await getDraftEvent(this.props.eventId);
      this.setState({ event, loading: false });
      this.updateCountdown();
    } catch (err) {
      this.setState({ error: err.message, loading: false });
    }
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
    text += `${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
    this.setState({ countdown: text });
  }

  handleLeave = async () => {
    this.setState({ leaving: true });
    try {
      await leaveDraftEvent(this.props.eventId);
      this.props.onLeft?.();
    } catch (err) {
      this.setState({ leaving: false });
      console.error('[DraftLobby] leave failed:', err);
    }
  };

  handleCancel = async () => {
    this.setState({ cancelling: true });
    try {
      await cancelDraftEvent(this.props.eventId);
      this.props.onCancelled?.();
    } catch (err) {
      this.setState({ cancelling: false });
      console.error('[DraftLobby] cancel failed:', err);
    }
  };

  handleStartEarly = async () => {
    this.setState({ starting: true });
    try {
      await startDraftEarly(this.props.eventId);
    } catch (err) {
      this.setState({ starting: false });
      console.error('[DraftLobby] start early failed:', err);
    }
  };

  handleInviteFriend = async (friendId) => {
    try {
      await inviteToDraft(this.props.eventId, [friendId]);
      this.setState((s) => {
        const next = new Set(s.invitedIds);
        next.add(friendId);
        return { invitedIds: next };
      });
    } catch (err) {
      console.error('[DraftLobby] invite failed:', err);
    }
  };

  getInvitableOptions() {
    const { friendListData } = this.props;
    const { event, invitedIds } = this.state;
    const friends = friendListData?.friends || [];
    const participantIds = new Set((event?.participants || []).map((p) => p.playerId));

    return friends
      .filter((f) => !participantIds.has(f.id))
      .map((f) => ({
        value: f.id,
        label: f.name || 'Unknown',
        disabled: invitedIds.has(f.id),
        description: invitedIds.has(f.id) ? 'Invited' : undefined,
      }));
  }

  resolvePrizeCard(prizeCard) {
    if (!prizeCard) return null;
    const sorceryCards = this.props.sorceryCards || [];
    const card = sorceryCards.find((c) => c.unique_id === prizeCard.cardId);
    if (!card) return null;
    const printing = card.printings?.find((p) => p.unique_id === prizeCard.printingId)
      || card.printings?.find((p) => p.foiling === 'F')
      || card.printings?.[0];
    return { card, printing, rarity: prizeCard.rarity || card.rarity };
  }

  renderPrizeCard(prizeCard) {
    const resolved = this.resolvePrizeCard(prizeCard);
    if (!resolved) return null;

    const RARITY_COLORS = { Unique: '#e8c840', Elite: '#c860e0', Exceptional: '#4898e0', Ordinary: TEXT_BODY, Avatar: '#e04040' };

    return (
      <div className="flex items-center gap-3 mb-4 px-3 py-2 rounded" style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${GOLD} 0.15)` }}>
        <div style={{ width: 40, height: Math.round(40 * 88 / 63), borderRadius: 4, overflow: 'hidden', flexShrink: 0 }}>
          <DeckCardTile
            entry={{ card: resolved.card, printing: resolved.printing || {}, zone: 'spellbook', entryIndex: 0 }}
            isSelected={false}
            onClick={() => {}}
            onHoverChange={() => {}}
          />
        </div>
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-wider" style={{ color: TEXT_MUTED }}>1st Place Prize</div>
          <div className="text-xs font-semibold truncate" style={{ color: RARITY_COLORS[resolved.rarity] || TEXT_PRIMARY }}>
            {resolved.card.name}
          </div>
          <div className="text-[9px]" style={{ color: TEXT_MUTED }}>{resolved.rarity} Foil</div>
        </div>
      </div>
    );
  }

  render() {
    const { profile } = this.props;
    const { event, loading, error, countdown, showInvite, leaving, viewScale } = this.state;

    if (loading) {
      return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <RuneSpinner size={64} />
        </div>
      );
    }

    if (error || !event) {
      return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="text-center p-8" style={DIALOG_STYLE}>
            <FourCorners radius={12} knots />
            <div className="text-sm mb-4" style={{ color: '#c45050' }}>{error || 'Event not found'}</div>
            <button type="button" className="px-5 py-2 text-sm cursor-pointer" style={{ ...BEVELED_BTN, color: TEXT_BODY }} onClick={this.props.onClose}>Close</button>
          </div>
        </div>
      );
    }

    const setLabel = BOOSTER_SETS[event.setKey]?.label || event.setKey;
    const participants = event.participants || [];
    const slots = Array.from({ length: event.podSize }, (_, i) => participants[i] || null);

    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
        <div className="relative w-full max-w-xl p-8" style={{ ...DIALOG_STYLE, zoom: viewScale }}>
          <FourCorners radius={12} knots />

          {/* X button — close modal, stay in queue */}
          <button
            type="button"
            className="absolute top-3 right-3 w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer z-10"
            style={{ color: TEXT_MUTED }}
            onMouseEnter={(e) => { e.currentTarget.style.color = TEXT_BODY; e.currentTarget.style.background = `${GOLD} 0.08)`; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = TEXT_MUTED; e.currentTarget.style.background = 'transparent'; }}
            data-sound={UI.CLOSE}
            onClick={this.props.onClose}
            title="Close (stay in queue)"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

            {/* Header */}
            <div className="text-center mb-2">
              <h2 className="text-2xl font-bold arena-heading" style={{ color: ACCENT_GOLD, textShadow: '0 2px 4px rgba(0,0,0,0.5), 0 0 20px rgba(200,160,60,0.15)' }}>
                {setLabel} Draft
              </h2>
              <div className="text-xs uppercase tracking-wider mt-1 flex items-center justify-center gap-3" style={{ color: TEXT_MUTED }}>
                <span>{event.visibility} event</span>
                <span className="flex items-center gap-0.5" style={{ color: COIN_COLOR }}>
                  {event.entryCost || 120}<CoinIcon size={10} /> entry
                </span>
              </div>
            </div>
            <OrnamentalDivider className="mb-4" />

            {/* Countdown */}
            <div className="text-center mb-5">
              <div className="text-xs uppercase tracking-wider mb-1" style={{ color: TEXT_MUTED }}>Starting in</div>
              <div className="text-3xl font-bold tabular-nums arena-heading" style={{ color: TEXT_PRIMARY, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                {countdown}
              </div>
            </div>

            {/* Player slots */}
            <div className="grid grid-cols-2 gap-2 mb-5">
              {slots.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-2 rounded"
                  style={{
                    background: p ? 'rgba(212,168,67,0.08)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${p ? `${GOLD} 0.2)` : 'rgba(255,255,255,0.05)'}`,
                  }}
                >
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{
                      background: p ? `${GOLD} 0.15)` : 'rgba(255,255,255,0.05)',
                      color: p ? ACCENT_GOLD : TEXT_MUTED,
                    }}
                  >
                    {i + 1}
                  </div>
                  <span className="text-sm truncate" style={{ color: p ? TEXT_PRIMARY : TEXT_MUTED }}>
                    {p ? (p.playerName || p.playerId) : 'Waiting...'}
                  </span>
                </div>
              ))}
            </div>

            <OrnamentalDivider className="mb-4" />

            {/* Actions */}
            <div className="flex gap-3 justify-center">
              {event.creatorId === profile?.id && participants.length >= 2 ? (
                <button
                  type="button"
                  className="px-5 py-2 text-sm font-semibold transition-all cursor-pointer"
                  style={GOLD_BTN}
                  data-sound={UI.CONFIRM}
                  disabled={this.state.starting}
                  onClick={this.handleStartEarly}
                >
                  {this.state.starting ? 'Starting...' : 'Start Draft Now'}
                </button>
              ) : null}
              {event.visibility === 'private' || event.creatorId === profile?.id ? (
                <button
                  type="button"
                  className="px-4 py-2 text-sm transition-all cursor-pointer"
                  style={{ ...BEVELED_BTN, color: TEXT_BODY }}
                  data-sound={UI.TAB}
                  onClick={() => this.setState({ showInvite: !showInvite })}
                >
                  Invite Friends
                </button>
              ) : null}
              {event.creatorId === profile?.id ? (
                <button
                  type="button"
                  className="px-4 py-2 text-sm transition-all cursor-pointer"
                  style={DANGER_BTN}
                  data-sound={UI.CANCEL}
                  disabled={this.state.cancelling}
                  onClick={this.handleCancel}
                >
                  {this.state.cancelling ? 'Cancelling...' : 'Cancel Event'}
                </button>
              ) : (
                <button
                  type="button"
                  className="px-4 py-2 text-sm transition-all cursor-pointer"
                  style={DANGER_BTN}
                  data-sound={UI.CANCEL}
                  disabled={leaving}
                  onClick={this.handleLeave}
                >
                  {leaving ? 'Leaving...' : 'Leave Event'}
                </button>
              )}
            </div>

            {/* Invite panel */}
            {showInvite ? (
              <div className="mt-4 p-3 rounded" style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${GOLD} 0.15)` }}>
                <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1" style={{ color: `${GOLD} 0.55)` }}>
                  Invite a friend
                </label>
                <Select
                  ariaLabel="Invite friend"
                  options={this.getInvitableOptions()}
                  value=""
                  onValueChange={(friendId) => {
                    if (friendId) this.handleInviteFriend(friendId);
                  }}
                  placeholder="Choose a friend..."
                  searchable
                  menuSearchPlaceholder="Type to filter friends..."
                  noOptionsMessage="No friends to invite"
                />
                {this.state.invitedIds.size > 0 ? (
                  <div className="mt-2 text-[10px]" style={{ color: '#6dba6d' }}>
                    {this.state.invitedIds.size} invite{this.state.invitedIds.size !== 1 ? 's' : ''} sent
                  </div>
                ) : null}
              </div>
            ) : null}
        </div>
      </div>
    );
  }
}
