import { getLocalApiOrigin } from '../localApi';

const API = () => `${getLocalApiOrigin()}/api/sessions`;

export async function listGameSessions() {
  const res = await fetch(API());
  if (!res.ok) throw new Error('Failed to list sessions');
  return res.json();
}

export async function saveGameSession(session) {
  const res = await fetch(API(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(session),
  });
  if (!res.ok) throw new Error('Failed to save session');
  return res.json();
}

export async function loadGameSession(sessionId) {
  const res = await fetch(`${API()}/${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new Error('Failed to load session');
  return res.json();
}

export async function deleteGameSession(sessionId) {
  const res = await fetch(`${API()}/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete session');
}
