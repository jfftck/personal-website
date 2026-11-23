const CHANNEL_NAME = 'jmt-content-manifest-changes-v1';
const STORAGE_KEY = 'jmt-content-manifest-change-v1';
const MESSAGE_TYPE = 'content-manifests-invalidated';
const MESSAGE_VERSION = 1;
const ALLOWED_FOLDERS = new Set(['posts', 'documents', 'pictures', 'videos', 'wallpapers']);

export function subscribeToManifestChanges({
  targetWindow = window,
  getVisibleConsumers,
  markStale,
  renderMenu,
  renderSearch,
  refreshFolder,
}) {
  const parseMessage = payload => {
    if (
      !payload ||
      payload.type !== MESSAGE_TYPE ||
      payload.version !== MESSAGE_VERSION ||
      typeof payload.nonce !== 'string' ||
      payload.nonce.length > 100 ||
      !Array.isArray(payload.folders) ||
      payload.folders.length > 5
    ) return [];
    return [...new Set(payload.folders.filter(folder => ALLOWED_FOLDERS.has(folder)))];
  };

  const handleMessage = payload => {
    const folders = parseMessage(payload);
    if (!folders.length) return;

    const visible = getVisibleConsumers();
    folders.forEach(markStale);
    if (visible.menu) renderMenu();
    if (visible.search) renderSearch();
    if (!visible.menu && !visible.search && !visible.fileManager && !visible.wallpaperSettings) return;

    const refresh = folders.filter(folder => folder !== 'wallpapers' || visible.wallpaperSettings);
    void Promise.all(refresh.map(refreshFolder));
  };

  let channel = null;
  try {
    if (typeof targetWindow.BroadcastChannel === 'function') {
      channel = new targetWindow.BroadcastChannel(CHANNEL_NAME);
      channel.addEventListener('message', event => handleMessage(event.data));
    }
  } catch {
    channel = null;
  }

  const handleStorage = event => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      handleMessage(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed cross-tab messages.
    }
  };
  targetWindow.addEventListener('storage', handleStorage);

  return () => {
    channel?.close();
    targetWindow.removeEventListener('storage', handleStorage);
  };
}
