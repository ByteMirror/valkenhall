import { getStoredToken } from '../authApi';

const MATCHMAKING_URL = 'https://valkenhall-server-production.up.railway.app';

async function authHeaders() {
  const token = await getStoredToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchInbox() {
  const res = await fetch(`${MATCHMAKING_URL}/mail/inbox`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch inbox');
  return res.json();
}

export async function sendMail({ recipientId, subject, body, cards, coins }) {
  const res = await fetch(`${MATCHMAKING_URL}/mail/send`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ recipientId, subject, body, cards, coins }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to send mail');
  }
  return res.json();
}

export async function claimMail(mailId) {
  const res = await fetch(`${MATCHMAKING_URL}/mail/claim`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ mailId }),
  });
  if (!res.ok) throw new Error('Failed to claim mail');
  return res.json();
}

export async function deleteMail(mailId) {
  const res = await fetch(`${MATCHMAKING_URL}/mail/${encodeURIComponent(mailId)}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete mail');
  if (res.status === 204) return null;
  return res.json().catch(() => null);
}

export async function getUnreadCount() {
  const res = await fetch(`${MATCHMAKING_URL}/mail/unread-count`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to get unread count');
  return res.json();
}
