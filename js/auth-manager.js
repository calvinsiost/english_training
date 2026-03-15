/**
 * AuthManager — handles Supabase authentication lifecycle.
 * Supports email/password signup, login, Google OAuth (redirect), and session management.
 * Guest mode (no auth) is the default — all features work without login.
 */

class AuthManager {
  /**
   * @param {object} supabaseClient - Supabase client instance
   */
  constructor(supabaseClient) {
    this._supabase = supabaseClient;
    this._user = null;
    this._session = null;
    this._listeners = [];
    this._log = Logger.create('AuthManager');
  }

  /**
   * Initialize auth state from existing session.
   * Call once during app startup.
   */
  async init() {
    try {
      const { data, error } = await this._supabase.auth.getSession();
      if (error) {
        this._log.warn('Failed to get session:', error.message);
        return;
      }

      if (data.session) {
        this._session = data.session;
        this._user = await this._fetchProfile(data.session.user);
        this._log.info('Session restored for', this._user?.username || data.session.user.email);
      }

      // Listen for auth state changes (login, logout, token refresh, cross-tab sync)
      this._supabase.auth.onAuthStateChange((event, session) => {
        this._log.info('Auth state changed:', event);
        this._session = session;

        if (event === 'SIGNED_IN' && session) {
          this._fetchProfile(session.user).then(profile => {
            this._user = profile;
            this._notifyListeners(event, session);
          });
        } else if (event === 'SIGNED_OUT') {
          this._user = null;
          this._notifyListeners(event, null);
        } else if (event === 'TOKEN_REFRESHED') {
          this._notifyListeners(event, session);
        }
      });
    } catch (e) {
      this._log.error('Init failed:', e);
    }
  }

  /**
   * Sign up with email, password, and username.
   * @param {string} email
   * @param {string} password
   * @param {string} username
   * @returns {Promise<{ success: true, user: object } | { success: false, error: string }>}
   */
  async signUp(email, password, username) {
    // Client-side validation
    const emailCheck = Validators.email(email);
    if (!emailCheck.ok) return { success: false, error: emailCheck.error };

    const passCheck = Validators.password(password);
    if (!passCheck.ok) return { success: false, error: passCheck.error };

    const userCheck = Validators.username(username);
    if (!userCheck.ok) return { success: false, error: userCheck.error };

    try {
      const { data, error } = await this._supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { username: username.trim() }
        }
      });

      if (error) {
        const normalized = normalizeSupabaseError(error);
        return { success: false, error: normalized.message };
      }

      if (!data.session) {
        // Email confirmation required
        return { success: false, error: 'Verifique seu email para confirmar a conta' };
      }

      this._session = data.session;
      this._user = await this._fetchProfile(data.user);

      return { success: true, user: this._user };
    } catch (e) {
      this._log.error('SignUp failed:', e);
      const normalized = normalizeSupabaseError(e);
      return { success: false, error: normalized.message };
    }
  }

  /**
   * Sign in with email and password.
   * @param {string} email
   * @param {string} password
   * @returns {Promise<{ success: true, user: object } | { success: false, error: string }>}
   */
  async signIn(email, password) {
    const emailCheck = Validators.email(email);
    if (!emailCheck.ok) return { success: false, error: emailCheck.error };

    const passCheck = Validators.password(password);
    if (!passCheck.ok) return { success: false, error: passCheck.error };

    try {
      const { data, error } = await this._supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (error) {
        const normalized = normalizeSupabaseError(error);
        return { success: false, error: normalized.message };
      }

      this._session = data.session;
      this._user = await this._fetchProfile(data.user);

      return { success: true, user: this._user };
    } catch (e) {
      this._log.error('SignIn failed:', e);
      const normalized = normalizeSupabaseError(e);
      return { success: false, error: normalized.message };
    }
  }

  /**
   * Sign in with Google OAuth via redirect flow.
   * After redirect back, onAuthStateChange handles the SIGNED_IN event.
   */
  async signInWithGoogle() {
    try {
      // Save current route for post-redirect restoration
      localStorage.setItem('auth_redirect_route', window.location.hash || '#/');

      const { error } = await this._supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + window.location.pathname
        }
      });

      if (error) {
        const normalized = normalizeSupabaseError(error);
        this._log.error('Google OAuth failed:', normalized.message);
      }
    } catch (e) {
      this._log.error('Google OAuth exception:', e);
    }
  }

  /**
   * Sign out. Clears session but preserves local IndexedDB data.
   */
  async signOut() {
    try {
      await this._supabase.auth.signOut();
      this._session = null;
      this._user = null;
      this._log.info('Signed out');
    } catch (e) {
      this._log.error('SignOut failed:', e);
    }
  }

  /**
   * Update username (for post-Google-OAuth username selection).
   * @param {string} username
   * @returns {Promise<{ success: true, user: object } | { success: false, error: string }>}
   */
  async updateUsername(username) {
    if (!this.isLoggedIn()) {
      return { success: false, error: 'Não autenticado' };
    }

    const userCheck = Validators.username(username);
    if (!userCheck.ok) return { success: false, error: userCheck.error };

    try {
      const { error } = await this._supabase
        .from('profiles')
        .update({
          username: username.trim(),
          display_name: username.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', this._user.id);

      if (error) {
        if (error.message && error.message.includes('duplicate key')) {
          return { success: false, error: 'Nome de usuário já em uso' };
        }
        const normalized = normalizeSupabaseError(error);
        return { success: false, error: normalized.message };
      }

      this._user.username = username.trim();
      this._user.display_name = username.trim();
      return { success: true, user: this._user };
    } catch (e) {
      this._log.error('UpdateUsername failed:', e);
      const normalized = normalizeSupabaseError(e);
      return { success: false, error: normalized.message };
    }
  }

  /**
   * Request password reset email.
   * @param {string} email
   * @returns {Promise<{ success: true } | { success: false, error: string }>}
   */
  async resetPassword(email) {
    const emailCheck = Validators.email(email);
    if (!emailCheck.ok) return { success: false, error: emailCheck.error };

    try {
      const { error } = await this._supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin + window.location.pathname
      });

      if (error) {
        const normalized = normalizeSupabaseError(error);
        return { success: false, error: normalized.message };
      }

      return { success: true };
    } catch (e) {
      const normalized = normalizeSupabaseError(e);
      return { success: false, error: normalized.message };
    }
  }

  /** @returns {object|null} Current user profile */
  getUser() { return this._user; }

  /** @returns {boolean} */
  isLoggedIn() { return this._session !== null; }

  /** @returns {boolean} */
  isGuest() { return !this.isLoggedIn(); }

  /** @returns {object|null} Current session */
  getSession() { return this._session; }

  /**
   * Check if user has an auto-generated username (needs username selection).
   * @returns {boolean}
   */
  needsUsernameSetup() {
    if (!this._user) return false;
    return /^user_[a-f0-9]{8}$/.test(this._user.username);
  }

  /**
   * Register a listener for auth state changes.
   * @param {function} callback - (event: string, session: object|null) => void
   * @returns {function} Unsubscribe function
   */
  onAuthChange(callback) {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter(l => l !== callback);
    };
  }

  /**
   * Fetch user profile from profiles table.
   * @private
   */
  async _fetchProfile(authUser) {
    try {
      const { data, error } = await this._supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, created_at')
        .eq('id', authUser.id)
        .single();

      if (error || !data) {
        this._log.warn('Profile fetch failed, using auth data:', error?.message);
        return {
          id: authUser.id,
          email: authUser.email,
          username: authUser.user_metadata?.username || 'user_' + authUser.id.substring(0, 8),
          display_name: authUser.user_metadata?.username || authUser.email,
          avatar_url: authUser.user_metadata?.avatar_url || null,
          created_at: authUser.created_at
        };
      }

      return {
        id: data.id,
        email: authUser.email,
        username: data.username,
        display_name: data.display_name,
        avatar_url: data.avatar_url,
        created_at: data.created_at
      };
    } catch (e) {
      this._log.error('Profile fetch exception:', e);
      return {
        id: authUser.id,
        email: authUser.email,
        username: 'user_' + authUser.id.substring(0, 8),
        display_name: authUser.email,
        avatar_url: null,
        created_at: authUser.created_at
      };
    }
  }

  /** @private */
  _notifyListeners(event, session) {
    for (const listener of this._listeners) {
      try {
        listener(event, session);
      } catch (e) {
        this._log.error('Listener error:', e);
      }
    }
  }
}

window.AuthManager = AuthManager;
