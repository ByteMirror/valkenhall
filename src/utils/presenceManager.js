import { connectWebSocket, disconnectWebSocket, on } from './serverClient';
import { getFriendList } from './friendsApi';
import { getUnreadCount } from './arena/mailApi';

let currentActivity = 'hub';
let onFriendListUpdate = null;
let onNewNotifications = null;
let onMailCountUpdate = null;

let friendList = { friends: [], pendingRequests: [], pendingCount: 0 };
let unsubscribers = [];
let lastMailCount = 0;

function emitFriendList() {
  if (onFriendListUpdate) onFriendListUpdate(friendList);
}

async function refreshFriendList() {
  try {
    const data = await getFriendList();
    friendList = data || { friends: [], pendingRequests: [], pendingCount: 0 };
    emitFriendList();
  } catch (err) {
    console.error('[presence] refreshFriendList failed:', err);
  }
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

export async function startPresence(activity, callbacks = {}) {
  onFriendListUpdate = callbacks.onFriendListUpdate || null;
  onNewNotifications = callbacks.onNewNotifications || null;
  onMailCountUpdate = callbacks.onMailCountUpdate || null;
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
    refreshFriendList();
  }));

  unsubscribers.push(on('friend:accepted', (data) => {
    if (onNewNotifications) {
      onNewNotifications([{
        type: 'friend-accepted',
        name: data.name,
        avatar: data.avatar,
      }]);
    }
    refreshFriendList();
  }));

  unsubscribers.push(on('friend:removed', () => {
    refreshFriendList();
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

  unsubscribers.push(on('auction:sold', () => {
    // Auction proceeds arrive via mail — mail:received will trigger refresh.
  }));

  await refreshFriendList();
  await refreshMailCount();
}

export function updateActivity(activity) {
  currentActivity = activity;
  // Server tracks online status automatically via WebSocket connection.
  // Activity is retained locally in case a future `presence:activity` message
  // is added to the server protocol.
}

export function stopPresence() {
  for (const unsub of unsubscribers) {
    try { unsub(); } catch {}
  }
  unsubscribers = [];
  onFriendListUpdate = null;
  onNewNotifications = null;
  onMailCountUpdate = null;
  disconnectWebSocket();
}
