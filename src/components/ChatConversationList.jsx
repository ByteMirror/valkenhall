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

    // Merge online status from presence data
    const onlineMap = new Map();
    if (friendListData?.friends) {
      for (const f of friendListData.friends) {
        onlineMap.set(f.id, f.online);
      }
    }

    if (conversations.length === 0) {
      return (
        <div className="text-center py-12">
          <p className="text-xs" style={{ color: TEXT_MUTED }}>No conversations yet</p>
          <p className="text-[10px] mt-1" style={{ color: TEXT_MUTED }}>
            Open a friend's profile and start chatting
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col">
        {conversations.map((conv) => {
          const online = onlineMap.get(conv.friendId) ?? false;
          const lastMsg = conv.lastMessage;
          const isSentByMe = lastMsg?.senderId !== conv.friendId;
          let preview = '';
          if (lastMsg?.type === 'draft-invite') preview = 'Draft invite';
          else if (lastMsg?.type === 'attachment') preview = 'Sent an attachment';
          else preview = truncate(lastMsg?.body);
          if (isSentByMe && preview) preview = `You: ${preview}`;

          return (
            <button
              key={conv.friendId}
              type="button"
              className="flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-all text-left w-full"
              style={{ borderBottom: `1px solid ${GOLD} 0.06)` }}
              onMouseEnter={(e) => { e.currentTarget.style.background = `${GOLD} 0.04)`; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              onClick={() => onSelectFriend({
                friendId: conv.friendId,
                friendName: conv.friendName,
                friendAvatar: conv.friendAvatar,
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
                  {(conv.friendName || '?')[0].toUpperCase()}
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
                    style={{ color: conv.unreadCount > 0 ? TEXT_PRIMARY : TEXT_BODY }}
                  >
                    {conv.friendName || 'Unknown'}
                  </span>
                  <span className="text-[10px] shrink-0 ml-2" style={{ color: TEXT_MUTED }}>
                    {timeAgo(lastMsg?.createdAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span
                    className="text-[11px] truncate"
                    style={{ color: conv.unreadCount > 0 ? TEXT_BODY : TEXT_MUTED }}
                  >
                    {preview || 'No messages'}
                  </span>
                  {conv.unreadCount > 0 && (
                    <span
                      className="shrink-0 ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                      style={{
                        background: ACCENT_GOLD,
                        color: '#0e0a06',
                        minWidth: '18px',
                        textAlign: 'center',
                      }}
                    >
                      {conv.unreadCount}
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
