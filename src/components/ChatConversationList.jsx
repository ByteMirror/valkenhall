import { Component } from 'preact';
import RuneSpinner from './RuneSpinner';
import { fetchConversations } from '../utils/arena/chatApi';
import {
  GOLD, TEXT_PRIMARY, TEXT_BODY, TEXT_MUTED, ACCENT_GOLD,
} from '../lib/medievalTheme';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function truncate(text, len = 40) {
  if (!text) return '';
  return text.length > len ? text.slice(0, len) + '...' : text;
}

export default class ChatConversationList extends Component {
  constructor(props) {
    super(props);
    this.state = { conversations: [], loading: true };
  }

  componentDidMount() {
    this.loadConversations();
  }

  loadConversations = async () => {
    try {
      const conversations = await fetchConversations();
      this.setState({ conversations, loading: false });
    } catch (err) {
      console.error('[ChatConversationList] Failed to load:', err);
      this.setState({ loading: false });
    }
  };

  // Called by Mailbox when a chat:message arrives for the list view
  refresh = () => this.loadConversations();

  render() {
    const { onSelectFriend, friendListData } = this.props;
    const { conversations, loading } = this.state;

    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <RuneSpinner size={28} />
        </div>
      );
    }

    // Build a unified list: friends with conversation history first
    // (sorted by most recent message), then remaining friends without
    // history (sorted by online status, then name). This lets users
    // start chatting with ANY friend directly from this list.
    const friends = friendListData?.friends || [];
    const convMap = new Map();
    for (const conv of conversations) convMap.set(conv.friendId, conv);

    const entries = [];

    // Friends with conversations — sorted by most recent message (server order)
    for (const conv of conversations) {
      const friend = friends.find((f) => f.id === conv.friendId);
      const online = friend?.online ?? false;
      const lastMsg = conv.lastMessage;
      const isSentByMe = lastMsg?.senderId !== conv.friendId;
      let preview = '';
      if (lastMsg?.type === 'draft-invite') preview = 'Draft invite';
      else if (lastMsg?.type === 'attachment') preview = 'Sent an attachment';
      else preview = truncate(lastMsg?.body);
      if (isSentByMe && preview) preview = `You: ${preview}`;

      entries.push({
        friendId: conv.friendId,
        friendName: conv.friendName || friend?.name || 'Unknown',
        friendAvatar: conv.friendAvatar || friend?.profileAvatar,
        online,
        lastMsg,
        preview,
        unreadCount: conv.unreadCount || 0,
        hasHistory: true,
      });
    }

    // Friends without conversations
    for (const f of friends) {
      if (convMap.has(f.id)) continue;
      entries.push({
        friendId: f.id,
        friendName: f.name || 'Unknown',
        friendAvatar: f.profileAvatar,
        online: f.online ?? false,
        lastMsg: null,
        preview: '',
        unreadCount: 0,
        hasHistory: false,
      });
    }

    // Sort no-history friends: online first, then alphabetical
    const withHistory = entries.filter((e) => e.hasHistory);
    const withoutHistory = entries.filter((e) => !e.hasHistory)
      .sort((a, b) => (b.online - a.online) || (a.friendName || '').localeCompare(b.friendName || ''));
    const sorted = [...withHistory, ...withoutHistory];

    if (sorted.length === 0) {
      return (
        <div className="text-center py-12">
          <p className="text-xs" style={{ color: TEXT_MUTED }}>No friends yet</p>
          <p className="text-[10px] mt-1" style={{ color: TEXT_MUTED }}>
            Add friends to start chatting
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col">
        {sorted.map((entry) => {
          const { friendId, friendName, friendAvatar, online, lastMsg, preview, unreadCount } = entry;

          return (
            <button
              key={conv.friendId}
              type="button"
              className="flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-all text-left w-full"
              style={{ borderBottom: `1px solid ${GOLD} 0.06)` }}
              onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.04)`; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              onClick={() => onSelectFriend({
                friendId,
                friendName,
                friendAvatar,
                online,
              })}
            >
              {/* Avatar */}
              <div className="relative shrink-0">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{
                    background: `${GOLD} 0.1)`,
                    border: `1px solid ${GOLD} 0.2)`,
                    color: TEXT_PRIMARY,
                  }}
                >
                  {(friendName || '?')[0].toUpperCase()}
                </div>
                {online && (
                  <div
                    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full"
                    style={{
                      background: '#4ade80',
                      border: '2px solid #0e0a06',
                    }}
                  />
                )}
              </div>

              {/* Name + preview */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs font-medium truncate"
                    style={{ color: unreadCount > 0 ? TEXT_PRIMARY : TEXT_BODY }}
                  >
                    {friendName}
                  </span>
                  <span className="text-[10px] shrink-0 ml-2" style={{ color: TEXT_MUTED }}>
                    {timeAgo(lastMsg?.createdAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span
                    className="text-[11px] truncate"
                    style={{ color: unreadCount > 0 ? TEXT_BODY : TEXT_MUTED }}
                  >
                    {preview || 'Start a conversation'}
                  </span>
                  {unreadCount > 0 && (
                    <span
                      className="shrink-0 ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                      style={{
                        background: ACCENT_GOLD,
                        color: '#0e0a06',
                        minWidth: '18px',
                        textAlign: 'center',
                      }}
                    >
                      {unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  }
}
