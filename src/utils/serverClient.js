import { getStoredToken } from './authApi';

export const SERVER_URL = 'https://valkenhall-server-production.up.railway.app';
export const WS_URL = 'wss://valkenhall-server-production.up.railway.app/ws';

// --- REST helper ---

async function authHeaders() {
  const token = await getStoredToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(method, path, body) {
  const headers = await authHeaders();
  const init = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);

  const res = await fetch(`${SERVER_URL}${path}`, init);
  if (!res.ok) {
    let errMsg = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data?.error) errMsg = data.error;
    } catch {}
    throw new Error(errMsg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  delete: (path) => request('DELETE', path),
};

// --- WebSocket manager ---

let socket = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
const handlers = new Map();
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];

function getReconnectDelay() {
  const idx = Math.min(reconnectAttempts, RECONNECT_DELAYS.length - 1);
  return RECONNECT_DELAYS[idx];
}

export async function connectWebSocket() {
  if (socket && socket.readyState <= 1) return; // CONNECTING or OPEN

  const token = await getStoredToken();
  if (!token) return;

  socket = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);

  socket.addEventListener('open', () => {
    reconnectAttempts = 0;
    console.log('[serverClient] WebSocket connected');
  });

  socket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);
      if (!message?.type) return;
      const list = handlers.get(message.type);
      if (list) {
        for (const cb of list) {
          try { cb(message.data, message); } catch (err) { console.error(err); }
        }
      }
    } catch (err) {
      console.error('[serverClient] Failed to parse message:', err);
    }
  });

  socket.addEventListener('close', () => {
    console.log('[serverClient] WebSocket closed');
    socket = null;
    scheduleReconnect();
  });

  socket.addEventListener('error', (err) => {
    console.error('[serverClient] WebSocket error:', err);
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = getReconnectDelay();
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWebSocket().catch((err) => console.error('[serverClient] reconnect failed:', err));
  }, delay);
}

export function disconnectWebSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  if (socket) {
    socket.close();
    socket = null;
  }
}

export function send(type, data) {
  if (!socket || socket.readyState !== 1) {
    console.warn('[serverClient] cannot send — socket not open');
    return false;
  }
  socket.send(JSON.stringify({ type, data }));
  return true;
}

export function on(type, callback) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(callback);
  return () => off(type, callback);
}

export function off(type, callback) {
  const set = handlers.get(type);
  if (set) set.delete(callback);
}

export function isConnected() {
  return socket?.readyState === 1;
}
