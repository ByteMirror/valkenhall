import { Component } from 'preact';
import AppHeader from './AppHeader';
import CreateDraftModal from './CreateDraftModal';
import RuneSpinner from './RuneSpinner';
import { UI } from '../utils/arena/uiSounds';
import { BOOSTER_SETS } from '../utils/arena/packsApi';
import {
  listDraftEvents, createDraftEvent, joinDraftEvent, leaveDraftEvent, cancelDraftEvent, inviteToDraft,
  subscribeToDraftEvents, DRAFT_STATUS, DRAFT_VISIBILITY, DRAFT_ENTRY_COST,
} from '../utils/arena/draftApi';
import { CoinIcon } from './ui/icons';
import DraftLobby from './DraftLobby';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD, COIN_COLOR,
  VIGNETTE, BEVELED_BTN, GOLD_BTN, DANGER_BTN,
  PANEL_STYLE, TAB_ACTIVE, TAB_INACTIVE,
  CornerPlating,
  getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';
import AmbientParticles from './AmbientParticles';

const TABS = [
  { key: 'public', label: 'Public Events' },
  { key: 'guild', label: 'Guild Events' },
  { key: 'my', label: 'My Events' },
];

const STATUS_LABELS = {
  [DRAFT_STATUS.OPEN]: 'Open',
  [DRAFT_STATUS.DRAFTING]: 'Drafting',
  [DRAFT_STATUS.BUILDING]: 'Building',
  [DRAFT_STATUS.TOURNAMENT]: 'In Progress',
  [DRAFT_STATUS.COMPLETE]: 'Complete',
  [DRAFT_STATUS.CANCELLED]: 'Cancelled',
};

const STATUS_COLORS = {
  [DRAFT_STATUS.OPEN]: '#6dba6d',
  [DRAFT_STATUS.DRAFTING]: ACCENT_GOLD,
  [DRAFT_STATUS.BUILDING]: ACCENT_GOLD,
  [DRAFT_STATUS.TOURNAMENT]: '#d49243',
  [DRAFT_STATUS.COMPLETE]: TEXT_MUTED,
  [DRAFT_STATUS.CANCELLED]: '#c45050',
};

function formatEventTime(isoString) {
  const d = new Date(isoString);
  const now = new Date();
  const diffMs = d - now;
  if (diffMs < 0) return 'Started';
  if (diffMs < 60 * 1000) return 'Starting soon';
  if (diffMs < 60 * 60 * 1000) return `In ${Math.ceil(diffMs / 60000)}m`;
  if (diffMs < 24 * 60 * 60 * 1000) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default class DraftBrowser extends Component {
  constructor(props) {
    super(props);
    this.state = {
      tab: 'public',
      events: [],
      loading: true,
      error: null,
      showCreate: false,
      joiningId: null,
      lobbyEventId: null,
      viewScale: getViewportScale(),
    };
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
    this.unsubDraft = subscribeToDraftEvents({
      joined: () => this.loadEvents(),
      left: () => this.loadEvents(),
      cancelled: () => this.loadEvents(),
    });
    this.loadEvents();
    if (this.props.activeDraftEventId) {
      this.setState({ lobbyEventId: this.props.activeDraftEventId });
    }
  }

  componentDidUpdate(prevProps) {
    if (this.props.activeDraftEventId && this.props.activeDraftEventId !== prevProps.activeDraftEventId) {
      this.setState({ lobbyEventId: this.props.activeDraftEventId });
    }
  }

  componentWillUnmount() {
    this.unsubScale?.();
    this.unsubDraft?.();
  }

  loadEvents = async () => {
    this.setState({ loading: true, error: null });
    try {
      const events = await listDraftEvents();
      this.setState({ events: events || [], loading: false });
    } catch (err) {
      this.setState({ events: [], loading: false, error: err.message });
    }
  };

  handleCreate = async (params) => {
    const event = await createDraftEvent(params);
    if (params.invitePlayerIds?.length) {
      await inviteToDraft(event.id, params.invitePlayerIds);
    }
    this.setState({ showCreate: false, lobbyEventId: event.id });
    this.loadEvents();
    this.props.onDraftJoined?.(event.id);
  };

  handleJoin = async (eventId) => {
    this.setState({ joiningId: eventId });
    try {
      await joinDraftEvent(eventId);
      this.setState({ joiningId: null, lobbyEventId: eventId });
      this.props.onDraftJoined?.(eventId);
    } catch (err) {
      this.setState({ joiningId: null });
      console.error('[DraftBrowser] join failed:', err);
    }
  };

  openLobby = (eventId) => {
    this.setState({ lobbyEventId: eventId });
  };

  closeLobby = () => {
    this.setState({ lobbyEventId: null });
  };

  handleLeave = async (eventId) => {
    try {
      await leaveDraftEvent(eventId);
      this.loadEvents();
    } catch (err) {
      console.error('[DraftBrowser] leave failed:', err);
    }
  };

  handleCancel = async (eventId) => {
    try {
      await cancelDraftEvent(eventId);
      this.loadEvents();
    } catch (err) {
      console.error('[DraftBrowser] cancel failed:', err);
    }
  };

  getFilteredEvents() {
    const { tab, events } = this.state;
    const { profile, guildId } = this.props;
    if (!events) return [];

    switch (tab) {
      case 'public':
        return events.filter((e) => e.visibility === DRAFT_VISIBILITY.PUBLIC && e.status === DRAFT_STATUS.OPEN);
      case 'guild':
        return events.filter((e) => e.visibility === DRAFT_VISIBILITY.GUILD && e.guildId === guildId);
      case 'my':
        return events.filter((e) =>
          e.creatorId === profile?.id ||
          e.participants?.some((p) => p.playerId === profile?.id)
        );
      default:
        return events;
    }
  }

  render() {
    const { profile, onBack, onToggleMailbox, mailboxUnreadCount, mailboxDropdown, onToggleFriends, friendListData, guildId } = this.props;
    const { tab, loading, error, showCreate, joiningId, viewScale } = this.state;
    const filtered = this.getFilteredEvents();
    const emptyMessages = { public: 'No open public events', guild: 'No guild events', my: 'You haven\'t joined any events' };

    return (
      <div className="fixed inset-0 z-50 flex flex-col overflow-hidden select-none" style={{ background: '#08080a' }}>
        <div className="absolute inset-0" style={{ background: `url('/hub-bg.png') center/cover no-repeat`, filter: 'blur(3px)', transform: 'scale(1.02)' }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0.4) 70%, rgba(0,0,0,0.7) 100%)' }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: VIGNETTE }} />
        <AmbientParticles />

        <AppHeader
          profile={profile}
          onToggleMailbox={onToggleMailbox}
          mailboxUnreadCount={mailboxUnreadCount}
          mailboxDropdown={mailboxDropdown}
          onToggleFriends={onToggleFriends}
          friendListData={friendListData}
          draftQueueDropdown={this.props.draftQueueDropdown}
          zoom={viewScale}
        >
          <button
            type="button"
            data-sound={UI.CANCEL}
            className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
            style={{ ...BEVELED_BTN, color: TEXT_BODY }}
            onClick={onBack}
          >
            &#8592; Back
          </button>
        </AppHeader>

        <div className="relative z-10 flex-1 flex flex-col overflow-hidden px-8 py-4" style={{ zoom: viewScale }}>
          {/* Title bar */}
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold arena-heading" style={{ color: ACCENT_GOLD, textShadow: '0 2px 4px rgba(0,0,0,0.5), 0 0 20px rgba(200,160,60,0.15)' }}>
              Draft Events
            </h1>
            <button
              type="button"
              className="px-5 py-2 text-sm font-semibold transition-all cursor-pointer"
              style={GOLD_BTN}
              data-sound={UI.CONFIRM}
              onClick={() => this.setState({ showCreate: true })}
            >
              + Create Event
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-4">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className="px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer"
                style={tab === t.key ? TAB_ACTIVE : TAB_INACTIVE}
                data-sound={UI.TAB}
                onClick={() => this.setState({ tab: t.key })}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Event list */}
          <div className="flex-1 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: `${GOLD} 0.2) transparent` }}>
            {loading ? (
              <div className="flex justify-center items-center py-16">
                <RuneSpinner size={48} />
              </div>
            ) : error ? (
              <div className="text-center py-16 text-sm" style={{ color: '#c45050' }}>{error}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-sm mb-2" style={{ color: TEXT_MUTED }}>
                  {emptyMessages[tab] || 'No events found'}
                </div>
                <div className="text-xs" style={{ color: TEXT_MUTED }}>Create one to get started!</div>
              </div>
            ) : (
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
                {filtered.map((event) => this.renderEventCard(event, joiningId))}
              </div>
            )}
          </div>
        </div>

        {showCreate ? (
          <CreateDraftModal
            profile={profile}
            guildId={guildId}
            friendListData={friendListData}
            onCreate={this.handleCreate}
            onClose={() => this.setState({ showCreate: false })}
          />
        ) : null}

        {this.state.lobbyEventId ? (
          <DraftLobby
            eventId={this.state.lobbyEventId}
            profile={profile}
            sorceryCards={this.props.sorceryCards}
            friendListData={friendListData}
            onClose={this.closeLobby}
            onLeft={() => { this.closeLobby(); this.loadEvents(); this.props.onDraftLeft?.(); }}
            onCancelled={() => { this.closeLobby(); this.loadEvents(); this.props.onDraftCancelled?.(); }}
            onDraftStarted={this.props.onDraftStarted}
          />
        ) : null}
      </div>
    );
  }

  renderEventCard(event, joiningId) {
    const { profile } = this.props;
    const isJoined = event.participants?.some((p) => p.playerId === profile?.id);
    const isFull = (event.participants?.length || 0) >= event.podSize;
    const entryCost = event.entryCost || DRAFT_ENTRY_COST;
    const canAfford = (profile?.coins || 0) >= entryCost;
    const canJoin = !isJoined && !isFull && event.status === DRAFT_STATUS.OPEN;
    const joining = joiningId === event.id;
    const setLabel = BOOSTER_SETS[event.setKey]?.label || event.setKey;

    return (
      <div
        key={event.id}
        className="relative p-4 rounded transition-all"
        style={{
          ...PANEL_STYLE,
          cursor: isJoined ? 'pointer' : 'default',
        }}
        onClick={isJoined ? () => this.props.onOpenDraftLobby?.(event.id) : undefined}
      >
        <CornerPlating position="top-left" />
        <CornerPlating position="top-right" />
        <CornerPlating position="bottom-left" />
        <CornerPlating position="bottom-right" />

        <div className="flex items-start justify-between mb-2">
          <div>
            <div className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>{setLabel} Draft</div>
            <div className="text-xs" style={{ color: TEXT_MUTED }}>by {event.creatorName || 'Unknown'}</div>
          </div>
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
            style={{ color: STATUS_COLORS[event.status] || TEXT_MUTED, background: 'rgba(0,0,0,0.3)' }}
          >
            {STATUS_LABELS[event.status] || event.status}
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs mb-3" style={{ color: TEXT_BODY }}>
          <span>{formatEventTime(event.scheduledAt)}</span>
          <span>{event.participants?.length || 0}/{event.podSize} players</span>
          <span className="flex items-center gap-0.5" style={{ color: COIN_COLOR }}>{entryCost}<CoinIcon size={10} /></span>
        </div>

        {canJoin ? (
          <button
            type="button"
            className="w-full py-1.5 text-xs font-semibold transition-all rounded"
            style={{
              ...(canAfford ? GOLD_BTN : BEVELED_BTN),
              opacity: canAfford ? 1 : 0.45,
              cursor: canAfford ? 'pointer' : 'not-allowed',
            }}
            data-sound={canAfford ? UI.CONFIRM : undefined}
            disabled={joining || !canAfford}
            onClick={(e) => { e.stopPropagation(); this.handleJoin(event.id); }}
            title={canAfford ? undefined : `You need ${entryCost} coins to join`}
          >
            {joining ? 'Joining...' : canAfford ? `Join Draft · ${entryCost}` : `Need ${entryCost} coins`}
            {!joining ? <CoinIcon size={11} /> : null}
          </button>
        ) : isJoined && event.status === DRAFT_STATUS.OPEN ? (
          <div className="flex gap-2 mt-1">
            <button
              type="button"
              className="flex-1 py-1.5 text-xs font-semibold transition-all cursor-pointer rounded"
              style={GOLD_BTN}
              data-sound={UI.CONFIRM}
              onClick={(e) => { e.stopPropagation(); this.openLobby(event.id); }}
            >
              Open Lobby
            </button>
            {event.creatorId === profile?.id ? (
              <button
                type="button"
                className="py-1.5 px-3 text-xs transition-all cursor-pointer rounded"
                style={DANGER_BTN}
                data-sound={UI.CANCEL}
                onClick={(e) => { e.stopPropagation(); this.handleCancel(event.id); }}
              >
                Cancel
              </button>
            ) : (
              <button
                type="button"
                className="py-1.5 px-3 text-xs transition-all cursor-pointer rounded"
                style={{ ...BEVELED_BTN, color: TEXT_BODY }}
                data-sound={UI.CANCEL}
                onClick={(e) => { e.stopPropagation(); this.handleLeave(event.id); }}
              >
                Leave
              </button>
            )}
          </div>
        ) : null}
      </div>
    );
  }
}
