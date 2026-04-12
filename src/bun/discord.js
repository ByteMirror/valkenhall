// Discord Rich Presence via local IPC socket.
//
// Discord's desktop client listens on platform-specific IPC endpoints:
//   macOS:   Unix socket at {TMPDIR}/discord-ipc-{N}
//   Linux:   Unix socket at {XDG_RUNTIME_DIR}/discord-ipc-{N}
//            Flatpak: {XDG_RUNTIME_DIR}/app/com.discordapp.Discord/discord-ipc-{N}
//            Snap:    {XDG_RUNTIME_DIR}/snap.discord/discord-ipc-{N}
//   Windows: Named pipe at \\?\pipe\discord-ipc-{N}
//
// Protocol is binary-framed: [4-byte LE opcode][4-byte LE length][JSON payload]
// Opcodes: 0 = HANDSHAKE, 1 = FRAME, 2 = CLOSE, 3 = PING, 4 = PONG
//
// Rate limit: Discord throttles SET_ACTIVITY to ~1 update per 15 seconds.
// Sending faster can silently clear presence for other users. We queue
// updates and flush the newest one after a 15-second cooldown.

import { connect } from 'node:net';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1492238112879804607';

const OP_HANDSHAKE = 0;
const OP_FRAME = 1;
const OP_CLOSE = 2;
const OP_PING = 3;
const OP_PONG = 4;

// Rate-limit: at most one SET_ACTIVITY every 15 seconds.
const ACTIVITY_COOLDOWN_MS = 15_000;

let socket = null;
let connected = false;
let readyUser = null;
let nonceCounter = 0;
let pendingCallbacks = new Map();
let joinHandler = (secret) => {
  console.log(`[discord] Join request received: ${secret}`);
  pendingJoinSecrets.push(secret);
};

// Rate-limit state
let lastActivitySentAt = 0;
let pendingActivity = undefined;   // undefined = nothing queued
let activityFlushTimer = null;

function nonce() {
  return `rpc-${Date.now()}-${++nonceCounter}`;
}

// ── Binary framing ──────────────────────────────────────────────
// The entire frame (header + JSON) MUST be written as a single buffer.
// Split writes corrupt the pipe protocol.

function encodeFrame(opcode, payload) {
  const json = JSON.stringify(payload);
  const jsonBuf = Buffer.from(json, 'utf-8');
  const header = Buffer.alloc(8);
  header.writeUInt32LE(opcode, 0);
  header.writeUInt32LE(jsonBuf.length, 4);
  return Buffer.concat([header, jsonBuf]);
}

function decodeFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const opcode = buffer.readUInt32LE(offset);
    const length = buffer.readUInt32LE(offset + 4);
    if (offset + 8 + length > buffer.length) break;
    const json = buffer.slice(offset + 8, offset + 8 + length).toString('utf-8');
    try {
      frames.push({ opcode, data: JSON.parse(json) });
    } catch {}
    offset += 8 + length;
  }
  return { frames, remaining: buffer.slice(offset) };
}

// ── Socket path discovery ───────────────────────────────────────

function getSocketPaths(index) {
  if (process.platform === 'win32') {
    return [`\\\\?\\pipe\\discord-ipc-${index}`];
  }

  const paths = [];
  const xdg = process.env.XDG_RUNTIME_DIR;
  const tmp = process.env.TMPDIR || tmpdir() || '/tmp';

  // Standard paths (macOS uses TMPDIR, Linux uses XDG_RUNTIME_DIR)
  if (xdg) paths.push(path.join(xdg, `discord-ipc-${index}`));
  paths.push(path.join(tmp, `discord-ipc-${index}`));

  // Linux Flatpak and Snap sandboxed paths
  if (xdg) {
    paths.push(path.join(xdg, 'app', 'com.discordapp.Discord', `discord-ipc-${index}`));
    paths.push(path.join(xdg, 'snap.discord', `discord-ipc-${index}`));
  }

  return paths;
}

// ── Connection ──────────────────────────────────────────────────

export function connectToDiscord() {
  if (!CLIENT_ID || CLIENT_ID === 'YOUR_APP_ID') {
    console.log('[discord] No CLIENT_ID configured — Rich Presence disabled');
    return;
  }
  console.log(`[discord] Connecting with Application ID: ${CLIENT_ID}`);
  tryConnect(0);
}

let hasLoggedDisconnect = false;

function tryConnect(index) {
  if (index > 9) {
    if (!hasLoggedDisconnect) {
      console.log('[discord] Discord not detected — will retry in background');
      hasLoggedDisconnect = true;
    }
    scheduleReconnect();
    return;
  }

  // For each IPC index, try all platform-specific paths
  const paths = getSocketPaths(index);
  tryPaths(paths, 0, index);
}

function tryPaths(paths, pathIdx, socketIndex) {
  if (pathIdx >= paths.length) {
    // None of the paths for this index worked — try next index
    tryConnect(socketIndex + 1);
    return;
  }

  const socketPath = paths[pathIdx];
  const sock = connect(socketPath);
  let readBuffer = Buffer.alloc(0);

  sock.on('connect', () => {
    socket = sock;
    sock.write(encodeFrame(OP_HANDSHAKE, { v: 1, client_id: CLIENT_ID }));
  });

  sock.on('data', (chunk) => {
    readBuffer = Buffer.concat([readBuffer, chunk]);
    const { frames, remaining } = decodeFrames(readBuffer);
    readBuffer = remaining;
    for (const frame of frames) handleFrame(frame);
  });

  sock.on('error', () => {
    sock.destroy();
    tryPaths(paths, pathIdx + 1, socketIndex);
  });

  sock.on('close', () => {
    if (socket === sock) {
      socket = null;
      connected = false;
      readyUser = null;
      scheduleReconnect();
    }
  });
}

let reconnectTimer = null;

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    tryConnect(0);
  }, 15000);
}

export function disconnectDiscord() {
  clearTimeout(reconnectTimer);
  clearTimeout(activityFlushTimer);
  reconnectTimer = null;
  activityFlushTimer = null;
  if (socket) {
    try { socket.write(encodeFrame(OP_CLOSE, {})); } catch {}
    socket.destroy();
    socket = null;
  }
  connected = false;
  readyUser = null;
}

// ── Frame handling ──────────────────────────────────────────────

function handleFrame(frame) {
  // Respond to PING with PONG to keep the connection alive
  if (frame.opcode === OP_PING) {
    try { socket?.write(encodeFrame(OP_PONG, frame.data)); } catch {}
    return;
  }

  if (frame.opcode === OP_HANDSHAKE || frame.opcode === OP_FRAME) {
    const data = frame.data;

    if (data.cmd === 'DISPATCH' && data.evt === 'READY') {
      connected = true;
      hasLoggedDisconnect = false;
      readyUser = data.data?.user || null;
      console.log(`[discord] Connected as ${readyUser?.username || 'unknown'}`);
      send('SUBSCRIBE', 'ACTIVITY_JOIN', {});
      send('SUBSCRIBE', 'ACTIVITY_JOIN_REQUEST', {});
      // Flush any activity that was queued before the connection was ready
      flushActivity();
      return;
    }

    if (data.cmd === 'DISPATCH' && data.evt === 'ACTIVITY_JOIN') {
      const secret = data.data?.secret;
      if (secret && joinHandler) joinHandler(secret);
      return;
    }

    if (data.nonce && pendingCallbacks.has(data.nonce)) {
      const cb = pendingCallbacks.get(data.nonce);
      pendingCallbacks.delete(data.nonce);
      cb(data);
    }
  }

  if (frame.opcode === OP_CLOSE) {
    console.log('[discord] Server closed connection:', frame.data?.message || '');
    socket?.destroy();
  }
}

function send(cmd, evt, args) {
  if (!socket || !connected) return null;
  const n = nonce();
  const payload = { cmd, nonce: n };
  if (evt) payload.evt = evt;
  if (args) payload.args = args;
  try {
    socket.write(encodeFrame(OP_FRAME, payload));
  } catch {}
  return n;
}

// ── Rate-limited activity updates ───────────────────────────────

function sendActivityNow(activity) {
  const label = activity?.state || activity?.details || '(cleared)';
  console.log(`[discord] SET_ACTIVITY: ${label}`);
  send('SET_ACTIVITY', null, {
    pid: process.pid,
    activity: activity || null,
  });
  lastActivitySentAt = Date.now();
}

function flushActivity() {
  if (pendingActivity === undefined) return;
  const activity = pendingActivity;
  pendingActivity = undefined;
  clearTimeout(activityFlushTimer);
  activityFlushTimer = null;
  if (connected) sendActivityNow(activity);
}

// ── Public API ──────────────────────────────────────────────────

export function setActivity(activity) {
  const now = Date.now();
  const elapsed = now - lastActivitySentAt;

  if (elapsed >= ACTIVITY_COOLDOWN_MS && connected) {
    // Cooldown expired — send immediately
    sendActivityNow(activity);
  } else {
    // Queue the update and schedule a flush after the cooldown
    pendingActivity = activity;
    if (!activityFlushTimer) {
      const delay = Math.max(0, ACTIVITY_COOLDOWN_MS - elapsed);
      activityFlushTimer = setTimeout(flushActivity, delay);
    }
  }
}

export function clearActivity() {
  setActivity(null);
}

export function isConnected() {
  return connected;
}

export function getUser() {
  return readyUser;
}

export function onJoinRequest(handler) {
  joinHandler = handler;
}

// Queue of join secrets received from Discord. The renderer polls
// GET /api/discord/join to consume them.
let pendingJoinSecrets = [];

export function consumeJoinSecret() {
  return pendingJoinSecrets.shift() || null;
}
