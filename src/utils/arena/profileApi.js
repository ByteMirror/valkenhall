import { getLocalApiOrigin } from '../localApi';

const API = () => `${getLocalApiOrigin()}/api/arena/profile`;

export async function loadArenaProfile() {
  const res = await fetch(API());
  if (!res.ok) throw new Error('Failed to load arena profile');
  return res.json();
}

export async function saveArenaProfile(profile) {
  const res = await fetch(API(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error('Failed to save arena profile');
  return res.json();
}
