/**
 * Structured logger with auto-prefixed module names.
 * Usage: const log = Logger.create('SyncManager');
 *        log.info('sync started');  // → console.log('[SyncManager] sync started')
 */

window.Logger = Object.freeze({
  /**
   * @param {string} moduleName
   * @returns {{ debug: Function, info: Function, warn: Function, error: Function }}
   */
  create(moduleName) {
    const prefix = `[${moduleName}]`;
    return Object.freeze({
      debug(...args) {
        console.debug(prefix, ...args);
      },
      info(...args) {
        console.log(prefix, ...args);
      },
      warn(...args) {
        console.warn(prefix, ...args);
      },
      error(...args) {
        console.error(prefix, ...args);
      }
    });
  }
});
