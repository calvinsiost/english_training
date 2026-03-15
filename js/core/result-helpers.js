/**
 * Result pattern helpers for consistent success/error returns.
 * Inspired by Rust's Result<T, E> and app_default's ApiResult pattern.
 *
 * @typedef {{ ok: true, data: T }} OkResult
 * @typedef {{ ok: false, error: { code: string, message: string } }} FailResult
 * @typedef {OkResult | FailResult} Result
 */

window.Result = Object.freeze({
  /**
   * @template T
   * @param {T} data
   * @returns {{ ok: true, data: T }}
   */
  ok(data) {
    return { ok: true, data };
  },

  /**
   * @param {string} code
   * @param {string} message
   * @returns {{ ok: false, error: { code: string, message: string } }}
   */
  fail(code, message) {
    return { ok: false, error: { code, message } };
  }
});
