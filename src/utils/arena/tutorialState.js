import { LOCAL_API_ORIGIN } from '../localApi';

/**
 * Tutorial progress persistence.
 *
 * Tutorials are a UI-only preference — they don't affect gameplay, so
 * we store their "seen" flags client-side rather than pushing them
 * through the server profile.
 *
 * Two-tier storage, same pattern as authApi's token store:
 *
 *   1. localStorage is the fast path for the common case (instant
 *      sync reads/writes in the browser's current origin).
 *   2. A persistent on-disk store at /api/preferences (served by the
 *      embedded Bun runtime) is the authoritative fallback. CEF's
 *      localStorage is scoped to the renderer URL, and in dev that
 *      URL changes per launch which wipes localStorage. The disk
 *      store survives restarts and upgrades, so the user never sees
 *      their tutorials replay.
 *
 * The module boots by firing `hydrateFromDisk()` which loads the
 * persistent file into an in-memory cache and copies any new keys
 * into localStorage. Consumers call the synchronous read/write
 * helpers; writes update localStorage + cache immediately and
 * fire-and-forget a PUT to the backend. The user always gets an
 * instant response and the persisted state catches up in the
 * background.
 */

const SEEN_PREFIX = 'valkenhall.tutorial.seen';
const ENABLED_KEY = 'valkenhall.tutorial.enabled';
// Everything we persist uses this prefix, so the DELETE endpoint's
// prefix query param can wipe the whole namespace in one call.
const PERSIST_NAMESPACE = 'valkenhall.tutorial.';

// In-memory cache of the persisted key/value store. Populated on
// boot via hydrateFromDisk and kept in lockstep with every write.
const cache = new Map();
let hydrated = false;
let hydratePromise = null;

function safeGetLocal(key) {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function safeSetLocal(key, value) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {
    // ignore — private mode, quota exceeded, etc.
  }
}

function safeRemoveLocal(key) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Fire-and-forget write to the persistent backend. Never awaits from
 * the synchronous caller — any failure (dev server not running,
 * quota issue, etc.) leaves the value in localStorage + cache and
 * the user experience is unaffected.
 */
function persistWrite(key, value) {
  try {
    fetch(`${LOCAL_API_ORIGIN}/api/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    }).catch(() => {});
  } catch {
    // ignore
  }
}

function persistRemove(key) {
  try {
    fetch(`${LOCAL_API_ORIGIN}/api/preferences`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: null }),
    }).catch(() => {});
  } catch {
    // ignore
  }
}

function persistDeletePrefix(prefix) {
  try {
    fetch(`${LOCAL_API_ORIGIN}/api/preferences?prefix=${encodeURIComponent(prefix)}`, {
      method: 'DELETE',
    }).catch(() => {});
  } catch {
    // ignore
  }
}

/**
 * Load the persistent backend into memory and mirror any flags it
 * contains into localStorage. Called once on module load; consumers
 * don't have to await it because the cache serves reads instantly
 * after the first call, and pre-hydration reads fall back to
 * whatever localStorage has (still correct most of the time).
 */
export async function hydrateTutorialState() {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const res = await fetch(`${LOCAL_API_ORIGIN}/api/preferences`);
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') {
          for (const [k, v] of Object.entries(data)) {
            cache.set(k, v);
            // Mirror into localStorage so same-origin reads stay
            // consistent across refreshes without hitting the disk.
            if (typeof v === 'string') safeSetLocal(k, v);
          }
        }
      }
    } catch {
      // No backend available (pure browser dev, tests, etc.) — the
      // localStorage-only path still works.
    } finally {
      hydrated = true;
    }
  })();
  return hydratePromise;
}

// Kick off hydration as soon as the module loads. Every consumer
// call is synchronous; by the time the user finishes their first
// tutorial, the cache is populated and subsequent dismisses will
// mirror to disk correctly.
if (typeof window !== 'undefined') {
  hydrateTutorialState();
}

function readRaw(key) {
  // Cache first (populated by hydrate), then localStorage fallback.
  if (cache.has(key)) {
    const v = cache.get(key);
    return v == null ? null : String(v);
  }
  return safeGetLocal(key);
}

function writeRaw(key, value) {
  cache.set(key, value);
  safeSetLocal(key, value);
  persistWrite(key, value);
}

function removeRaw(key) {
  cache.delete(key);
  safeRemoveLocal(key);
  persistRemove(key);
}

function seenKeyFor(profileId, tutorialKey) {
  return `${SEEN_PREFIX}.${profileId || 'anon'}.${tutorialKey}`;
}

/** True if this specific tutorial has been dismissed by this account. */
export function hasSeenTutorial(profileId, tutorialKey) {
  return readRaw(seenKeyFor(profileId, tutorialKey)) === '1';
}

/** Mark a tutorial dismissed for this account. */
export function markTutorialSeen(profileId, tutorialKey) {
  writeRaw(seenKeyFor(profileId, tutorialKey), '1');
}

/** Wipe the seen flag so the tutorial replays next time it's checked. */
export function resetTutorial(profileId, tutorialKey) {
  removeRaw(seenKeyFor(profileId, tutorialKey));
}

/**
 * Wipe every seen flag for the given account, so every tutorial in
 * the app replays on its next auto-play check.
 *
 * Returns the number of flags that were cleared, so the caller can
 * surface a "reset N tutorials" confirmation message.
 */
export function resetAllTutorials(profileId) {
  const prefix = `${SEEN_PREFIX}.${profileId || 'anon'}.`;
  let cleared = 0;

  // Clear cache + localStorage entries that match the prefix.
  const cacheKeys = [...cache.keys()];
  for (const key of cacheKeys) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      cleared++;
    }
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) toRemove.push(key);
      }
      for (const key of toRemove) {
        localStorage.removeItem(key);
      }
      // Union of cache and localStorage hits — cacheKeys may have
      // missed anything that was set directly in another tab.
      if (cleared === 0) cleared = toRemove.length;
    }
  } catch {
    // ignore
  }

  // And clear the persistent backend.
  persistDeletePrefix(prefix);
  return cleared;
}

/**
 * Global "tutorials enabled" switch — defaults to true so first-run
 * users see the onboarding. Stored as string '0' / '1'.
 */
export function areTutorialsEnabled() {
  const raw = readRaw(ENABLED_KEY);
  if (raw === null) return true;
  return raw !== '0';
}

export function setTutorialsEnabled(enabled) {
  writeRaw(ENABLED_KEY, enabled ? '1' : '0');
}

/** Convenience: should this tutorial auto-play right now? */
export function shouldAutoPlay(profileId, tutorialKey) {
  return areTutorialsEnabled() && !hasSeenTutorial(profileId, tutorialKey);
}
