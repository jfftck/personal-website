export const CONTENT_CHANGE_CHANNEL = 'jmt-content-manifest-changes-v1';
export const CONTENT_CHANGE_STORAGE_KEY = 'jmt-content-manifest-change-v1';
export const CONTENT_CHANGE_MESSAGE_TYPE = 'content-manifests-invalidated';
export const CONTENT_CHANGE_VERSION = 1;

const MANIFEST_FOLDERS = ['posts', 'documents', 'pictures', 'videos', 'wallpapers'];
const CONTENT_FOLDERS = new Set(MANIFEST_FOLDERS.slice(0, 4));
let messageSequence = 0;
let channel;

export function manifestFoldersForPaths(paths, { includeRootManifest = false } = {}) {
  const changed = new Set();
  for (const path of Array.isArray(paths) ? paths : []) {
    if (typeof path !== 'string' || path.length > 512) continue;
    const segments = path.split('/').filter(Boolean);
    if (!segments.length || segments.some(segment => segment === '.' || segment === '..')) continue;
    const root = segments[0];
    if (CONTENT_FOLDERS.has(root)) changed.add(root);
    if (root === 'pictures') changed.add('wallpapers');
  }
  if (includeRootManifest) changed.add('wallpapers');
  return MANIFEST_FOLDERS.filter(folder => changed.has(folder));
}

export function announceContentChanged(paths, options = {}) {
  const folders = manifestFoldersForPaths(paths, options);
  if (!folders.length || typeof window === 'undefined') return false;
  const message = {
    type: CONTENT_CHANGE_MESSAGE_TYPE,
    version: CONTENT_CHANGE_VERSION,
    nonce: `${Date.now().toString(36)}-${(++messageSequence).toString(36)}`,
    folders,
  };

  try {
    if (typeof window.BroadcastChannel === 'function') {
      channel ??= new window.BroadcastChannel(CONTENT_CHANGE_CHANNEL);
      channel.postMessage(message);
      return true;
    }
  } catch {
    channel = undefined;
  }

  try {
    window.localStorage.setItem(CONTENT_CHANGE_STORAGE_KEY, JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}
