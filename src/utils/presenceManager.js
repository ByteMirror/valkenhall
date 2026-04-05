import { sendPresence, getFriendList } from './friendsApi';
import { getUnreadCount } from './arena/mailApi';

let currentActivity = 'hub';
let heartbeatInterval = null;
let pollInterval = null;
let onFriendListUpdate = null;
let onNewNotifications = null;
let lastPendingCount = 0;
let lastInviteIds = new Set();
let lastSpectateIds = new Set();
let onMailCountUpdate = null;
let lastMailCount = 0;

export function startPresence(activity, callbacks = {}) {
  onFriendListUpdate = callbacks.onFriendListUpdate || null;
  onNewNotifications = callbacks.onNewNotifications || null;
  onMailCountUpdate = callbacks.onMailCountUpdate || null;
  currentActivity = activity;

  sendPresence(currentActivity).catch(() => {});
  pollFriends();

  if (!heartbeatInterval) {
    heartbeatInterval = setInterval(() => {
      sendPresence(currentActivity).catch(() => {});
    }, 15000);
  }

  if (!pollInterval) {
    pollInterval = setInterval(pollFriends, 15000);
  }
}

export function updateActivity(activity) {
  currentActivity = activity;
  sendPresence(activity).catch(() => {});
}

export function stopPresence() {
  clearInterval(heartbeatInterval);
  clearInterval(pollInterval);
  heartbeatInterval = null;
  pollInterval = null;
  onFriendListUpdate = null;
  onNewNotifications = null;
  onMailCountUpdate = null;
}

async function pollFriends() {
  try {
    const data = await getFriendList();
    if (onFriendListUpdate) onFriendListUpdate(data);

    const notifications = [];

    if (data.pendingCount > lastPendingCount) {
      const newest = data.pendingRequests[data.pendingRequests.length - 1];
      if (newest) {
        notifications.push({
          type: 'friend-request',
          senderId: newest.senderId,
          senderName: newest.senderName,
          senderAvatar: newest.senderAvatar,
        });
      }
    }
    lastPendingCount = data.pendingCount;

    for (const inv of data.pendingInvites || []) {
      if (!lastInviteIds.has(inv.senderId)) {
        notifications.push({
          type: 'match-invite',
          senderId: inv.senderId,
          senderName: inv.senderName,
        });
      }
    }
    lastInviteIds = new Set((data.pendingInvites || []).map((i) => i.senderId));

    for (const spec of data.pendingSpectate || []) {
      if (!lastSpectateIds.has(spec.spectatorId)) {
        notifications.push({
          type: 'spectate-request',
          spectatorId: spec.spectatorId,
          spectatorName: spec.spectatorName,
        });
      }
    }
    lastSpectateIds = new Set((data.pendingSpectate || []).map((s) => s.spectatorId));

    for (const acc of data.acceptedNotifications || []) {
      notifications.push({
        type: 'friend-accepted',
        name: acc.name,
        avatar: acc.avatar,
      });
    }

    if (notifications.length > 0 && onNewNotifications) {
      onNewNotifications(notifications);
    }

    // Poll mailbox unread count
    try {
      const mailCounts = await getUnreadCount();
      if (onMailCountUpdate) onMailCountUpdate(mailCounts);

      if (mailCounts.count > lastMailCount && lastMailCount >= 0) {
        if (onNewNotifications) {
          onNewNotifications([{ type: 'new-mail', count: mailCounts.count }]);
        }
      }
      lastMailCount = mailCounts.count;
    } catch {
      // Silent fail
    }
  } catch {
    // Silent fail — will retry next interval
  }
}
