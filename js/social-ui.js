/**
 * SocialUI — renders leaderboard, friends list, and friend search modal.
 * Uses string HTML + event delegation pattern consistent with existing codebase.
 */

class SocialUI {
  /**
   * @param {SocialManager} socialManager
   * @param {AuthManager} authManager
   */
  constructor(socialManager, authManager) {
    this._social = socialManager;
    this._auth = authManager;
    this._log = Logger.create('SocialUI');
    this._currentTab = 'ranking';
    this._currentMetric = 'weekly_xp';
    this._currentScope = 'friends';
    this._searchDebounce = null;
  }

  /**
   * Render the full social view.
   * @param {string} containerId
   */
  async render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Login gate
    if (!this._auth || this._auth.isGuest()) {
      container.innerHTML = `
        <div class="social-login-gate">
          <div class="social-empty-icon"><i data-lucide="trophy" style="width:48px;height:48px;"></i></div>
          <p class="social-login-gate-text">Faça login para ver o ranking e adicionar amigos</p>
          <button class="social-login-gate-btn" id="social-login-btn">Entrar</button>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      container.querySelector('#social-login-btn')?.addEventListener('click', () => {
        if (window.authUI) window.authUI.showLoginModal();
      });
      return;
    }

    container.innerHTML = `
      <div class="social-tabs">
        <button class="social-tab ${this._currentTab === 'ranking' ? 'active' : ''}" data-tab="ranking">Ranking</button>
        <button class="social-tab ${this._currentTab === 'friends' ? 'active' : ''}" data-tab="friends">Amigos</button>
      </div>
      <div id="social-tab-content"></div>
      <button class="social-add-btn" id="social-add-friend-btn" title="Adicionar amigo">+</button>
    `;

    // Tab switching
    container.querySelectorAll('.social-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this._currentTab = tab.dataset.tab;
        this.render(containerId);
      });
    });

    // Add friend button
    container.querySelector('#social-add-friend-btn')?.addEventListener('click', () => {
      this._showAddFriendModal();
    });

    if (this._currentTab === 'ranking') {
      await this._renderLeaderboard(container.querySelector('#social-tab-content'));
    } else {
      await this._renderFriendsList(container.querySelector('#social-tab-content'));
    }
  }

  /** @private */
  async _renderLeaderboard(container) {
    if (!container) return;

    const metricLabels = {
      weekly_xp: 'XP Semanal',
      total_xp: 'XP Total',
      streak: 'Streak',
      expedition: 'Expedição'
    };

    container.innerHTML = `
      <div class="social-subtabs">
        ${Object.entries(metricLabels).map(([key, label]) =>
          `<button class="social-subtab ${this._currentMetric === key ? 'active' : ''}" data-metric="${key}">${label}</button>`
        ).join('')}
      </div>
      <div class="social-scope-toggle">
        <button class="social-scope-btn ${this._currentScope === 'friends' ? 'active' : ''}" data-scope="friends">Amigos</button>
        <button class="social-scope-btn ${this._currentScope === 'global' ? 'active' : ''}" data-scope="global">Global</button>
      </div>
      <div id="leaderboard-content"><p class="social-empty-text">Carregando...</p></div>
    `;

    // Wire metric tabs
    container.querySelectorAll('.social-subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        this._currentMetric = btn.dataset.metric;
        this._renderLeaderboard(container);
      });
    });

    // Wire scope toggle
    container.querySelectorAll('.social-scope-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._currentScope = btn.dataset.scope;
        this._renderLeaderboard(container);
      });
    });

    // Fetch and render data
    try {
      const entries = await this._social.getLeaderboard(this._currentMetric, this._currentScope);
      const content = container.querySelector('#leaderboard-content');

      if (!entries || entries.length === 0) {
        content.innerHTML = `
          <div class="social-empty">
            <div class="social-empty-icon"><i data-lucide="trophy" style="width:40px;height:40px;"></i></div>
            <p class="social-empty-text">Nenhum dado ainda. Comece a estudar!</p>
          </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
      }

      const unitMap = { weekly_xp: 'XP', total_xp: 'XP', streak: 'dias', expedition: 'andar' };
      const unit = unitMap[this._currentMetric] || '';

      content.innerHTML = `
        <div class="leaderboard-list">
          ${entries.map(e => {
            const initial = escapeHtml((e.username || '?')[0].toUpperCase());
            const rankClass = e.rank <= 3 ? `leaderboard-rank--${e.rank}` : '';
            const selfClass = e.is_self ? 'leaderboard-entry--self' : '';

            return `
              <div class="leaderboard-entry ${selfClass}">
                <span class="leaderboard-rank ${rankClass}">${e.rank}</span>
                <div class="leaderboard-avatar">${initial}</div>
                <div class="leaderboard-info">
                  <div class="leaderboard-username">${escapeHtml(e.username || '')}</div>
                  <div class="leaderboard-level">Nível ${e.level || 0}</div>
                </div>
                <span class="leaderboard-value">${e.value || 0} ${unit}</span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } catch (e) {
      this._log.error('Leaderboard render failed:', e);
      const content = container.querySelector('#leaderboard-content');
      content.innerHTML = `<p class="social-empty-text">Erro ao carregar ranking</p>`;
    }
  }

  /** @private */
  async _renderFriendsList(container) {
    if (!container) return;

    container.innerHTML = '<p class="social-empty-text">Carregando...</p>';

    try {
      const [friends, pending] = await Promise.all([
        this._social.getFriends(),
        this._social.getPendingRequests()
      ]);

      let html = '';

      if (pending.length > 0) {
        html += `<div class="friends-section-title">Pedidos pendentes (${pending.length})</div>`;
        html += pending.map(p => `
          <div class="friend-card">
            <div class="leaderboard-avatar">${escapeHtml((p.username || '?')[0].toUpperCase())}</div>
            <div class="leaderboard-info">
              <div class="leaderboard-username">${escapeHtml(p.username || '')}</div>
              <div class="leaderboard-level">${escapeHtml(p.display_name || '')}</div>
            </div>
            <div class="friend-actions">
              <button class="friend-action-btn friend-action-btn--accept" data-action="accept" data-id="${p.friendship_id}">Aceitar</button>
              <button class="friend-action-btn friend-action-btn--decline" data-action="decline" data-id="${p.friendship_id}">Recusar</button>
            </div>
          </div>
        `).join('');
      }

      if (friends.length > 0) {
        html += `<div class="friends-section-title">Meus amigos (${friends.length})</div>`;
        html += friends.map(f => `
          <div class="friend-card">
            <div class="leaderboard-avatar">${escapeHtml((f.username || '?')[0].toUpperCase())}</div>
            <div class="leaderboard-info">
              <div class="leaderboard-username">${escapeHtml(f.username || '')}</div>
              <div class="leaderboard-level">${escapeHtml(f.display_name || '')}</div>
            </div>
            <div class="friend-actions">
              <button class="friend-action-btn friend-action-btn--remove" data-action="remove" data-uid="${f.user_id}">Remover</button>
            </div>
          </div>
        `).join('');
      }

      if (friends.length === 0 && pending.length === 0) {
        html = `
          <div class="social-empty">
            <div class="social-empty-icon"><i data-lucide="users" style="width:40px;height:40px;"></i></div>
            <p class="social-empty-text">Nenhum amigo ainda. Adicione amigos para competir!</p>
          </div>
        `;
      }

      container.innerHTML = html;
      if (window.lucide) window.lucide.createIcons();

      // Wire action buttons
      container.querySelectorAll('[data-action="accept"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const result = await this._social.respondToRequest(btn.dataset.id, true);
          if (result.success) {
            if (typeof showToast === 'function') showToast('Amigo adicionado!', 'success');
            this._renderFriendsList(container);
          } else {
            if (typeof showToast === 'function') showToast(result.error, 'error');
          }
        });
      });

      container.querySelectorAll('[data-action="decline"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          await this._social.respondToRequest(btn.dataset.id, false);
          this._renderFriendsList(container);
        });
      });

      container.querySelectorAll('[data-action="remove"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const result = await this._social.removeFriend(btn.dataset.uid);
          if (result.success) {
            if (typeof showToast === 'function') showToast('Amigo removido', 'info');
            this._renderFriendsList(container);
          }
        });
      });
    } catch (e) {
      this._log.error('Friends list render failed:', e);
      container.innerHTML = `<p class="social-empty-text">Erro ao carregar amigos</p>`;
    }
  }

  /** @private */
  _showAddFriendModal() {
    const overlay = document.createElement('div');
    overlay.className = 'auth-modal-overlay';
    overlay.innerHTML = `
      <div class="auth-modal">
        <div class="auth-modal-header">
          <h2 class="auth-modal-title">Adicionar amigo</h2>
          <p class="auth-modal-subtitle">Busque por nome de usuário</p>
        </div>
        <div class="auth-modal-body">
          <input type="text" class="social-search-input" id="friend-search-input" placeholder="Username (min. 2 caracteres)" autocomplete="off">
          <div class="social-search-results" id="friend-search-results"></div>
        </div>
        <button class="auth-skip-btn" id="friend-search-close">Fechar</button>
      </div>
    `;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);

    overlay.querySelector('#friend-search-close').addEventListener('click', () => overlay.remove());

    const input = overlay.querySelector('#friend-search-input');
    const results = overlay.querySelector('#friend-search-results');

    input.addEventListener('input', () => {
      if (this._searchDebounce) clearTimeout(this._searchDebounce);
      const query = input.value.trim();

      if (query.length < 2) {
        results.innerHTML = '';
        return;
      }

      this._searchDebounce = setTimeout(async () => {
        const users = await this._social.searchUsers(query);

        if (users.length === 0) {
          results.innerHTML = '<p class="social-empty-text">Nenhum usuário encontrado</p>';
          return;
        }

        results.innerHTML = users.map(u => `
          <div class="social-search-result">
            <div class="leaderboard-avatar">${escapeHtml((u.username || '?')[0].toUpperCase())}</div>
            <div class="leaderboard-info">
              <div class="leaderboard-username">${escapeHtml(u.username || '')}</div>
              <div class="leaderboard-level">${escapeHtml(u.display_name || '')}</div>
            </div>
            <button class="social-search-add-btn" data-uid="${u.id}">Adicionar</button>
          </div>
        `).join('');

        results.querySelectorAll('.social-search-add-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.textContent = 'Enviando...';
            const result = await this._social.sendFriendRequest(btn.dataset.uid);
            if (result.success) {
              btn.textContent = 'Enviado';
              if (typeof showToast === 'function') showToast('Solicitação enviada!', 'success');
            } else {
              btn.textContent = result.error;
              btn.disabled = false;
            }
          });
        });
      }, 300);
    });

    setTimeout(() => input.focus(), 100);
  }
}

window.SocialUI = SocialUI;
