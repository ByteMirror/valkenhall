import { api } from '../serverClient';

export async function fetchConversations() {
  return api.get('/chat/conversations');
}

export async function fetchMessages(friendId, { before, limit = 50 } = {}) {
  const params = new URLSearchParams();
  if (before) params.set('before', before);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return api.get(`/chat/${encodeURIComponent(friendId)}/messages${qs ? `?${qs}` : ''}`);
}

export async function sendChatMessage(friendId, { body, type, cards, coins, metadata } = {}) {
  return api.post(`/chat/${encodeURIComponent(friendId)}/send`, {
    body, type, cards, coins, metadata,
  });
}

export async function claimChatMessage(messageId) {
  return api.post(`/chat/messages/${encodeURIComponent(messageId)}/claim`, {});
}

export async function markChatRead(friendId, lastReadMessageId) {
  return api.post(`/chat/${encodeURIComponent(friendId)}/read`, { lastReadMessageId });
}
