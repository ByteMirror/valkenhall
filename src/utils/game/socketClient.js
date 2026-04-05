import Peer from 'peerjs';

let peer = null;
let connection = null;
let eventHandlers = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return 'SCR-' + code;
}

function emit(event, data) {
  const handlers = eventHandlers.get(event);
  if (handlers) {
    for (const handler of handlers) handler(data);
  }
}

function setupConnection(conn) {
  connection = conn;

  conn.on('open', () => {
    emit('player:joined', {});
  });

  conn.on('data', (message) => {
    if (message?.event) {
      emit(message.event, message.data);
    }
  });

  conn.on('close', () => {
    connection = null;
    emit('player:left', {});
  });

  conn.on('error', (err) => {
    console.error('[PeerJS] connection error:', err);
  });
}

export function createRoomWithCode(code) {
  return new Promise((resolve, reject) => {
    peer = new Peer(code, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
    });

    peer.on('open', (id) => {
      resolve(id);
    });

    peer.on('connection', (conn) => {
      setupConnection(conn);
    });

    peer.on('error', (err) => {
      console.error('[PeerJS] peer error:', err);
      reject(err);
    });
  });
}

export function createRoom() {
  return new Promise((resolve, reject) => {
    const roomCode = generateRoomCode();
    peer = new Peer(roomCode, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
    });

    peer.on('open', (id) => {
      resolve(id);
    });

    peer.on('connection', (conn) => {
      setupConnection(conn);
    });

    peer.on('error', (err) => {
      console.error('[PeerJS] peer error:', err);
      if (err.type === 'unavailable-id') {
        // ID taken, try again with different code
        peer.destroy();
        createRoom().then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
  });
}

export function joinRoom(code) {
  return new Promise((resolve, reject) => {
    const peerId = 'PEER-' + Math.random().toString(36).slice(2, 8);
    peer = new Peer(peerId, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      },
    });

    peer.on('open', () => {
      const conn = peer.connect(code, { reliable: true });

      conn.on('open', () => {
        setupConnection(conn);
        resolve(code);
      });

      conn.on('error', (err) => {
        reject(err);
      });
    });

    peer.on('error', (err) => {
      console.error('[PeerJS] join error:', err);
      reject(err);
    });
  });
}

export function disconnectSocket() {
  connection?.close();
  connection = null;
  peer?.destroy();
  peer = null;
  eventHandlers.clear();
}

export function emitGameAction(event, data) {
  if (connection?.open) {
    connection.send({ event, data });
  }
}

export function onGameAction(event, callback) {
  if (!eventHandlers.has(event)) eventHandlers.set(event, []);
  eventHandlers.get(event).push(callback);
}

export function offGameAction(event, callback) {
  const handlers = eventHandlers.get(event);
  if (handlers) {
    eventHandlers.set(event, handlers.filter((h) => h !== callback));
  }
}

export function requestStateSync() {
  emitGameAction('state:request', {});
}

export function sendStateSync(state, targetId) {
  emitGameAction('state:sync', { state });
}

export function onStateSync(callback) {
  onGameAction('state:sync', callback);
}

export function onStateSyncRequest(callback) {
  onGameAction('state:request', callback);
}

export function onPlayerJoined(callback) {
  onGameAction('player:joined', callback);
}

export function onPlayerLeft(callback) {
  onGameAction('player:left', callback);
}

export function getSocket() {
  return peer;
}

export function isConnected() {
  return connection?.open || false;
}
