import { Component } from 'preact';
import AppHeader from './AppHeader';
import { UI } from '../utils/arena/uiSounds';
import {
  getGuild, getMyGuild, createGuild, leaveGuild, disbandGuild,
  inviteToGuild, kickFromGuild, changeGuildRole,
  getGuildMessages, sendGuildMessage,
  subscribeToGuildEvents, GUILD_ROLES,
} from '../utils/arena/guildApi';
import { listDraftEvents, DRAFT_STATUS } from '../utils/arena/draftApi';
import { BOOSTER_SETS } from '../utils/arena/packsApi';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD,
  BG_ATMOSPHERE, VIGNETTE, PANEL_STYLE,
  BEVELED_BTN, GOLD_BTN, DANGER_BTN, INPUT_STYLE,
  TAB_ACTIVE, TAB_INACTIVE, DIALOG_STYLE,
  FourCorners, OrnamentalDivider,
  getViewportScale, onViewportScaleChange,
} from '../lib/medievalTheme';
import AmbientParticles from './AmbientParticles';

const ROLE_LABELS = {
  [GUILD_ROLES.LEADER]: 'Leader',
  [GUILD_ROLES.OFFICER]: 'Officer',
  [GUILD_ROLES.MEMBER]: 'Member',
};

const ROLE_COLORS = {
  [GUILD_ROLES.LEADER]: ACCENT_GOLD,
  [GUILD_ROLES.OFFICER]: '#4898e0',
  [GUILD_ROLES.MEMBER]: TEXT_BODY,
};

export default class GuildPanel extends Component {
  constructor(props) {
    super(props);
    this.state = {
      guild: null,
      loading: true,
      error: null,
      tab: 'chat',
      // Chat
      messages: [],
      chatInput: '',
      chatLoading: false,
      // Create guild
      showCreate: false,
      createName: '',
      creating: false,
      createError: null,
      // Invite
      showInvite: false,
      inviteSearch: '',
      inviting: false,
      // Events
      guildEvents: [],
      eventsLoading: false,
      viewScale: getViewportScale(),
    };
    this.chatBottomRef = null;
  }

  componentDidMount() {
    this.unsubScale = onViewportScaleChange((scale) => this.setState({ viewScale: scale }));
    this.loadGuild();
  }

  componentWillUnmount() {
    this.unsubScale?.();
    this.unsubGuild?.();
  }

  loadGuild = async () => {
    this.setState({ loading: true, error: null });
    try {
      const data = await getMyGuild();
      if (data?.guild) {
        this.setState({ guild: data.guild, loading: false });
        this.subscribeGuild(data.guild.id);
        this.loadMessages(data.guild.id);
        this.loadGuildEvents(data.guild.id);
      } else {
        this.setState({ guild: null, loading: false });
      }
    } catch (err) {
      this.setState({ guild: null, loading: false, error: err.message });
    }
  };

  subscribeGuild(guildId) {
    this.unsubGuild?.();
    this.unsubGuild = subscribeToGuildEvents({
      message: (data) => {
        this.setState((s) => ({
          messages: [...s.messages, data],
        }));
        this.scrollChatBottom();
      },
      member_joined: () => this.reloadGuildInfo(),
      member_left: () => this.reloadGuildInfo(),
      role_changed: () => this.reloadGuildInfo(),
      disbanded: () => {
        this.setState({ guild: null });
        this.unsubGuild?.();
      },
    });
  }

  reloadGuildInfo = async () => {
    const { guild } = this.state;
    if (!guild) return;
    try {
      const data = await getGuild(guild.id);
      this.setState({ guild: data });
    } catch {}
  };

  loadMessages = async (guildId) => {
    this.setState({ chatLoading: true });
    try {
      const data = await getGuildMessages(guildId);
      this.setState({ messages: data.messages || [], chatLoading: false });
      this.scrollChatBottom();
    } catch (err) {
      this.setState({ chatLoading: false });
    }
  };

  loadGuildEvents = async (guildId) => {
    this.setState({ eventsLoading: true });
    try {
      const events = await listDraftEvents({ visibility: 'guild' });
      const guildEvents = (events || []).filter((e) => e.guildId === guildId);
      this.setState({ guildEvents, eventsLoading: false });
    } catch {
      this.setState({ eventsLoading: false });
    }
  };

  scrollChatBottom() {
    setTimeout(() => {
      this.chatBottomRef?.scrollIntoView?.({ behavior: 'smooth' });
    }, 50);
  }

  handleSendMessage = async () => {
    const { guild, chatInput } = this.state;
    if (!guild || !chatInput.trim()) return;
    const text = chatInput.trim();
    this.setState({ chatInput: '' });
    try {
      await sendGuildMessage(guild.id, text);
    } catch (err) {
      console.error('[GuildPanel] send message failed:', err);
    }
  };

  handleCreateGuild = async () => {
    const { createName } = this.state;
    if (!createName.trim() || createName.trim().length < 3) {
      this.setState({ createError: 'Name must be at least 3 characters' });
      return;
    }
    this.setState({ creating: true, createError: null });
    try {
      await createGuild(createName.trim());
      this.setState({ showCreate: false, creating: false, createName: '' });
      this.loadGuild();
    } catch (err) {
      this.setState({ creating: false, createError: err.message });
    }
  };

  handleLeave = async () => {
    const { guild } = this.state;
    if (!guild) return;
    if (!confirm('Are you sure you want to leave this guild?')) return;
    try {
      await leaveGuild(guild.id);
      this.setState({ guild: null });
      this.unsubGuild?.();
    } catch (err) {
      console.error('[GuildPanel] leave failed:', err);
    }
  };

  handleDisband = async () => {
    const { guild } = this.state;
    if (!guild) return;
    if (!confirm(`Disband "${guild.name}"? This cannot be undone.`)) return;
    try {
      await disbandGuild(guild.id);
      this.setState({ guild: null });
      this.unsubGuild?.();
    } catch (err) {
      console.error('[GuildPanel] disband failed:', err);
    }
  };

  handleInvite = async (friendId) => {
    const { guild } = this.state;
    if (!guild) return;
    this.setState({ inviting: true });
    try {
      await inviteToGuild(guild.id, friendId);
      this.setState({ inviting: false });
    } catch (err) {
      this.setState({ inviting: false });
      console.error('[GuildPanel] invite failed:', err);
    }
  };

  handleKick = async (playerId) => {
    const { guild } = this.state;
    if (!guild || !confirm('Remove this member?')) return;
    try {
      await kickFromGuild(guild.id, playerId);
      this.reloadGuildInfo();
    } catch (err) {
      console.error('[GuildPanel] kick failed:', err);
    }
  };

  handlePromote = async (playerId) => {
    const { guild } = this.state;
    if (!guild) return;
    try {
      await changeGuildRole(guild.id, playerId, GUILD_ROLES.OFFICER);
      this.reloadGuildInfo();
    } catch (err) {
      console.error('[GuildPanel] promote failed:', err);
    }
  };

  handleDemote = async (playerId) => {
    const { guild } = this.state;
    if (!guild) return;
    try {
      await changeGuildRole(guild.id, playerId, GUILD_ROLES.MEMBER);
      this.reloadGuildInfo();
    } catch (err) {
      console.error('[GuildPanel] demote failed:', err);
    }
  };

  getMyRole() {
    const { guild } = this.state;
    const { profile } = this.props;
    if (!guild || !profile) return null;
    const member = guild.members?.find((m) => m.playerId === profile.id);
    return member?.role || null;
  }

  getFilteredFriends() {
    const { friendListData } = this.props;
    const { guild, inviteSearch } = this.state;
    const friends = friendListData?.friends || [];
    const memberIds = new Set((guild?.members || []).map((m) => m.playerId));
    const available = friends.filter((f) => !memberIds.has(f.id));
    const q = inviteSearch.toLowerCase().trim();
    if (!q) return available;
    return available.filter((f) => f.name.toLowerCase().includes(q));
  }

  render() {
    const { profile, onBack, onToggleMailbox, mailboxUnreadCount, mailboxDropdown, onToggleFriends, friendListData, onOpenDraftBrowser, onOpenGuildLeaderboard } = this.props;
    const { guild, loading, error, showCreate, tab, viewScale } = this.state;

    if (loading) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: BG_ATMOSPHERE }}>
          <div className="text-sm" style={{ color: TEXT_MUTED }}>Loading guild...</div>
        </div>
      );
    }

    // No guild — show create/join prompt
    if (!guild) {
      return this.renderNoGuild();
    }

    const myRole = this.getMyRole();
    const isLeader = myRole === GUILD_ROLES.LEADER;
    const isOfficer = myRole === GUILD_ROLES.OFFICER || isLeader;

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
        />

        <div className="relative z-10 flex-1 flex flex-col overflow-hidden px-8 py-4" style={{ zoom: viewScale }}>
          {/* Title bar */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              <button type="button" className="px-4 py-1.5 text-sm transition-all cursor-pointer" style={{ ...BEVELED_BTN, color: TEXT_BODY }} data-sound={UI.CLOSE} onClick={onBack}>← Back</button>
              <h1 className="text-2xl font-bold arena-heading" style={{ color: ACCENT_GOLD, textShadow: '0 2px 4px rgba(0,0,0,0.5), 0 0 20px rgba(200,160,60,0.15)' }}>
                {guild.name}
              </h1>
              <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded" style={{ color: ROLE_COLORS[myRole], background: 'rgba(0,0,0,0.3)' }}>
                {ROLE_LABELS[myRole]}
              </span>
            </div>
            <div className="flex gap-2">
              {onOpenGuildLeaderboard ? (
                <button type="button" className="px-4 py-1.5 text-xs transition-all cursor-pointer" style={{ ...BEVELED_BTN, color: TEXT_BODY }} data-sound={UI.TAB} onClick={onOpenGuildLeaderboard}>
                  Leaderboard
                </button>
              ) : null}
              {isOfficer ? (
                <button type="button" className="px-4 py-1.5 text-xs transition-all cursor-pointer" style={{ ...BEVELED_BTN, color: TEXT_BODY }} data-sound={UI.TAB} onClick={() => this.setState({ showInvite: !this.state.showInvite })}>
                  Invite
                </button>
              ) : null}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-3">
            {[
              { key: 'chat', label: 'Chat' },
              { key: 'members', label: `Members (${guild.members?.length || 0})` },
              { key: 'events', label: 'Events' },
            ].map((t) => (
              <button key={t.key} type="button" className="px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer" style={tab === t.key ? TAB_ACTIVE : TAB_INACTIVE} data-sound={UI.TAB} onClick={() => this.setState({ tab: t.key })}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex">
            {tab === 'chat' ? this.renderChat() : null}
            {tab === 'members' ? this.renderMembers(isLeader, isOfficer) : null}
            {tab === 'events' ? this.renderEvents(isOfficer) : null}
          </div>

          {/* Invite panel overlay */}
          {this.state.showInvite ? this.renderInvitePanel() : null}

          {/* Guild admin actions */}
          <div className="mt-3 flex gap-2 justify-end">
            <button type="button" className="px-4 py-1.5 text-xs cursor-pointer" style={DANGER_BTN} data-sound={UI.CANCEL} onClick={this.handleLeave}>Leave Guild</button>
            {isLeader ? (
              <button type="button" className="px-4 py-1.5 text-xs cursor-pointer" style={DANGER_BTN} data-sound={UI.CANCEL} onClick={this.handleDisband}>Disband</button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  renderNoGuild() {
    const { onBack } = this.props;
    const { showCreate, createName, creating, createError, viewScale } = this.state;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: BG_ATMOSPHERE }}>
        <div className="fixed inset-0 pointer-events-none" style={{ background: VIGNETTE }} />
        <AmbientParticles />
        <div className="relative text-center p-8 w-full max-w-md" style={{ ...DIALOG_STYLE, zoom: viewScale }}>
          <FourCorners radius={12} knots />
          <h2 className="text-xl font-bold arena-heading mb-2" style={{ color: ACCENT_GOLD, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>No Guild</h2>
          <div className="text-sm mb-5" style={{ color: TEXT_BODY }}>
            You're not in a guild yet. Create one or ask a friend to invite you.
          </div>
          <OrnamentalDivider className="mb-4" />

          {showCreate ? (
            <div className="mb-4">
              <input
                type="text"
                placeholder="Guild name (3–30 characters)"
                value={createName}
                maxLength={30}
                onChange={(e) => this.setState({ createName: e.target.value })}
                style={{ ...INPUT_STYLE, width: '100%', marginBottom: 8 }}
              />
              {createError ? <div className="text-xs mb-2" style={{ color: '#e06060' }}>{createError}</div> : null}
              <div className="flex gap-2 justify-center">
                <button type="button" className="px-4 py-1.5 text-xs cursor-pointer" style={{ ...BEVELED_BTN, color: TEXT_BODY }} onClick={() => this.setState({ showCreate: false })}>Cancel</button>
                <button type="button" className="px-4 py-1.5 text-xs font-semibold cursor-pointer" style={GOLD_BTN} disabled={creating} onClick={this.handleCreateGuild}>
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="px-6 py-2 text-sm font-semibold cursor-pointer mb-3" style={GOLD_BTN} data-sound={UI.CONFIRM} onClick={() => this.setState({ showCreate: true })}>
              Create Guild
            </button>
          )}

          <div className="mt-3">
            <button type="button" className="px-5 py-1.5 text-sm cursor-pointer" style={{ ...BEVELED_BTN, color: TEXT_BODY }} data-sound={UI.CLOSE} onClick={onBack}>Back</button>
          </div>
        </div>
      </div>
    );
  }

  renderChat() {
    const { messages, chatInput, chatLoading } = this.state;
    const { profile } = this.props;

    return (
      <div className="flex-1 flex flex-col rounded overflow-hidden" style={PANEL_STYLE}>
        <div className="flex-1 overflow-y-auto p-3 space-y-1" style={{ scrollbarWidth: 'thin' }}>
          {chatLoading ? (
            <div className="text-xs text-center py-4" style={{ color: TEXT_MUTED }}>Loading messages...</div>
          ) : messages.length === 0 ? (
            <div className="text-xs text-center py-4" style={{ color: TEXT_MUTED }}>No messages yet. Say hello!</div>
          ) : (
            messages.map((msg, i) => {
              const isMe = msg.senderId === profile?.id;
              return (
                <div key={msg.id || i} className="flex gap-2 text-xs px-1">
                  <span className="font-semibold shrink-0" style={{ color: isMe ? ACCENT_GOLD : TEXT_PRIMARY }}>{msg.senderName || 'Unknown'}</span>
                  <span style={{ color: TEXT_BODY }}>{msg.body}</span>
                  <span className="ml-auto shrink-0 tabular-nums" style={{ color: TEXT_MUTED, fontSize: '9px' }}>
                    {msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
              );
            })
          )}
          <div ref={(el) => { this.chatBottomRef = el; }} />
        </div>
        <div className="flex gap-2 p-2" style={{ borderTop: `1px solid ${GOLD} 0.1)` }}>
          <input
            type="text"
            placeholder="Type a message..."
            value={chatInput}
            onChange={(e) => this.setState({ chatInput: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') this.handleSendMessage(); }}
            style={{ ...INPUT_STYLE, flex: 1 }}
          />
          <button
            type="button"
            className="px-3 py-1 text-xs font-semibold cursor-pointer"
            style={GOLD_BTN}
            onClick={this.handleSendMessage}
          >
            Send
          </button>
        </div>
      </div>
    );
  }

  renderMembers(isLeader, isOfficer) {
    const { guild } = this.state;
    const { profile } = this.props;
    const members = guild?.members || [];

    const sorted = [...members].sort((a, b) => {
      const order = { leader: 0, officer: 1, member: 2 };
      return (order[a.role] ?? 3) - (order[b.role] ?? 3);
    });

    return (
      <div className="flex-1 overflow-y-auto rounded" style={PANEL_STYLE}>
        <div className="divide-y" style={{ borderColor: `${GOLD} 0.06)` }}>
          {sorted.map((member) => {
            const isMe = member.playerId === profile?.id;
            return (
              <div key={member.playerId} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold" style={{ color: isMe ? ACCENT_GOLD : TEXT_PRIMARY }}>
                    {member.playerName || member.playerId}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: ROLE_COLORS[member.role] }}>
                    {ROLE_LABELS[member.role]}
                  </span>
                </div>
                {!isMe ? (
                  <div className="flex gap-1">
                    {isLeader && member.role === GUILD_ROLES.MEMBER ? (
                      <button type="button" className="text-[10px] px-2 py-0.5 rounded cursor-pointer" style={{ color: '#4898e0', background: 'rgba(72,152,224,0.1)' }} onClick={() => this.handlePromote(member.playerId)}>Promote</button>
                    ) : null}
                    {isLeader && member.role === GUILD_ROLES.OFFICER ? (
                      <button type="button" className="text-[10px] px-2 py-0.5 rounded cursor-pointer" style={{ color: TEXT_MUTED, background: 'rgba(255,255,255,0.05)' }} onClick={() => this.handleDemote(member.playerId)}>Demote</button>
                    ) : null}
                    {isOfficer && member.role === GUILD_ROLES.MEMBER ? (
                      <button type="button" className="text-[10px] px-2 py-0.5 rounded cursor-pointer" style={{ color: '#c45050', background: 'rgba(196,80,80,0.1)' }} onClick={() => this.handleKick(member.playerId)}>Kick</button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  renderEvents(isOfficer) {
    const { guildEvents, eventsLoading } = this.state;
    const { onOpenDraftBrowser } = this.props;

    return (
      <div className="flex-1 overflow-y-auto rounded" style={PANEL_STYLE}>
        <div className="p-3">
          {isOfficer ? (
            <div className="mb-3">
              <button type="button" className="px-4 py-1.5 text-xs font-semibold cursor-pointer" style={GOLD_BTN} data-sound={UI.CONFIRM} onClick={onOpenDraftBrowser}>
                Create Guild Draft
              </button>
            </div>
          ) : null}
          {eventsLoading ? (
            <div className="text-xs text-center py-4" style={{ color: TEXT_MUTED }}>Loading events...</div>
          ) : guildEvents.length === 0 ? (
            <div className="text-xs text-center py-4" style={{ color: TEXT_MUTED }}>No guild events yet</div>
          ) : (
            <div className="space-y-2">
              {guildEvents.map((event) => (
                <div key={event.id} className="flex items-center justify-between px-3 py-2 rounded" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${GOLD} 0.08)` }}>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>{BOOSTER_SETS[event.setKey]?.label || event.setKey} Draft</div>
                    <div className="text-[10px]" style={{ color: TEXT_MUTED }}>{new Date(event.scheduledAt).toLocaleString()} — {event.participants?.length || 0}/{event.podSize}</div>
                  </div>
                  <span className="text-[10px] uppercase font-bold" style={{ color: event.status === DRAFT_STATUS.OPEN ? '#6dba6d' : TEXT_MUTED }}>
                    {event.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  renderInvitePanel() {
    const filteredFriends = this.getFilteredFriends();
    return (
      <div className="absolute top-16 right-8 w-64 p-3 rounded z-50" style={DIALOG_STYLE}>
        <div className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: TEXT_MUTED }}>Invite to Guild</div>
        <input
          type="text"
          placeholder="Search friends..."
          value={this.state.inviteSearch}
          onChange={(e) => this.setState({ inviteSearch: e.target.value })}
          style={{ ...INPUT_STYLE, width: '100%', marginBottom: 6 }}
        />
        <div className="max-h-40 overflow-y-auto space-y-1">
          {filteredFriends.length === 0 ? (
            <div className="text-[10px] text-center py-2" style={{ color: TEXT_MUTED }}>No friends to invite</div>
          ) : filteredFriends.map((friend) => (
            <div key={friend.id} className="flex items-center justify-between px-1 py-1">
              <span className="text-xs" style={{ color: TEXT_BODY }}>{friend.name}</span>
              <button type="button" className="text-[10px] px-2 py-0.5 rounded cursor-pointer" style={{ color: ACCENT_GOLD, background: 'rgba(212,168,67,0.1)' }} disabled={this.state.inviting} onClick={() => this.handleInvite(friend.id)}>
                Invite
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }
}
