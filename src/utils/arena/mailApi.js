const MATCHMAKING_URL = 'https://fab-matchmaking.vercel.app';

function authHeaders() {
  const token = localStorage.getItem('fab-arena-token');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchInbox() {
  const res = await fetch(`${MATCHMAKING_URL}/api/mail/inbox`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch inbox');
  return res.json();
}

export async function sendMail({ recipientId, subject, body, cards, coins }) {
  const res = await fetch(`${MATCHMAKING_URL}/api/mail/send`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ recipientId, subject, body, cards, coins }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to send mail');
  }
  return res.json();
}

export async function claimMail(mailId) {
  const res = await fetch(`${MATCHMAKING_URL}/api/mail/claim`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ mailId }),
  });
  if (!res.ok) throw new Error('Failed to claim mail');
  return res.json();
}

export async function deleteMail(mailId) {
  const res = await fetch(`${MATCHMAKING_URL}/api/mail/delete`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ mailId }),
  });
  if (!res.ok) throw new Error('Failed to delete mail');
  return res.json();
}

export async function getUnreadCount() {
  const res = await fetch(`${MATCHMAKING_URL}/api/mail/unread-count`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Failed to get unread count');
  return res.json();
}
