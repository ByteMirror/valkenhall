import { Updater } from 'electrobun/bun';

const GITHUB_RELEASES_API = 'https://api.github.com/repos/ByteMirror/valkenhall/releases/latest';

const state = {
  state: 'CHECKING',
  currentVersion: null,
  newVersion: null,
  releaseNotes: null,
  downloadProgress: null,
  error: null,
};

function getStatus() {
  return { ...state };
}

async function fetchReleaseNotes() {
  try {
    const response = await fetch(GITHUB_RELEASES_API, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });

    if (!response.ok) {
      return null;
    }

    const release = await response.json();
    return release.body || null;
  } catch {
    return null;
  }
}

async function initUpdater() {
  try {
    const localInfo = await Updater.getLocallocalInfo();
    state.currentVersion = localInfo.version;
  } catch {
    state.state = 'UP_TO_DATE';
    state.error = 'Could not read local version info (dev mode)';
    return;
  }

  state.state = 'CHECKING';

  try {
    const result = await Updater.checkForUpdate();

    if (result.error) {
      state.state = 'UP_TO_DATE';
      state.error = result.error;
      return;
    }

    if (!result.updateAvailable) {
      state.state = 'UP_TO_DATE';
      return;
    }

    state.state = 'UPDATE_AVAILABLE';
    state.newVersion = result.version || null;

    const releaseNotes = await fetchReleaseNotes();
    state.releaseNotes = releaseNotes;

    await startDownload();
  } catch (err) {
    state.state = 'UP_TO_DATE';
    state.error = err?.message || 'Update check failed';
  }
}

async function startDownload() {
  state.state = 'DOWNLOADING';
  state.error = null;

  Updater.onStatusChange((entry) => {
    if (entry.details?.progress != null) {
      state.downloadProgress = Math.round(entry.details.progress);
    }

    if (entry.details?.bytesDownloaded != null && entry.details?.totalBytes) {
      state.downloadProgress = Math.round(
        (entry.details.bytesDownloaded / entry.details.totalBytes) * 100,
      );
    }
  });

  try {
    const result = await Updater.downloadUpdate();

    Updater.onStatusChange(null);

    const updateInfo = Updater.updateInfo();

    if (updateInfo?.updateReady) {
      state.state = 'READY_TO_INSTALL';
      state.downloadProgress = 100;
    } else if (updateInfo?.error || result?.error) {
      state.state = 'DOWNLOAD_FAILED';
      state.error = updateInfo?.error || result?.error || 'Download failed';
    } else {
      state.state = 'READY_TO_INSTALL';
      state.downloadProgress = 100;
    }
  } catch (err) {
    Updater.onStatusChange(null);
    state.state = 'DOWNLOAD_FAILED';
    state.error = err?.message || 'Download failed';
  }
}

async function retryDownload() {
  if (state.state !== 'DOWNLOAD_FAILED') {
    return getStatus();
  }

  await startDownload();
  return getStatus();
}

async function manualCheck() {
  state.state = 'CHECKING';
  state.error = null;
  state.newVersion = null;
  state.releaseNotes = null;
  state.downloadProgress = null;

  try {
    const result = await Updater.checkForUpdate();

    if (result.error) {
      state.state = 'UP_TO_DATE';
      state.error = result.error;
      return getStatus();
    }

    if (!result.updateAvailable) {
      state.state = 'UP_TO_DATE';
      return getStatus();
    }

    state.state = 'UPDATE_AVAILABLE';
    state.newVersion = result.version || null;

    const releaseNotes = await fetchReleaseNotes();
    state.releaseNotes = releaseNotes;

    await startDownload();
    return getStatus();
  } catch (err) {
    state.state = 'UP_TO_DATE';
    state.error = err?.message || 'Update check failed';
    return getStatus();
  }
}

async function applyUpdate() {
  const updateInfo = Updater.updateInfo();

  if (!updateInfo?.updateReady) {
    return;
  }

  state.state = 'APPLYING';
  await Updater.applyUpdate();
}

export { initUpdater, getStatus, manualCheck, retryDownload, applyUpdate };
