import assert from 'node:assert/strict';
import test from 'node:test';
import {
  announceContentChanged,
  CONTENT_CHANGE_CHANNEL,
  CONTENT_CHANGE_MESSAGE_TYPE,
  CONTENT_CHANGE_STORAGE_KEY,
  CONTENT_CHANGE_VERSION,
  manifestFoldersForPaths,
} from '../artifacts/admin-console/src/lib/content-change-bus.js';
import { subscribeToManifestChanges } from '../artifacts/personal-website/public/shared/manifest-change-sync.js';

test('content paths map only to the known public manifest folders', () => {
  assert.deepEqual(
    manifestFoldersForPaths([
      'pictures/events',
      'posts/2026',
      'documents/reports',
      'videos',
      'stylesheets',
      '../posts',
      'pictures/../documents',
      null,
      42,
    ]),
    ['posts', 'documents', 'pictures', 'videos', 'wallpapers'],
  );
  assert.deepEqual(manifestFoldersForPaths([], { includeRootManifest: true }), ['wallpapers']);
  assert.deepEqual(manifestFoldersForPaths(['stylesheets/new.css']), []);
});

test('content changes use BroadcastChannel and fall back to storage events', () => {
  const originalWindow = globalThis.window;
  try {
    const posted = [];
    class FakeBroadcastChannel {
      constructor(name) { this.name = name; }
      postMessage(message) { posted.push({ name: this.name, message }); }
    }
    globalThis.window = { BroadcastChannel: FakeBroadcastChannel };

    assert.equal(announceContentChanged(['documents/guides']), true);
    assert.equal(posted.length, 1);
    assert.equal(posted[0].name, CONTENT_CHANGE_CHANNEL);
    assert.equal(posted[0].message.type, CONTENT_CHANGE_MESSAGE_TYPE);
    assert.equal(posted[0].message.version, CONTENT_CHANGE_VERSION);
    assert.deepEqual(posted[0].message.folders, ['documents']);

    const storageWrites = [];
    globalThis.window = {
      localStorage: { setItem: (...args) => storageWrites.push(args) },
    };
    assert.equal(announceContentChanged(['posts']), true);
    assert.equal(storageWrites.length, 1);
    assert.equal(storageWrites[0][0], CONTENT_CHANGE_STORAGE_KEY);
    assert.deepEqual(JSON.parse(storageWrites[0][1]).folders, ['posts']);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('desktop manifest notifications reject bad paths and refresh only visible consumers', () => {
  const changes = { stale: [], refreshed: [], menus: 0, searches: 0 };
  class FakeBroadcastChannel {
    constructor() { FakeBroadcastChannel.instance = this; }
    addEventListener(type, listener) { this.listener = listener; }
    close() { this.closed = true; }
    send(data) { this.listener({ data }); }
  }
  const listeners = new Map();
  const targetWindow = {
    BroadcastChannel: FakeBroadcastChannel,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const close = subscribeToManifestChanges({
    targetWindow,
    getVisibleConsumers: () => ({
      menu: true,
      search: true,
      fileManager: true,
      wallpaperSettings: false,
    }),
    markStale: folder => changes.stale.push(folder),
    renderMenu: () => { changes.menus += 1; },
    renderSearch: () => { changes.searches += 1; },
    refreshFolder: folder => { changes.refreshed.push(folder); },
  });
  const channel = FakeBroadcastChannel.instance;
  channel.send({
    type: CONTENT_CHANGE_MESSAGE_TYPE,
    version: CONTENT_CHANGE_VERSION,
    nonce: 'test-valid',
    folders: ['posts', 'posts', 'wallpapers', 'https://invalid.example/'],
  });
  channel.send({
    type: CONTENT_CHANGE_MESSAGE_TYPE,
    version: CONTENT_CHANGE_VERSION,
    nonce: 'test-invalid',
    folders: ['https://invalid.example/files/posts/manifest.json'],
  });
  listeners.get('storage')({
    key: CONTENT_CHANGE_STORAGE_KEY,
    newValue: JSON.stringify({
      type: CONTENT_CHANGE_MESSAGE_TYPE,
      version: CONTENT_CHANGE_VERSION,
      nonce: 'storage-fallback',
      folders: ['documents'],
    }),
  });

  assert.deepEqual(changes.stale, ['posts', 'wallpapers', 'documents']);
  assert.deepEqual(changes.refreshed, ['posts', 'documents']);
  assert.equal(changes.menus, 2);
  assert.equal(changes.searches, 2);
  close();
  assert.equal(channel.closed, true);
  assert.equal(listeners.has('storage'), false);
});
