// Discord Rich Presence — renderer side.
//
// Sends activity updates to the Bun runtime's /api/discord/activity
// endpoint, which forwards them to the Discord desktop client via IPC.
// All calls are fire-and-forget so they never block the UI.

import { getLocalApiOrigin } from './localApi';

const API = getLocalApiOrigin();
const ICON = { large_image: 'icon_512x512', large_text: 'Valkenhall' };

let appStartTimestamp = null;

function getStartTimestamp() {
  if (!appStartTimestamp) appStartTimestamp = Math.floor(Date.now() / 1000);
  return appStartTimestamp;
}

async function sendActivity(activity) {
  try {
    await fetch(`${API}/api/discord/activity`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity }),
    });
  } catch {
    // Discord not available — silently ignore
  }
}

// ── Pre-built activity states ────────────────────────────────────

export function setPresenceHub() {
  sendActivity({
    details: 'Main Menu',
    timestamps: { start: getStartTimestamp() },
    assets: ICON,
  });
}

export function setPresenceDeckBuilder(deckName) {
  sendActivity({
    details: deckName ? `Editing ${deckName}` : 'Deck Builder',
    timestamps: { start: getStartTimestamp() },
    assets: ICON,
  });
}

export function setPresenceStore() {
  sendActivity({
    details: 'Store',
    timestamps: { start: getStartTimestamp() },
    assets: ICON,
  });
}

export function setPresenceMatchmaking() {
  sendActivity({
    details: 'Finding opponent...',
    timestamps: { start: Math.floor(Date.now() / 1000) },
    assets: ICON,
  });
}

export function setPresenceMatch({ ranked = false, opponentName, roomCode, _allowSpectators = true } = {}) {
  const activity = {
    details: opponentName
      ? `${ranked ? 'Ranked' : 'Match'} vs ${opponentName}`
      : ranked ? 'Ranked Match' : 'In a Match',
    timestamps: { start: Math.floor(Date.now() / 1000) },
    assets: ICON,
  };

  // Discord requires party.id + party.size for the Join button to appear.
  if (roomCode && _allowSpectators) {
    activity.party = { id: roomCode, size: [2, 2] };
    activity.secrets = { join: `spectate:${roomCode}` };
  }

  sendActivity(activity);
}

export function setPresenceDraft({ setName, phase } = {}) {
  sendActivity({
    details: phase === 'picking' ? `Drafting ${setName || ''}`.trim() : 'Building Draft Deck',
    timestamps: { start: Math.floor(Date.now() / 1000) },
    assets: ICON,
  });
}

export function setPresenceAuctionHouse() {
  sendActivity({
    details: 'Auction House',
    timestamps: { start: getStartTimestamp() },
    assets: ICON,
  });
}

export function clearPresence() {
  sendActivity(null);
}

// ── Join request polling ─────────────────────────────────────────
// The Bun runtime queues join secrets from Discord's ACTIVITY_JOIN
// event. The renderer polls this endpoint and triggers spectate mode.

let joinPollTimer = null;
let joinCallback = null;

export function startJoinPolling(onJoin) {
  joinCallback = onJoin;
  if (joinPollTimer) return;
  joinPollTimer = setInterval(async () => {
    try {
      const res = await fetch(`${API}/api/discord/join`);
      if (!res.ok) return;
      const { secret } = await res.json();
      if (secret && joinCallback) {
        // Secret format: "spectate:{roomCode}"
        const roomCode = secret.startsWith('spectate:') ? secret.slice(9) : secret;
        joinCallback(roomCode);
      }
    } catch {}
  }, 2000);
}

export function stopJoinPolling() {
  clearInterval(joinPollTimer);
  joinPollTimer = null;
  joinCallback = null;
}
