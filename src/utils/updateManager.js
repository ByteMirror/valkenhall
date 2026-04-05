import { getLocalApiOrigin } from './localApi';

const UPDATE_API = `${getLocalApiOrigin()}/api/update`;
const POLL_INTERVAL_MS = 3000;

const ACTIVE_STATES = new Set(['CHECKING', 'UPDATE_AVAILABLE', 'DOWNLOADING']);

function createUpdateManager(onChange) {
  let polling = false;
  let pollTimer = null;
  let lastState = null;

  async function fetchStatus() {
    try {
      const response = await fetch(`${UPDATE_API}/status`);

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch {
      return null;
    }
  }

  function handleNewStatus(status) {
    if (!status) {
      return;
    }

    const changed = !lastState || lastState.state !== status.state || lastState.downloadProgress !== status.downloadProgress;
    lastState = status;

    if (changed && onChange) {
      onChange(status);
    }

    if (ACTIVE_STATES.has(status.state)) {
      schedulePoll();
    } else {
      stopPolling();
    }
  }

  function schedulePoll() {
    if (polling) {
      return;
    }

    polling = true;
    pollTimer = setInterval(async () => {
      const status = await fetchStatus();
      handleNewStatus(status);
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    polling = false;

    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function init() {
    const status = await fetchStatus();
    handleNewStatus(status);
  }

  async function check() {
    try {
      const response = await fetch(`${UPDATE_API}/check`, { method: 'POST' });
      const status = await response.json();
      handleNewStatus(status);
      return status;
    } catch {
      return null;
    }
  }

  async function retry() {
    try {
      const response = await fetch(`${UPDATE_API}/retry`, { method: 'POST' });
      const status = await response.json();
      handleNewStatus(status);

      if (ACTIVE_STATES.has(status.state)) {
        schedulePoll();
      }

      return status;
    } catch {
      return null;
    }
  }

  async function apply() {
    try {
      await fetch(`${UPDATE_API}/apply`, { method: 'POST' });
    } catch {
      // Connection drops when app quits — expected
    }
  }

  function destroy() {
    stopPolling();
  }

  function getLastStatus() {
    return lastState;
  }

  return { init, check, retry, apply, destroy, getLastStatus };
}

export { createUpdateManager };
