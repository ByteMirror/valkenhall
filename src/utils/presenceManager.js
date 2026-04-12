import { connectWebSocket, disconnectWebSocket, on } from './serverClient';
import { getFriendList } from './friendsApi';
import { getUnreadCount } from './arena/mailApi';

// Friend metadata (avatar, name, rank…) is only refreshed by hitting `/friends`.
// 30s gives sub-minute eventual consistency for things like avatar swaps without
// being noisy — the focus + sidebar-open triggers handle "right now" cases.
const FRIEND_REFRESH_INTERVAL_MS = 30_000;

let currentActivity = 'hub';
let currentActivityData = null;
let onFriendListUpdate = null;
let onNewNotifications = null;
let onMailCountUpdate = null;
let onChatMessage = null;
let onChatClaimed = null;

let friendList = { friends: [], pendingRequests: [], pendingCount: 0 };
let unsubscribers = [];
let lastMailCount = 0;
let friendRefreshTimer = null;
let visibilityHandler = null;
let focusHandler = null;

function emitFriendList() {
  if (onFriendListUpdate) onFriendListUpdate(friendList);
}

async function refreshFriendListInternal() {
  try {
    const data = await getFriendList();
    if (!data) return;
    // Preserve online status from the existing list — the `/friends` REST
    // endpoint may not include it, and the WebSocket `presence:*` events
    // are the source of truth for who's online.
    const onlineMap = new Map((friendList.friends || []).map((f) => [f.id, f.online]));
    friendList = {
      ...data,
      friends: (data.friends || []).map((f) => ({
        ...f,
        online: f.online ?? onlineMap.get(f.id) ?? false,
      })),
    };
    emitFriendList();
  } catch (err) {
    console.error('[presence] refreshFriendList failed:', err);
  }
}

/** Public refresh — used by the app when the user opens the friends sidebar. */
export function refreshFriendList() {
  return refreshFriendListInternal();
}

async function refreshMailCount() {
  try {
    const data = await getUnreadCount();
    if (onMailCountUpdate) onMailCountUpdate(data);
    lastMailCount = data?.count || 0;
    return data;
  } catch (err) {
    console.error('[presence] refreshMailCount failed:', err);
    return null;
  }
}

/** Manually trigger a mail count refresh (used by the Mailbox after claim/delete). */
export function refreshMailbox() {
  return refreshMailCount();
}

export async function startPresence(activity, callbacks = {}) {
  onFriendListUpdate = callbacks.onFriendListUpdate || null;
  onNewNotifications = callbacks.onNewNotifications || null;
  onMailCountUpdate = callbacks.onMailCountUpdate || null;
  onChatMessage = callbacks.onChatMessage || null;
  onChatClaimed = callbacks.onChatClaimed || null;
  currentActivity = activity;

  await connectWebSocket();

  unsubscribers.push(on('presence:snapshot', (data) => {
    if (!data?.friends) return;
    const onlineMap = new Map(data.friends.map((f) => [f.playerId, f.online]));
    friendList = {
      ...friendList,
      friends: (friendList.friends || []).map((f) => ({
        ...f,
        online: onlineMap.get(f.id) ?? f.online ?? false,
      })),
    };
    emitFriendList();
  }));

  unsubscribers.push(on('presence:update', (data) => {
    if (!data?.playerId) return;
    friendList = {
      ...friendList,
      friends: (friendList.friends || []).map((f) =>
        f.id === data.playerId ? { ...f, online: data.online } : f
      ),
    };
    emitFriendList();
  }));

  unsubscribers.push(on('friend:request', (data) => {
    if (onNewNotifications) {
      onNewNotifications([{
        type: 'friend-request',
        senderId: data.senderId,
        senderName: data.senderName,
        senderAvatar: data.senderAvatar,
      }]);
    }
    refreshFriendListInternal();
  }));

  unsubscribers.push(on('friend:accepted', (data) => {
    if (onNewNotifications) {
      onNewNotifications([{
        type: 'friend-accepted',
        name: data.name,
        avatar: data.avatar,
      }]);
    }
    refreshFriendListInternal();
  }));

  unsubscribers.push(on('friend:removed', () => {
    refreshFriendListInternal();
  }));

  unsubscribers.push(on('mail:received', () => {
    refreshMailCount().then((data) => {
      if (!data) return;
      if (onNewNotifications) {
        onNewNotifications([{
          type: 'new-mail',
          count: data.count,
          newCount: 1,
        }]);
      }
    });
  }));

  unsubscribers.push(on('draft:player_disconnected', (data) => {
    if (onNewNotifications) {
      onNewNotifications([{
        type: 'draft-player-disconnected',
        playerName: data.playerName,
        eventId: data.eventId,
        gracePeriodMs: data.gracePeriodMs,
      }]);
    }
  }));

  unsubscribers.push(on('draft:player_reconnected', (data) => {
    if (onNewNotifications) {
      onNewNotifications([{
        type: 'draft-player-reconnected',
        playerName: data.playerName,
        eventId: data.eventId,
      }]);
    }
  }));

  unsubscribers.push(on('draft:cancelled', (data) => {
    if (onNewNotifications) {
      onNewNotifications([{
        type: 'draft-aborted',
        eventId: data.eventId,
        reason: data.reason,
      }]);
    }
  }));

  unsubscribers.push(on('invite:received', (data) => {
    if (onNewNotifications) {
      onNewNotifications([{
        type: 'match-invite',
        senderId: data.senderId,
        senderName: data.senderName,
      }]);
    }
  }));

  unsubscribers.push(on('invite:accepted', (data) => {
    if (onNewNotifications) {
      onNewNotifications([{
        type: 'invite-accepted',
        roomCode: data.roomCode,
        isHost: data.isHost,
        opponent: data.opponent,
        name: data.opponent?.name,
      }]);
    }
  }));

  unsubscribers.push(on('invite:declined', () => {
    // No UI notification for declines yet — could be added later.
  }));

  unsubscribers.push(on('matchmaking:matched', (data) => {
    if (onNewNotifications) {
      onNewNotifications([{
        type: 'matchmaking-matched',
        roomCode: data.roomCode,
        isHost: data.isHost,
        opponent: data.opponent,
      }]);
    }
  }));

  unsubscribers.push(on('auction:sold', () => {
    // Auction proceeds arrive via mail — mail:received will trigger refresh.
  }));

  unsubscribers.push(on('chat:message', (data) => {
    if (onChatMessage) onChatMessage(data);
  }));

  unsubscribers.push(on('chat:claimed', (data) => {
    if (onChatClaimed) onChatClaimed(data);
  }));

  await refreshFriendListInternal();
  await refreshMailCount();

  // Periodic background refresh — catches avatar / name / rank changes that
  // friends made on their own clients. The WebSocket presence events only
  // cover online status, so without this poll, friend metadata would stay
  // frozen at whatever it was when the user logged in.
  friendRefreshTimer = setInterval(refreshFriendListInternal, FRIEND_REFRESH_INTERVAL_MS);

  // Snap to fresh data when the user comes back to the window — far more
  // responsive than waiting up to 30s after they alt-tab back in.
  visibilityHandler = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      refreshFriendListInternal();
    }
  };
  focusHandler = () => refreshFriendListInternal();
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibilityHandler);
  if (typeof window !== 'undefined') window.addEventListener('focus', focusHandler);
}

export function updateActivity(activity, data) {
  currentActivity = activity;
  currentActivityData = data || null;

  updateDiscordPresence(activity, data);
}

function updateDiscordPresence(activity, data) {
  import('../utils/arena/discordSettings.js').then(({ getDiscordSettings }) => {
    const settings = getDiscordSettings();
    if (!settings.showActivity) {
      import('./discordPresence.js').then((dp) => dp.clearPresence()).catch(() => {});
      return;
    }
    // Merge the spectator preference into match data
    if (activity === 'in-match' && data) {
      data._allowSpectators = settings.allowSpectators;
    }
    _sendDiscordPresence(activity, data);
  }).catch(() => {});
}

function _sendDiscordPresence(activity, data) {
  import('./discordPresence.js').then((dp) => {
    switch (activity) {
      case 'hub':
        dp.setPresenceHub();
        break;
      case 'store':
        dp.setPresenceStore();
        break;
      case 'deckbuilder':
      case 'deck-select':
        dp.setPresenceDeckBuilder();
        break;
      case 'matchmaking':
        dp.setPresenceMatchmaking();
        break;
      case 'in-match':
        dp.setPresenceMatch(data || {});
        break;
      case 'auction-house':
        dp.setPresenceAuctionHouse();
        break;
      case 'draft':
        dp.setPresenceDraft(data || {});
        break;
      default:
        dp.setPresenceHub();
    }
  }).catch(() => {});
}

export function stopPresence() {
  for (const unsub of unsubscribers) {
    try { unsub(); } catch {}
  }
  unsubscribers = [];
  if (friendRefreshTimer) {
    clearInterval(friendRefreshTimer);
    friendRefreshTimer = null;
  }
  if (visibilityHandler && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
  if (focusHandler && typeof window !== 'undefined') {
    window.removeEventListener('focus', focusHandler);
    focusHandler = null;
  }
  onFriendListUpdate = null;
  onNewNotifications = null;
  onMailCountUpdate = null;
  onChatMessage = null;
  onChatClaimed = null;
  disconnectWebSocket();
}
