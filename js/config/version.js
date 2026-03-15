/**
 * Version Management — English Training
 * APP_VERSION: semver, bumped manually for meaningful releases
 * APP_BUILD: git short hash, injected by CI (deploy.yml)
 */
const APP_VERSION = '2.0.0';
const APP_BUILD = '__BUILD_HASH__';

// Expose globally for future use in fetch() cache busting
window.APP_VERSION = APP_VERSION;
window.APP_BUILD = APP_BUILD;

// Version gate — clear stale SW caches on upgrade
(function checkVersionUpgrade() {
  const stored = localStorage.getItem('app_version');
  if (stored && stored !== APP_VERSION) {
    console.warn(`[Version] ${stored} → ${APP_VERSION}, limpando caches obsoletos...`);
    if ('caches' in window) {
      caches.keys().then(names => names.forEach(n => caches.delete(n)));
    }
  }
  localStorage.setItem('app_version', APP_VERSION);
})();
