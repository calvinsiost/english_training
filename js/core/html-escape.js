/**
 * Escapes HTML special characters to prevent XSS when inserting user content via innerHTML.
 * @param {string} str
 * @returns {string}
 */
window.escapeHtml = function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};
