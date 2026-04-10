import { connectWebSocket, send, on, isConnected } from '../serverClient';

// --- Internal state ---

let currentRoomCode = null;
let isHost = false;

// Game action handlers: Map<event, Set<callback>>
const actionHandlers = new Map();
// Connection event handlers
const playerJoinedHandlers = new Set();
const playerLeftHandlers = new Set();
const stateSyncHandlers = new Set();
const stateSyncRequestHandlers = new Set();

// --- Subscriptions to serverClient events ---

let roomJoinedUnsub = null;
let roomResumedUnsub = null;
let opponentJoinedUnsub = null;
let opponentReconnectedUnsub = null;
let opponentDisconnectedUnsub = null;
let roomClosedUnsub = null;
let roomErrorUnsub = null;
let gameActionUnsub = null;
let stateRequestUnsub = null;
let stateSyncUnsub = null;

// Pending join promise
let joinResolver = null;
let joinRejecter = null;

function setupSubscriptions() {
  // Avoid double-subscribing
  if (roomJoinedUnsub) return;

  roomJoinedUnsub = on('room:joined', (data) => {
    currentRoomCode = data?.roomCode || currentRoomCode;
    isHost = !!data?.isHost;
    if (joinResolver) {
      joinResolver({ ...data, roomCode: currentRoomCode, resumed: false });
      joinResolver = null;
      joinRejecter = null;
    }
    if (data?.opponentInRoom) {
      for (const cb of playerJoinedHandlers) cb({});
    }
  });

  roomResumedUnsub = on('room:resumed', (data) => {
    currentRoomCode = data?.roomCode || currentRoomCode;
    isHost = !!data?.isHost;
    if (joinResolver) {
      joinResolver({ ...data, roomCode: currentRoomCode, resumed: true });
      joinResolver = null;
      joinRejecter = null;
    }
    if (data?.opponentInRoom) {
      for (const cb of playerJoinedHandlers) cb({});
    }
  });

  opponentJoinedUnsub = on('opponent:joined', () => {
    for (const cb of playerJoinedHandlers) cb({});
  });

  opponentReconnectedUnsub = on('opponent:reconnected', () => {
    for (const cb of playerJoinedHandlers) cb({});
  });

  opponentDisconnectedUnsub = on('opponent:disconnected', () => {
    for (const cb of playerLeftHandlers) cb({});
  });

  roomClosedUnsub = on('room:closed', () => {
    currentRoomCode = null;
    for (const cb of playerLeftHandlers) cb({});
  });

  roomErrorUnsub = on('room:error', (data) => {
    if (joinRejecter) {
      joinRejecter(new Error(data?.error || 'Failed to join room'));
      joinResolver = null;
      joinRejecter = null;
    }
    console.warn('[socketClient] room:error', data);
  });

  gameActionUnsub = on('game:action', (data) => {
    if (!data?.event) return;
    const list = actionHandlers.get(data.event);
    if (list) {
      for (const cb of list) {
        try { cb(data); } catch (err) { console.error(err); }
      }
    }
  });

  stateRequestUnsub = on('state:request', () => {
    for (const cb of stateSyncRequestHandlers) cb({});
  });

  stateSyncUnsub = on('state:sync', (data) => {
    for (const cb of stateSyncHandlers) cb(data);
  });
}

function teardownSubscriptions() {
  for (const unsub of [
    roomJoinedUnsub, roomResumedUnsub, opponentJoinedUnsub,
    opponentReconnectedUnsub, opponentDisconnectedUnsub,
    roomClosedUnsub, roomErrorUnsub, gameActionUnsub,
    stateRequestUnsub, stateSyncUnsub,
  ]) {
    if (unsub) {
      try { unsub(); } catch {}
    }
  }
  roomJoinedUnsub = roomResumedUnsub = opponentJoinedUnsub = null;
  opponentReconnectedUnsub = opponentDisconnectedUnsub = null;
  roomClosedUnsub = roomErrorUnsub = gameActionUnsub = null;
  stateRequestUnsub = stateSyncUnsub = null;
}

// --- Public API (matches PeerJS surface) ---

export async function createRoom() {
  // The new server doesn't support ad-hoc room creation outside matchmaking/invites.
  // Kept as a no-op stub for backwards compat.
  await connectWebSocket();
  setupSubscriptions();
  isHost = true;
  console.warn('[socketClient] createRoom() is deprecated — rooms are created via matchmaking or friend invites');
  return null;
}

export async function createRoomWithCode(code) {
  await connectWebSocket();
  setupSubscriptions();

  return new Promise((resolve, reject) => {
    joinResolver = resolve;
    joinRejecter = reject;
    send('room:join', { roomCode: code });
    setTimeout(() => {
      if (joinRejecter) {
        joinRejecter(new Error('Join timeout'));
        joinResolver = null;
        joinRejecter = null;
      }
    }, 10000);
  });
}

export async function joinRoom(code) {
  await connectWebSocket();
  setupSubscriptions();

  return new Promise((resolve, reject) => {
    joinResolver = resolve;
    joinRejecter = reject;
    send('room:join', { roomCode: code });
    setTimeout(() => {
      if (joinRejecter) {
        joinRejecter(new Error('Join timeout'));
        joinResolver = null;
        joinRejecter = null;
      }
    }, 10000);
  });
}

export async function spectateRoom(code) {
  await connectWebSocket();
  setupSubscriptions();

  return new Promise((resolve, reject) => {
    joinResolver = resolve;
    joinRejecter = reject;
    send('room:spectate', { roomCode: code });
    setTimeout(() => {
      if (joinRejecter) {
        joinRejecter(new Error('Spectate timeout'));
        joinResolver = null;
        joinRejecter = null;
      }
    }, 10000);
  });
}

export function disconnectSocket() {
  if (currentRoomCode) {
    send('room:leave', {});
  }
  currentRoomCode = null;
  isHost = false;
  teardownSubscriptions();
}

export function emitGameAction(event, data = {}) {
  if (!isConnected()) return;
  send('game:action', { event, ...data });
}

export function onGameAction(event, callback) {
  if (!actionHandlers.has(event)) actionHandlers.set(event, new Set());
  actionHandlers.get(event).add(callback);
}

export function offGameAction(event, callback) {
  const set = actionHandlers.get(event);
  if (set) set.delete(callback);
}

export function onPlayerJoined(callback) {
  playerJoinedHandlers.add(callback);
}

export function onPlayerLeft(callback) {
  playerLeftHandlers.add(callback);
}

export function onStateSync(callback) {
  stateSyncHandlers.add(callback);
}

export function onStateSyncRequest(callback) {
  stateSyncRequestHandlers.add(callback);
}

export function sendStateSync(state) {
  if (!isConnected()) return;
  send('state:sync', { state });
}

export function requestStateSync() {
  if (!isConnected()) return;
  send('state:request', {});
}

export function getSocket() {
  return null;
}

export { isConnected };
