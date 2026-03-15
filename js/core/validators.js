/**
 * Input validation helpers returning Result-style objects.
 * Used by AuthManager for signup/login validation.
 */

window.Validators = Object.freeze({
  /**
   * @param {string} email
   * @returns {{ ok: true } | { ok: false, error: string }}
   */
  email(email) {
    if (!email || typeof email !== 'string') {
      return { ok: false, error: 'Email é obrigatório' };
    }
    const trimmed = email.trim();
    // Basic email regex — not RFC-complete but sufficient for client-side UX
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      return { ok: false, error: 'Email inválido' };
    }
    return { ok: true };
  },

  /**
   * @param {string} password
   * @returns {{ ok: true } | { ok: false, error: string }}
   */
  password(password) {
    if (!password || typeof password !== 'string') {
      return { ok: false, error: 'Senha é obrigatória' };
    }
    if (password.length < 6) {
      return { ok: false, error: 'Senha deve ter no mínimo 6 caracteres' };
    }
    return { ok: true };
  },

  /**
   * @param {string} username
   * @returns {{ ok: true } | { ok: false, error: string }}
   */
  username(username) {
    if (!username || typeof username !== 'string') {
      return { ok: false, error: 'Nome de usuário é obrigatório' };
    }
    const trimmed = username.trim();
    if (trimmed.length < 3 || trimmed.length > 20) {
      return { ok: false, error: 'Nome de usuário deve ter entre 3 e 20 caracteres' };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      return { ok: false, error: 'Nome de usuário deve conter apenas letras, números e underscore' };
    }
    return { ok: true };
  }
});
