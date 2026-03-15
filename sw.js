// Cleanup SW — unregisters itself and clears all caches
// Existing users with old SW will receive this update (browser bypasses SW cache for sw.js)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.map(name => caches.delete(name))))
      .then(() => self.registration.unregister())
      .then(() => console.log('[SW] Cleanup complete — unregistered'))
  );
});
