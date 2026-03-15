/**
 * AuthUI — renders login/signup modal, header auth state, migration prompt.
 * Uses string HTML + event delegation pattern consistent with existing codebase.
 */

class AuthUI {
  /**
   * @param {AuthManager} authManager
   */
  constructor(authManager) {
    this._auth = authManager;
    this._log = Logger.create('AuthUI');
    this._modalEl = null;
    this._dropdownEl = null;
    this._isSignup = false;
    this._isLoading = false;

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (this._dropdownEl && !e.target.closest('.auth-header-container')) {
        this._hideDropdown();
      }
    });
  }

  /**
   * Update header to reflect auth state.
   * Call on init and on auth state change.
   */
  updateHeaderState() {
    const container = document.getElementById('auth-header-container');
    if (!container) return;

    if (this._auth.isLoggedIn()) {
      const user = this._auth.getUser();
      const initial = escapeHtml((user?.username || user?.email || '?')[0].toUpperCase());
      const username = escapeHtml(user?.username || user?.email || '');

      container.innerHTML = `
        <div class="auth-header-container" style="position:relative;">
          <button class="auth-avatar" id="auth-avatar-btn" title="${username}">${initial}</button>
        </div>
      `;

      document.getElementById('auth-avatar-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleDropdown();
      });
    } else {
      container.innerHTML = `
        <button class="auth-header-btn" id="auth-login-btn">
          <i data-lucide="log-in"></i>
          <span>Entrar</span>
        </button>
      `;

      document.getElementById('auth-login-btn')?.addEventListener('click', () => {
        this.showLoginModal();
      });

      // Re-render Lucide icons
      if (window.lucide) window.lucide.createIcons();
    }
  }

  /**
   * Show login/signup modal overlay.
   */
  showLoginModal() {
    if (this._modalEl) return;
    this._isSignup = false;
    this._renderModal();
  }

  /**
   * Hide login modal.
   */
  hideLoginModal() {
    if (this._modalEl) {
      this._modalEl.remove();
      this._modalEl = null;
    }
  }

  /**
   * Show migration prompt when user has local data.
   * @param {{ level: number, totalXP: number }} stats
   * @returns {Promise<boolean>} True if user confirms migration
   */
  showMigrationPrompt(stats) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'auth-modal-overlay';
      overlay.innerHTML = `
        <div class="auth-modal">
          <div class="auth-modal-header">
            <h2 class="auth-modal-title">Dados locais encontrados</h2>
            <p class="auth-modal-subtitle">Deseja mesclar com sua conta online?</p>
          </div>
          <div class="auth-migration-body">
            <div class="auth-migration-stats">
              <div class="auth-migration-stat">
                <div class="auth-migration-stat-value">${stats.level || 0}</div>
                <div class="auth-migration-stat-label">Nível</div>
              </div>
              <div class="auth-migration-stat">
                <div class="auth-migration-stat-value">${stats.totalXP || 0}</div>
                <div class="auth-migration-stat-label">XP Total</div>
              </div>
            </div>
            <div class="auth-migration-actions">
              <button class="auth-submit-btn" id="migration-confirm" style="flex:1;">Mesclar dados</button>
              <button class="auth-google-btn" id="migration-skip" style="flex:1;">Pular</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      overlay.querySelector('#migration-confirm').addEventListener('click', () => {
        overlay.remove();
        resolve(true);
      });

      overlay.querySelector('#migration-skip').addEventListener('click', () => {
        overlay.remove();
        resolve(false);
      });
    });
  }

  /**
   * Show username selection prompt (post-Google OAuth).
   * @returns {Promise<string|null>} Selected username or null if dismissed
   */
  showUsernamePrompt() {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'auth-modal-overlay';
      overlay.innerHTML = `
        <div class="auth-modal">
          <div class="auth-modal-header">
            <h2 class="auth-modal-title">Escolha seu nome de usuário</h2>
            <p class="auth-modal-subtitle">Será visível no ranking e para amigos</p>
          </div>
          <div class="auth-modal-body auth-username-prompt">
            <div class="auth-error" id="username-error"></div>
            <div class="auth-field">
              <label for="username-input">Nome de usuário</label>
              <input type="text" id="username-input" placeholder="meu_username" maxlength="20" autocomplete="off">
            </div>
            <button class="auth-submit-btn" id="username-submit">Confirmar</button>
          </div>
          <div class="auth-toggle">
            <button class="auth-toggle-link" id="username-skip">Escolher depois</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const submit = async () => {
        const input = overlay.querySelector('#username-input');
        const errorEl = overlay.querySelector('#username-error');
        const username = input.value.trim();

        const check = Validators.username(username);
        if (!check.ok) {
          errorEl.textContent = check.error;
          errorEl.classList.add('visible');
          return;
        }

        const result = await this._auth.updateUsername(username);
        if (!result.success) {
          errorEl.textContent = result.error;
          errorEl.classList.add('visible');
          return;
        }

        overlay.remove();
        resolve(username);
      };

      overlay.querySelector('#username-submit').addEventListener('click', submit);
      overlay.querySelector('#username-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
      });
      overlay.querySelector('#username-skip').addEventListener('click', () => {
        overlay.remove();
        resolve(null);
      });
    });
  }

  /** @private */
  _renderModal() {
    const overlay = document.createElement('div');
    overlay.className = 'auth-modal-overlay';

    const title = this._isSignup ? 'Criar conta' : 'Entrar';
    const subtitle = this._isSignup ? 'Salve seu progresso e compete com amigos' : 'Acesse sua conta';
    const submitText = this._isSignup ? 'Criar conta' : 'Entrar';
    const toggleText = this._isSignup ? 'Já tem conta?' : 'Não tem conta?';
    const toggleAction = this._isSignup ? 'Entrar' : 'Criar conta';

    const usernameField = this._isSignup ? `
      <div class="auth-field">
        <label for="auth-username">Nome de usuário</label>
        <input type="text" id="auth-username" placeholder="meu_username" maxlength="20" autocomplete="off">
      </div>
    ` : '';

    const forgotLink = !this._isSignup ? `
      <button class="auth-forgot" id="auth-forgot">Esqueci minha senha</button>
    ` : '';

    overlay.innerHTML = `
      <div class="auth-modal">
        <div class="auth-modal-header">
          <h2 class="auth-modal-title">${title}</h2>
          <p class="auth-modal-subtitle">${subtitle}</p>
        </div>
        <div class="auth-modal-body">
          <div class="auth-error" id="auth-error"></div>
          ${usernameField}
          <div class="auth-field">
            <label for="auth-email">Email</label>
            <input type="email" id="auth-email" placeholder="seu@email.com" autocomplete="email">
          </div>
          <div class="auth-field">
            <label for="auth-password">Senha</label>
            <input type="password" id="auth-password" placeholder="Mínimo 6 caracteres" autocomplete="${this._isSignup ? 'new-password' : 'current-password'}">
          </div>
          ${forgotLink}
          <button class="auth-submit-btn" id="auth-submit">${submitText}</button>
          <div class="auth-divider">ou</div>
          <button class="auth-google-btn" id="auth-google">
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Entrar com Google
          </button>
        </div>
        <div class="auth-toggle">
          ${toggleText} <button class="auth-toggle-link" id="auth-toggle">${toggleAction}</button>
        </div>
        <button class="auth-skip-btn" id="auth-skip">Continuar sem conta</button>
      </div>
    `;

    // Close on overlay click (not modal)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.hideLoginModal();
    });

    document.body.appendChild(overlay);
    this._modalEl = overlay;

    // Wire up events
    this._modalEl.querySelector('#auth-submit').addEventListener('click', () => this._handleSubmit());
    this._modalEl.querySelector('#auth-google').addEventListener('click', () => this._handleGoogle());
    this._modalEl.querySelector('#auth-toggle').addEventListener('click', () => {
      this.hideLoginModal();
      this._isSignup = !this._isSignup;
      this._renderModal();
    });
    this._modalEl.querySelector('#auth-skip').addEventListener('click', () => this.hideLoginModal());

    const forgotBtn = this._modalEl.querySelector('#auth-forgot');
    if (forgotBtn) {
      forgotBtn.addEventListener('click', () => this._handleForgotPassword());
    }

    // Enter key submits
    this._modalEl.querySelectorAll('input').forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this._handleSubmit();
      });
    });

    // Focus first input
    const firstInput = this._modalEl.querySelector(this._isSignup ? '#auth-username' : '#auth-email');
    setTimeout(() => firstInput?.focus(), 100);
  }

  /** @private */
  async _handleSubmit() {
    if (this._isLoading) return;

    const errorEl = this._modalEl.querySelector('#auth-error');
    const submitBtn = this._modalEl.querySelector('#auth-submit');
    const email = this._modalEl.querySelector('#auth-email')?.value || '';
    const password = this._modalEl.querySelector('#auth-password')?.value || '';

    this._setLoading(true, submitBtn);
    errorEl.classList.remove('visible');

    let result;
    if (this._isSignup) {
      const username = this._modalEl.querySelector('#auth-username')?.value || '';
      result = await this._auth.signUp(email, password, username);
    } else {
      result = await this._auth.signIn(email, password);
    }

    this._setLoading(false, submitBtn);

    if (result.success) {
      this.hideLoginModal();
      this.updateHeaderState();
      if (typeof showToast === 'function') {
        showToast(`Bem-vindo, ${escapeHtml(result.user?.username || '')}!`, 'success');
      }
    } else {
      errorEl.textContent = result.error;
      errorEl.classList.add('visible');
    }
  }

  /** @private */
  async _handleGoogle() {
    await this._auth.signInWithGoogle();
    // Redirect happens — no further action needed
  }

  /** @private */
  async _handleForgotPassword() {
    const email = this._modalEl.querySelector('#auth-email')?.value || '';
    const errorEl = this._modalEl.querySelector('#auth-error');

    if (!email.trim()) {
      errorEl.textContent = 'Digite seu email acima primeiro';
      errorEl.classList.add('visible');
      return;
    }

    const result = await this._auth.resetPassword(email);
    if (result.success) {
      errorEl.style.background = 'rgba(34, 197, 94, 0.1)';
      errorEl.style.color = 'var(--success-color, #22c55e)';
      errorEl.textContent = 'Email de recuperação enviado! Verifique sua caixa de entrada.';
      errorEl.classList.add('visible');
    } else {
      errorEl.textContent = result.error;
      errorEl.classList.add('visible');
    }
  }

  /** @private */
  _setLoading(loading, btn) {
    this._isLoading = loading;
    if (btn) {
      btn.disabled = loading;
      if (loading) {
        btn.dataset.originalText = btn.textContent;
        btn.innerHTML = '<span class="auth-spinner"></span> Aguarde...';
      } else {
        btn.textContent = btn.dataset.originalText || 'Entrar';
      }
    }
  }

  /** @private */
  _toggleDropdown() {
    if (this._dropdownEl) {
      this._hideDropdown();
    } else {
      this._showDropdown();
    }
  }

  /** @private */
  _showDropdown() {
    const container = document.querySelector('.auth-header-container');
    if (!container) return;

    const user = this._auth.getUser();
    const dropdown = document.createElement('div');
    dropdown.className = 'auth-dropdown';
    dropdown.innerHTML = `
      <div class="auth-dropdown-header">
        <div class="auth-dropdown-username">${escapeHtml(user?.username || '')}</div>
        <div class="auth-dropdown-email">${escapeHtml(user?.email || '')}</div>
      </div>
      <button class="auth-dropdown-item" data-action="sync">
        <i data-lucide="refresh-cw" style="width:16px;height:16px;"></i>
        Sincronizar agora
      </button>
      <button class="auth-dropdown-item auth-dropdown-item--danger" data-action="logout">
        <i data-lucide="log-out" style="width:16px;height:16px;"></i>
        Sair
      </button>
    `;

    container.appendChild(dropdown);
    this._dropdownEl = dropdown;

    if (window.lucide) window.lucide.createIcons();

    dropdown.querySelector('[data-action="sync"]').addEventListener('click', () => {
      this._hideDropdown();
      if (window.syncManager) {
        window.syncManager.fullSync().then(() => {
          if (typeof showToast === 'function') showToast('Sincronizado!', 'success');
        });
      }
    });

    dropdown.querySelector('[data-action="logout"]').addEventListener('click', async () => {
      this._hideDropdown();
      await this._auth.signOut();
      this.updateHeaderState();
      if (typeof showToast === 'function') showToast('Desconectado', 'info');
    });
  }

  /** @private */
  _hideDropdown() {
    if (this._dropdownEl) {
      this._dropdownEl.remove();
      this._dropdownEl = null;
    }
  }
}

window.AuthUI = AuthUI;
