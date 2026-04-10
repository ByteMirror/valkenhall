import { api, send, on, off } from '../serverClient';
import { CURRENCY } from './profileDefaults';

// Entry cost: 3 packs at 20% discount (must match server's computeEntryCost)
export const DRAFT_ENTRY_COST = Math.floor(CURRENCY.PACK_PRICE * 3 * 0.8);

// Draft event visibility options
export const DRAFT_VISIBILITY = {
  PUBLIC: 'public',
  GUILD: 'guild',
  PRIVATE: 'private',
};

// Draft event status values (matches server enum)
export const DRAFT_STATUS = {
  OPEN: 'open',
  DRAFTING: 'drafting',
  BUILDING: 'building',
  TOURNAMENT: 'tournament',
  COMPLETE: 'complete',
  CANCELLED: 'cancelled',
};

// --- REST endpoints ---

export async function listDraftEvents(filters = {}) {
  const params = new URLSearchParams();
  if (filters.visibility) params.set('visibility', filters.visibility);
  if (filters.status) params.set('status', filters.status);
  if (filters.setKey) params.set('setKey', filters.setKey);
  const qs = params.toString();
  return api.get(`/draft/events${qs ? `?${qs}` : ''}`);
}

export async function getDraftEvent(eventId) {
  return api.get(`/draft/events/${encodeURIComponent(eventId)}`);
}

export async function createDraftEvent({ setKey, podSize, scheduledAt, visibility, guildId }) {
  return api.post('/draft/events', { setKey, podSize, scheduledAt, visibility, guildId });
}

export async function joinDraftEvent(eventId) {
  return api.post(`/draft/events/${encodeURIComponent(eventId)}/join`);
}

export async function leaveDraftEvent(eventId) {
  return api.post(`/draft/events/${encodeURIComponent(eventId)}/leave`);
}

export async function cancelDraftEvent(eventId) {
  return api.post(`/draft/events/${encodeURIComponent(eventId)}/cancel`);
}

export async function startDraftEarly(eventId) {
  return api.post(`/draft/events/${encodeURIComponent(eventId)}/start`);
}

export async function skipDraft(eventId) {
  return api.post(`/draft/events/${encodeURIComponent(eventId)}/skip-draft`);
}

export async function inviteToDraft(eventId, playerIds) {
  return api.post(`/draft/events/${encodeURIComponent(eventId)}/invite`, { playerIds });
}

export async function submitDraftDeck(eventId, { spellbook, atlas, avatarId }) {
  return api.post(`/draft/events/${encodeURIComponent(eventId)}/deck`, { spellbook, atlas, avatarId });
}

export async function getDraftStandings(eventId) {
  return api.get(`/draft/events/${encodeURIComponent(eventId)}/standings`);
}

export async function getDraftPickHistory(eventId) {
  return api.get(`/draft/events/${encodeURIComponent(eventId)}/picks`);
}

export async function reportDraftMatchResult(eventId, matchId, winnerId) {
  return api.post(`/draft/events/${encodeURIComponent(eventId)}/match-result`, { matchId, winnerId });
}

// --- WebSocket helpers ---

export function sendDraftPick(cardId, printingId) {
  return send('draft:pick', { cardId, printingId });
}

export function onDraftEvent(eventType, callback) {
  return on(`draft:${eventType}`, callback);
}

export function offDraftEvent(eventType, callback) {
  off(`draft:${eventType}`, callback);
}

// Subscribe to all draft lifecycle events. Returns an unsubscribe function.
export function subscribeToDraftEvents(handlers) {
  const unsubs = [];
  const events = [
    'started', 'pack', 'pick_confirmed', 'pack_complete',
    'timer', 'auto_picked', 'building', 'deck_submitted',
    'round_start', 'round_result', 'complete',
    'joined', 'left', 'cancelled', 'invite',
  ];
  for (const event of events) {
    if (handlers[event]) {
      unsubs.push(on(`draft:${event}`, handlers[event]));
    }
  }
  return () => unsubs.forEach((unsub) => unsub());
}
