import { api, on } from '../serverClient';

export const GUILD_ROLES = {
  LEADER: 'leader',
  OFFICER: 'officer',
  MEMBER: 'member',
};

// --- REST endpoints ---

export async function createGuild(name) {
  return api.post('/guilds', { name });
}

export async function getGuild(guildId) {
  return api.get(`/guilds/${encodeURIComponent(guildId)}`);
}

export async function updateGuild(guildId, updates) {
  return api.put(`/guilds/${encodeURIComponent(guildId)}`, updates);
}

export async function disbandGuild(guildId) {
  return api.delete(`/guilds/${encodeURIComponent(guildId)}`);
}

export async function inviteToGuild(guildId, playerId) {
  return api.post(`/guilds/${encodeURIComponent(guildId)}/invite`, { playerId });
}

export async function kickFromGuild(guildId, playerId) {
  return api.post(`/guilds/${encodeURIComponent(guildId)}/kick`, { playerId });
}

export async function leaveGuild(guildId) {
  return api.post(`/guilds/${encodeURIComponent(guildId)}/leave`);
}

export async function changeGuildRole(guildId, playerId, role) {
  return api.put(`/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(playerId)}`, { role });
}

export async function getGuildMessages(guildId, { before, limit = 50 } = {}) {
  const params = new URLSearchParams();
  if (before) params.set('before', before);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return api.get(`/guilds/${encodeURIComponent(guildId)}/messages${qs ? `?${qs}` : ''}`);
}

export async function sendGuildMessage(guildId, body) {
  return api.post(`/guilds/${encodeURIComponent(guildId)}/messages`, { body });
}

export async function getGuildLeaderboard() {
  return api.get('/guilds/leaderboard');
}

export async function getMyGuild() {
  return api.get('/profile/me/guild');
}

// --- WebSocket helpers ---

export function subscribeToGuildEvents(handlers) {
  const unsubs = [];
  const events = [
    'message', 'invited', 'member_joined', 'member_left',
    'role_changed', 'disbanded',
  ];
  for (const event of events) {
    if (handlers[event]) {
      unsubs.push(on(`guild:${event}`, handlers[event]));
    }
  }
  return () => unsubs.forEach((unsub) => unsub());
}
