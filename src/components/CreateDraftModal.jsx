import { Component } from 'preact';
import { UI } from '../utils/arena/uiSounds';
import { BOOSTER_SETS } from '../utils/arena/packsApi';
import { DRAFT_VISIBILITY, DRAFT_ENTRY_COST } from '../utils/arena/draftApi';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD, COIN_COLOR,
  DIALOG_STYLE, BEVELED_BTN, GOLD_BTN, INPUT_STYLE,
  TAB_ACTIVE, TAB_INACTIVE,
  FourCorners, OrnamentalDivider,
  getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';
import { Select } from './ui/select';
import { CoinIcon } from './ui/icons';

function pad(n) { return String(n).padStart(2, '0'); }

// Build date/time defaults: 30 minutes from now
function defaultDateTime() {
  const d = new Date(Date.now() + 30 * 60 * 1000);
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDate(),
    hour: d.getHours(),
    minute: Math.ceil(d.getMinutes() / 5) * 5,
  };
}

// Medieval-styled input for small numbers
const MEDIEVAL_INPUT = {
  ...INPUT_STYLE,
  backgroundColor: '#0e0a06',
  color: TEXT_PRIMARY,
  width: '100%',
  height: 40,
  padding: '0 12px',
  fontSize: 14,
  outline: 'none',
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

const SET_OPTIONS = Object.entries(BOOSTER_SETS).map(([key, set]) => ({ value: key, label: set.label }));

const VISIBILITY_OPTIONS_BASE = [
  { value: DRAFT_VISIBILITY.PUBLIC, label: 'Public — anyone can join' },
  { value: DRAFT_VISIBILITY.PRIVATE, label: 'Private — invite friends' },
];

export default class CreateDraftModal extends Component {
  constructor(props) {
    super(props);
    const dt = defaultDateTime();
    this.state = {
      setKey: 'beta',
      podSize: 8,
      year: dt.year,
      month: dt.month,
      day: dt.day,
      hour: dt.hour,
      minute: dt.minute,
      visibility: props.guildId ? DRAFT_VISIBILITY.GUILD : DRAFT_VISIBILITY.PUBLIC,
      invitedFriends: [],
      friendSearch: '',
      submitting: false,
      error: null,
      viewScale: getViewportScale(),
    };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
  }

  componentWillUnmount() {
    this.unsubScale?.();
  }

  getPodSize() {
    return this.state.podSize;
  }

  getScheduledDate() {
    const { year, month, day, hour, minute } = this.state;
    return new Date(year, month, day, hour, minute);
  }

  handleSubmit = async () => {
    const { onCreate } = this.props;
    const { setKey, visibility, invitedFriends } = this.state;
    const podSize = this.getPodSize();
    const scheduled = this.getScheduledDate();

    if (scheduled <= new Date()) {
      this.setState({ error: 'Scheduled time must be in the future' });
      return;
    }

    this.setState({ submitting: true, error: null });
    try {
      await onCreate({
        setKey,
        podSize,
        scheduledAt: scheduled.toISOString(),
        visibility,
        guildId: visibility === DRAFT_VISIBILITY.GUILD ? this.props.guildId : undefined,
        invitePlayerIds: visibility === DRAFT_VISIBILITY.PRIVATE ? invitedFriends.map((f) => f.id) : undefined,
      });
    } catch (err) {
      this.setState({ submitting: false, error: err.message });
    }
  };

  toggleFriendInvite = (friend) => {
    this.setState((s) => {
      const exists = s.invitedFriends.some((f) => f.id === friend.id);
      return {
        invitedFriends: exists
          ? s.invitedFriends.filter((f) => f.id !== friend.id)
          : [...s.invitedFriends, friend],
      };
    });
  };

  getFilteredFriends() {
    const { friendListData } = this.props;
    const friends = friendListData?.friends || [];
    const q = this.state.friendSearch.toLowerCase().trim();
    if (!q) return friends;
    return friends.filter((f) => f.name.toLowerCase().includes(q));
  }

  render() {
    const { onClose, guildId, profile } = this.props;
    const { setKey, podSize, year, month, day, hour, minute, visibility, invitedFriends, submitting, error, viewScale } = this.state;

    const showFriendPicker = visibility === DRAFT_VISIBILITY.PRIVATE;
    const playerCoins = profile?.coins || 0;
    const canAfford = playerCoins >= DRAFT_ENTRY_COST;

    // Build date picker options
    const maxDay = daysInMonth(year, month);
    const dayOptions = Array.from({ length: maxDay }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
    const monthOptions = MONTH_NAMES.map((name, i) => ({ value: String(i), label: name }));
    const currentYear = new Date().getFullYear();
    const yearOptions = [currentYear, currentYear + 1].map((y) => ({ value: String(y), label: String(y) }));
    const hourOptions = Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: pad(i) }));
    const minuteOptions = Array.from({ length: 12 }, (_, i) => ({ value: String(i * 5), label: pad(i * 5) }));

    const visibilityOptions = guildId
      ? [...VISIBILITY_OPTIONS_BASE.slice(0, 1), { value: DRAFT_VISIBILITY.GUILD, label: 'Guild — members only' }, ...VISIBILITY_OPTIONS_BASE.slice(1)]
      : VISIBILITY_OPTIONS_BASE;

    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
        <div className="relative w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" style={{ ...DIALOG_STYLE, zoom: viewScale }}>
          <FourCorners radius={12} knots />

          <h2 className="text-xl font-bold arena-heading mb-1" style={{ color: ACCENT_GOLD, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
            Create Draft Event
          </h2>
          <OrnamentalDivider className="mb-4" />

          {/* Booster Set */}
          <div className="mb-3">
            <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1" style={{ color: `${GOLD} 0.55)` }}>
              Booster Set
            </label>
            <Select
              portalMenu
              ariaLabel="Booster Set"
              options={SET_OPTIONS}
              value={setKey}
              onValueChange={(v) => this.setState({ setKey: v })}
              placeholder="Select a set..."
            />
          </div>

          {/* Pod Size */}
          <div className="mb-3">
            <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: `${GOLD} 0.55)` }}>
              Pod Size
            </label>
            <div className="flex items-center gap-1">
              {[2, 4, 6, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="flex-1 py-1.5 text-sm font-semibold text-center transition-all cursor-pointer"
                  style={{
                    ...(podSize === n ? TAB_ACTIVE : TAB_INACTIVE),
                    borderRadius: '6px',
                  }}
                  data-sound={UI.SELECT}
                  onClick={() => this.setState({ podSize: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Start Time — date/time pickers */}
          <div className="mb-3">
            <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1.5" style={{ color: `${GOLD} 0.55)` }}>
              Start Time
            </label>
            {/* Date row */}
            <div className="flex gap-2 mb-2">
              <div className="flex-1">
                <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: TEXT_MUTED }}>Month</div>
                <Select
                  portalMenu
                  ariaLabel="Month"
                  options={monthOptions}
                  value={String(month)}
                  onValueChange={(v) => {
                    const m = parseInt(v, 10);
                    const maxD = daysInMonth(year, m);
                    this.setState({ month: m, day: Math.min(day, maxD) });
                  }}
                />
              </div>
              <div style={{ width: 72 }}>
                <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: TEXT_MUTED }}>Day</div>
                <Select
                  portalMenu
                  ariaLabel="Day"
                  options={dayOptions}
                  value={String(day)}
                  onValueChange={(v) => this.setState({ day: parseInt(v, 10) })}
                />
              </div>
              <div style={{ width: 80 }}>
                <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: TEXT_MUTED }}>Year</div>
                <Select
                  portalMenu
                  ariaLabel="Year"
                  options={yearOptions}
                  value={String(year)}
                  onValueChange={(v) => this.setState({ year: parseInt(v, 10) })}
                />
              </div>
            </div>
            {/* Time row */}
            <div className="flex gap-2">
              <div style={{ width: 80 }}>
                <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: TEXT_MUTED }}>Hour</div>
                <Select
                  portalMenu
                  ariaLabel="Hour"
                  options={hourOptions}
                  value={String(hour)}
                  onValueChange={(v) => this.setState({ hour: parseInt(v, 10) })}
                />
              </div>
              <div className="flex items-end pb-1 text-lg font-bold" style={{ color: TEXT_MUTED }}>:</div>
              <div style={{ width: 80 }}>
                <div className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: TEXT_MUTED }}>Minute</div>
                <Select
                  portalMenu
                  ariaLabel="Minute"
                  options={minuteOptions}
                  value={String(minute)}
                  onValueChange={(v) => this.setState({ minute: parseInt(v, 10) })}
                />
              </div>
            </div>
          </div>

          {/* Visibility */}
          <div className="mb-4">
            <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1" style={{ color: `${GOLD} 0.55)` }}>
              Visibility
            </label>
            <Select
              portalMenu
              ariaLabel="Visibility"
              options={visibilityOptions}
              value={visibility}
              onValueChange={(v) => this.setState({ visibility: v })}
            />
          </div>

          {/* Friend invite picker */}
          {showFriendPicker ? (
            <div className="mb-4">
              <label className="text-[10px] font-semibold uppercase tracking-widest block mb-1" style={{ color: `${GOLD} 0.55)` }}>
                Invite Friends ({invitedFriends.length}/{podSize - 1})
              </label>
              {invitedFriends.length >= podSize - 1 ? (
                <div className="text-xs px-3 py-2 rounded" style={{ color: TEXT_MUTED, background: 'rgba(0,0,0,0.15)', border: `1px solid ${GOLD} 0.1)` }}>
                  Maximum players reached
                </div>
              ) : (
                <Select
                  portalMenu
                  ariaLabel="Invite friend"
                  options={this.getFilteredFriends()
                    .filter((f) => !invitedFriends.some((inv) => inv.id === f.id))
                    .map((f) => ({ value: f.id, label: f.name || 'Unknown' }))}
                  value=""
                  onValueChange={(friendId) => {
                    const friend = (this.props.friendListData?.friends || []).find((f) => f.id === friendId);
                    if (friend) this.toggleFriendInvite(friend);
                  }}
                  placeholder="Choose a friend to invite..."
                  searchable
                  menuSearchPlaceholder="Type to filter friends..."
                  noOptionsMessage="No friends available"
                />
              )}
              {invitedFriends.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {invitedFriends.map((friend) => (
                    <span
                      key={friend.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] cursor-pointer transition-colors"
                      style={{ background: 'rgba(212,168,67,0.12)', border: `1px solid ${GOLD} 0.25)`, color: ACCENT_GOLD }}
                      onClick={() => this.toggleFriendInvite(friend)}
                      title="Click to remove"
                    >
                      {friend.name}
                      <span style={{ color: TEXT_MUTED, fontSize: 9 }}>✕</span>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Entry cost info */}
          <div className="mb-3 px-3 py-2.5 rounded" style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${GOLD} 0.12)` }}>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: TEXT_MUTED }}>Entry cost (3 packs, 20% off)</span>
              <span className="flex items-center gap-1 text-sm font-semibold" style={{ color: COIN_COLOR }}>
                {DRAFT_ENTRY_COST}<CoinIcon size={13} />
              </span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs" style={{ color: TEXT_MUTED }}>Your balance</span>
              <span className="flex items-center gap-0.5 text-xs font-semibold" style={{ color: canAfford ? TEXT_BODY : '#e06060' }}>
                {playerCoins}<CoinIcon size={10} />
              </span>
            </div>
            {!canAfford ? (
              <div className="text-[10px] mt-1.5" style={{ color: '#e06060' }}>
                Not enough coins — you need {DRAFT_ENTRY_COST - playerCoins} more
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="text-sm mb-3 px-2 py-1 rounded" style={{ color: '#e06060', background: 'rgba(224,96,96,0.1)' }}>{error}</div>
          ) : null}

          <OrnamentalDivider className="mb-4" />

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              className="px-5 py-2 text-sm transition-all cursor-pointer"
              style={{ ...BEVELED_BTN, color: TEXT_BODY }}
              data-sound={UI.CANCEL}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="px-6 py-2 text-sm font-semibold transition-all cursor-pointer"
              style={{ ...(canAfford ? GOLD_BTN : BEVELED_BTN), opacity: canAfford ? 1 : 0.45 }}
              data-sound={UI.CONFIRM}
              disabled={submitting || !canAfford}
              onClick={this.handleSubmit}
            >
              {submitting ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
