/**
 * Expedition UI - English Training
 * Renders Hub, Map, Combat overlay, Event rooms, and Summary.
 * Loaded as classic script after expedition-engine.js.
 */

class ExpeditionUI {
  constructor(engine) {
    this.engine = engine;
    this._container = document.getElementById('expedition-content');
    this._subView = 'hub'; // hub | map | combat | event | summary
    this._pendingSummary = null;
    this._setupEventListeners();
  }

  // ═══════════════════════════════════════════
  // PUBLIC
  // ═══════════════════════════════════════════

  render() {
    if (!this._container) return;

    if (this.engine.hasStaleRun()) {
      this._renderHub(true);
      return;
    }

    if (this._pendingSummary) {
      this._renderSummary(this._pendingSummary);
      return;
    }

    if (this.engine.hasActiveRun()) {
      this._renderMap();
      return;
    }

    this._renderHub(false);
  }

  updateDashboardBadge() {
    const badge = document.getElementById('expedition-floor');
    if (badge && this.engine) {
      const profile = this.engine.getProfile();
      badge.textContent = 'Andar ' + profile.currentFloor;
    }
  }

  // ═══════════════════════════════════════════
  // HUB
  // ═══════════════════════════════════════════

  _renderHub(hasStale) {
    this._subView = 'hub';
    const profile = this.engine.getProfile();
    const EC = window.ExpeditionConstants;

    let staleHtml = '';
    if (hasStale) {
      const staleRun = this.engine.getStaleRun();
      const biome = EC.BIOMES[staleRun.biome];
      staleHtml = `
        <div class="expedition-stale-banner">
          <p><strong>Expedição interrompida</strong> — ${biome?.name || staleRun.biome}, Andar ${staleRun.floor}. ${staleRun.roomsCleared}/${staleRun.totalRooms} salas.</p>
          <div class="expedition-stale-actions">
            <button class="resume-btn" data-action="resume-stale">Retomar</button>
            <button data-action="abandon-stale">Abandonar</button>
          </div>
        </div>`;
    }

    // Classes
    let classesHtml = '';
    for (const [id, cls] of Object.entries(EC.CLASSES)) {
      const unlocked = profile.unlockedClasses.includes(id);
      const selected = (profile.activeClass || 'scholar') === id;
      const hearts = '♥'.repeat(cls.maxHearts);
      const lockText = !unlocked && cls.unlockCondition
        ? Object.entries(cls.unlockCondition).map(([k, v]) => `${k}: ${v}`).join(', ')
        : '';
      classesHtml += `
        <div class="expedition-class-card ${selected ? 'selected' : ''} ${!unlocked ? 'locked' : ''}"
             data-action="select-class" data-class="${id}" ${!unlocked ? 'title="' + lockText + '"' : ''}>
          <div class="expedition-class-name">${cls.name} <span class="expedition-class-hearts">${hearts}</span></div>
          <div class="expedition-class-desc">${cls.description}</div>
          ${!unlocked ? '<div class="expedition-class-lock">🔒 ' + lockText + '</div>' : ''}
        </div>`;
    }

    // Inventory
    let invHtml = '';
    if (profile.inventory.length > 0) {
      const items = profile.inventory.filter(s => s.count > 0).map(s => {
        const item = EC.ITEMS[s.id];
        if (!item) return '';
        return `<div class="expedition-inv-item">
          <i data-lucide="${item.icon}"></i>
          <span>${item.name}</span>
          <span class="expedition-inv-count">x${s.count}</span>
        </div>`;
      }).join('');
      invHtml = `<div class="expedition-inventory">
        <h4>Inventário</h4>
        <div class="expedition-inventory-grid">${items}</div>
      </div>`;
    }

    // Equipped relics (with equip/unequip)
    let relicsHtml = '';
    if (profile.unlockedRelics.length > 0) {
      const slots = [];
      for (let i = 0; i < EC.MAX_EQUIPPED_RELICS; i++) {
        const relicId = profile.equippedRelics[i];
        if (relicId && EC.RELICS[relicId]) {
          const relic = EC.RELICS[relicId];
          slots.push(`<div class="expedition-relic-slot filled" data-action="unequip-relic" data-relic="${relicId}" title="Clique para desequipar">
            <i data-lucide="${relic.icon}"></i> ${relic.name}
          </div>`);
        } else {
          slots.push(`<div class="expedition-relic-slot">Vazio</div>`);
        }
      }
      // Unequipped relics
      const unequipped = profile.unlockedRelics.filter(id => !profile.equippedRelics.includes(id));
      let unequippedHtml = '';
      if (unequipped.length > 0) {
        const unequippedItems = unequipped.map(id => {
          const relic = EC.RELICS[id];
          if (!relic) return '';
          const canEquip = profile.equippedRelics.length < EC.MAX_EQUIPPED_RELICS;
          return `<div class="expedition-relic-slot ${canEquip ? '' : 'locked'}" data-action="equip-relic" data-relic="${id}" title="${relic.description}">
            <i data-lucide="${relic.icon}"></i> ${relic.name}
          </div>`;
        }).join('');
        unequippedHtml = `<div style="margin-top:var(--space-2);font-size:var(--font-size-xs);color:var(--color-text-tertiary)">Disponíveis:</div>
          <div class="expedition-relics-list" style="margin-top:var(--space-1)">${unequippedItems}</div>`;
      }
      relicsHtml = `<div class="expedition-relics">
        <h4>Relíquias (${profile.equippedRelics.length}/${EC.MAX_EQUIPPED_RELICS})</h4>
        <div class="expedition-relics-list">${slots.join('')}</div>
        ${unequippedHtml}
      </div>`;
    }

    // Item Shop (buy items for inventory with coins)
    let shopHtml = '';
    if (profile.coins > 0 || profile.inventory.length > 0) {
      const itemEntries = Object.values(EC.ITEMS).map(item => {
        const owned = profile.inventory.find(s => s.id === item.id)?.count || 0;
        const canBuy = profile.coins >= item.shopPrice && owned < EC.MAX_INVENTORY_PER_ITEM;
        return `<div class="expedition-shop-item">
          <i data-lucide="${item.icon}"></i>
          <div class="expedition-shop-item-info">
            <div class="expedition-shop-item-name">${item.name} ${owned > 0 ? '<span class="expedition-inv-count">x' + owned + '</span>' : ''}</div>
            <div class="expedition-shop-item-desc">${item.description}</div>
          </div>
          <button class="expedition-shop-buy" data-action="buy-item" data-item="${item.id}" ${!canBuy ? 'disabled' : ''}>
            ${item.shopPrice}
          </button>
        </div>`;
      }).join('');
      shopHtml = `<details class="expedition-inventory">
        <summary style="cursor:pointer"><h4 style="display:inline">Loja de Itens</h4></summary>
        <div class="expedition-shop-grid" style="margin-top:var(--space-3)">${itemEntries}</div>
      </details>`;
    }

    // Upgrades Shop
    let upgradesHtml = '';
    const upgradeEntries = Object.values(EC.PERMANENT_UPGRADES).map(upg => {
      const level = profile.permanentUpgrades[upg.id] || 0;
      const maxed = level >= upg.maxLevel;
      const cost = maxed ? '—' : upg.costPerLevel[level];
      const canBuy = !maxed && profile.coins >= upg.costPerLevel[level];
      const value = maxed ? upg.valuePerLevel[upg.maxLevel - 1] : upg.valuePerLevel[level];
      const valueDisplay = typeof value === 'number' && value < 1 ? Math.round(value * 100) + '%' : value;
      return `<div class="expedition-shop-item">
        <div class="expedition-shop-item-info">
          <div class="expedition-shop-item-name">${upg.name} <span style="color:var(--color-accent)">${'★'.repeat(level)}${'☆'.repeat(upg.maxLevel - level)}</span></div>
          <div class="expedition-shop-item-desc">${upg.description} (${maxed ? 'MAX' : valueDisplay})</div>
        </div>
        <button class="expedition-shop-buy" data-action="buy-upgrade" data-upgrade="${upg.id}" ${!canBuy ? 'disabled' : ''}>
          ${maxed ? 'MAX' : cost}
        </button>
      </div>`;
    }).join('');
    upgradesHtml = `<details class="expedition-inventory">
      <summary style="cursor:pointer"><h4 style="display:inline">Upgrades Permanentes</h4></summary>
      <div class="expedition-shop-grid" style="margin-top:var(--space-3)">${upgradeEntries}</div>
    </details>`;

    // Biome preview
    const biomeKeys = Object.keys(EC.BIOMES);
    const nextBiome = EC.BIOMES[biomeKeys[profile.currentFloor % biomeKeys.length]] || EC.BIOMES[biomeKeys[0]];

    this._container.innerHTML = `
      <div class="expedition-hub">
        ${staleHtml}
        <div class="expedition-hub-header">
          <h3>Expedição Literária</h3>
          <div class="expedition-coins"><i data-lucide="coins"></i> ${profile.coins}</div>
        </div>

        <div class="expedition-stats-row">
          <div class="expedition-stat">
            <div class="expedition-stat-value">${profile.currentFloor}</div>
            <div class="expedition-stat-label">Andar</div>
          </div>
          <div class="expedition-stat">
            <div class="expedition-stat-value">${profile.totalRuns}</div>
            <div class="expedition-stat-label">Expedições</div>
          </div>
          <div class="expedition-stat">
            <div class="expedition-stat-value">${profile.statistics.bossesDefeated}</div>
            <div class="expedition-stat-label">Bosses</div>
          </div>
        </div>

        <div class="expedition-classes-grid">${classesHtml}</div>

        ${invHtml}
        ${relicsHtml}
        ${shopHtml}
        ${upgradesHtml}

        <button class="expedition-start-btn" data-action="start-run" ${hasStale ? 'disabled' : ''}>
          Iniciar Expedição
          <span class="expedition-start-sub">Andar ${profile.currentFloor} — ${nextBiome.name}</span>
        </button>
      </div>`;

    this._refreshIcons();
  }

  // ═══════════════════════════════════════════
  // MAP
  // ═══════════════════════════════════════════

  _renderMap() {
    this._subView = 'map';
    const run = this.engine.getActiveRun();
    if (!run) return this._renderHub(false);

    const EC = window.ExpeditionConstants;
    const biome = EC.BIOMES[run.biome] || { name: run.biome, icon: 'map', color: '#888' };

    // Hearts
    let heartsHtml = '';
    for (let i = 0; i < run.maxHearts; i++) {
      const cls = i < run.currentHearts ? '' : 'lost';
      heartsHtml += `<i data-lucide="heart" class="expedition-heart ${cls}"></i>`;
    }

    // Room nodes
    let roomsHtml = '';
    const nextRoom = run.rooms.findIndex(r => r.result === null);

    for (let i = 0; i < run.rooms.length; i++) {
      const room = run.rooms[i];
      const isCurrent = i === nextRoom;
      const isCleared = room.result !== null;
      const isLocked = i > nextRoom;

      let nodeClass = '';
      if (isCleared) nodeClass = 'cleared';
      else if (isCurrent) nodeClass = 'current';
      else if (isLocked) nodeClass = 'locked';

      const iconName = this._getRoomIcon(room.type);
      const typeName = this._getRoomTypeName(room.type);
      const iconColor = `room-icon-${room.type}`;

      let resultHtml = '';
      if (isCleared && room.result === 'correct') {
        resultHtml = '<span class="expedition-room-result correct">✓</span>';
      } else if (isCleared && room.result === 'incorrect') {
        resultHtml = '<span class="expedition-room-result incorrect">✗</span>';
      } else if (isCleared) {
        resultHtml = '<span class="expedition-room-result">✓</span>';
      }

      // Add connector before (not first)
      if (i > 0) {
        const connCleared = run.rooms[i - 1].result !== null ? 'cleared' : '';
        roomsHtml += `<div class="expedition-room-connector ${connCleared}"></div>`;
      }

      roomsHtml += `
        <div class="expedition-room-node ${nodeClass}" data-room-index="${i}" ${isCurrent ? 'data-action="enter-room"' : ''}>
          <div class="expedition-room-icon ${iconColor}"><i data-lucide="${iconName}"></i></div>
          <div class="expedition-room-info">
            <div class="expedition-room-type">${typeName}</div>
            <div class="expedition-room-detail">Sala ${i + 1}/${run.totalRooms}</div>
          </div>
          ${resultHtml}
        </div>`;
    }

    this._container.innerHTML = `
      <div class="expedition-map">
        <div class="expedition-map-header">
          <h3>Andar ${run.floor}</h3>
          <div class="expedition-hearts">${heartsHtml}</div>
        </div>
        <div class="expedition-map-info">
          <div class="expedition-map-biome" style="color:${biome.color}">
            <i data-lucide="${biome.icon}"></i> ${biome.name}
          </div>
          <div class="expedition-coins"><i data-lucide="coins"></i> ${run.totalCoins}</div>
        </div>
        <div class="expedition-rooms">${roomsHtml}</div>
        <div style="text-align:center;margin-top:var(--space-4)">
          <button data-action="abandon-run" style="font-size:var(--font-size-xs);color:var(--color-text-tertiary);background:none;border:none;cursor:pointer;text-decoration:underline">Abandonar expedição</button>
        </div>
      </div>`;

    this._refreshIcons();

    // Scroll current room into view
    const currentNode = this._container.querySelector('.expedition-room-node.current');
    if (currentNode) {
      currentNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  // ═══════════════════════════════════════════
  // COMBAT (delegates to study view)
  // ═══════════════════════════════════════════

  async _enterCombatRoom(roomIndex) {
    const ctx = await this.engine.enterRoom(roomIndex);
    const run = this.engine.getActiveRun();
    const room = run.rooms[roomIndex];
    this._prevHearts = run.currentHearts; // capture for damage flash

    if (['combat', 'elite', 'boss'].includes(room.type)) {
      if (!ctx.question || !ctx.passage) {
        // No question available — auto-clear as correct
        await this.engine.processEvent('skip');
        this._renderMap();
        return;
      }

      // Load passage+question into the existing study UI
      this._showCombatOverlay(run, room);
      this._loadQuestionIntoStudyUI(ctx.passage, ctx.question);
    } else {
      // Non-combat room: show event UI
      this._renderEventRoom(room, ctx);
    }
  }

  _showCombatOverlay(run, room) {
    this._subView = 'combat';
    const EC = window.ExpeditionConstants;

    // Build items bar
    let itemsHtml = '';
    for (const slot of run.activeItems) {
      if (slot.count <= 0) continue;
      const item = EC.ITEMS[slot.id];
      if (!item || item.effect === 'block_damage') continue; // shield is auto, xp_boost is passive
      itemsHtml += `<button class="expedition-item-btn" data-action="use-item" data-item="${slot.id}">
        <i data-lucide="${item.icon}"></i> <span class="item-count">${slot.count}</span>
      </button>`;
    }

    // Hearts
    let heartsHtml = '';
    for (let i = 0; i < run.maxHearts; i++) {
      heartsHtml += `<i data-lucide="heart" class="expedition-heart ${i < run.currentHearts ? '' : 'lost'}"></i>`;
    }

    // Insert combat bar above study view
    let combatBar = document.getElementById('expedition-combat-bar');
    if (!combatBar) {
      combatBar = document.createElement('div');
      combatBar.id = 'expedition-combat-bar';
      combatBar.className = 'expedition-combat-bar';
      const studySection = document.getElementById('study');
      if (studySection) studySection.prepend(combatBar);
    }

    const typeName = this._getRoomTypeName(room.type);
    combatBar.innerHTML = `
      <div class="expedition-combat-info">
        <span class="expedition-combat-room-label">${typeName} ${room.index + 1}/${run.totalRooms}</span>
        <div class="expedition-hearts">${heartsHtml}</div>
        <div class="expedition-coins"><i data-lucide="coins"></i> ${run.totalCoins}</div>
      </div>
      <div class="expedition-combat-items">${itemsHtml}</div>`;

    this._refreshIcons();

    // Switch to study view
    window.location.hash = '#/study';
  }

  _loadQuestionIntoStudyUI(passage, question) {
    // Reuse existing loadPassageIntoUI from app.js
    const state = window.state;
    state.currentPassage = {
      ...passage,
      questions: [question] // Only show 1 question per room
    };
    state.currentQuestionIndex = 0;

    if (typeof window._loadPassageIntoUI === 'function') {
      window._loadPassageIntoUI(state.currentPassage);
    }
  }

  _removeCombatOverlay() {
    const bar = document.getElementById('expedition-combat-bar');
    if (bar) bar.remove();
  }

  // ═══════════════════════════════════════════
  // EVENT ROOMS
  // ═══════════════════════════════════════════

  _renderEventRoom(room, ctx) {
    this._subView = 'event';
    const EC = window.ExpeditionConstants;

    if (room.type === 'treasure') {
      const item = ctx.event?.item;
      this._container.innerHTML = `
        <div class="expedition-event">
          <div class="expedition-event-icon room-icon-treasure"><i data-lucide="gem"></i></div>
          <h3>Tesouro!</h3>
          <p>Voce encontrou: <strong>${item?.name || 'Recompensa'}</strong></p>
          <p>${item?.description || ''}</p>
          <div class="expedition-event-choices">
            <button class="primary" data-action="process-event" data-choice="collect">Coletar</button>
          </div>
        </div>`;
    } else if (room.type === 'shop') {
      let shopHtml = '';
      const run = this.engine.getActiveRun();
      for (const item of (ctx.shopItems || [])) {
        const canAfford = run.totalCoins >= item.currentPrice;
        shopHtml += `
          <div class="expedition-shop-item">
            <i data-lucide="${item.icon}"></i>
            <div class="expedition-shop-item-info">
              <div class="expedition-shop-item-name">${item.name}</div>
              <div class="expedition-shop-item-desc">${item.description}</div>
            </div>
            <button class="expedition-shop-buy" data-action="process-event" data-choice="buy:${item.id}" ${!canAfford ? 'disabled' : ''}>
              <i data-lucide="coins" style="width:14px;height:14px;display:inline"></i> ${item.currentPrice}
            </button>
          </div>`;
      }
      this._container.innerHTML = `
        <div class="expedition-event">
          <div class="expedition-event-icon room-icon-shop"><i data-lucide="store"></i></div>
          <h3>Loja</h3>
          <p>Moedas: ${run.totalCoins}</p>
          <div class="expedition-shop-grid">${shopHtml}</div>
          <div class="expedition-event-choices" style="margin-top:var(--space-4)">
            <button class="primary" data-action="process-event" data-choice="leave">Sair da Loja</button>
          </div>
        </div>`;
    } else if (room.type === 'rest') {
      const run = this.engine.getActiveRun();
      const canHeal = run.currentHearts < run.maxHearts;
      this._container.innerHTML = `
        <div class="expedition-event">
          <div class="expedition-event-icon room-icon-rest"><i data-lucide="flame"></i></div>
          <h3>Fogueira</h3>
          <p>Descanse um pouco. Escolha sua recompensa:</p>
          <div class="expedition-event-choices">
            <button class="primary" data-action="process-event" data-choice="heal" ${!canHeal ? 'disabled title="Vida cheia"' : ''}>
              ♥ Curar
            </button>
            <button data-action="process-event" data-choice="buff">
              🎒 Item
            </button>
          </div>
        </div>`;
    } else if (room.type === 'mystery') {
      const event = ctx.event || {};

      // Combat-based mystery events: show description then load question
      if ((event.type === 'combat_gamble' || event.type === 'ambush') && ctx.question && ctx.passage) {
        this._container.innerHTML = `
          <div class="expedition-event">
            <div class="expedition-event-icon room-icon-mystery"><i data-lucide="help-circle"></i></div>
            <h3>${event.name || 'Mistério'}</h3>
            <p>${event.description || ''}</p>
            <div class="expedition-event-choices">
              <button class="primary" data-action="mystery-combat">Enfrentar!</button>
            </div>
          </div>`;
        // Store context for the combat trigger
        this._pendingMysteryCtx = ctx;
      } else {
        let choicesHtml = '';
        if (event.type === 'trade') {
          choicesHtml = `
            <button class="primary" data-action="process-event" data-choice="accept">Aceitar</button>
            <button data-action="process-event" data-choice="decline">Recusar</button>`;
        } else if (event.type === 'windfall') {
          choicesHtml = `<button class="primary" data-action="process-event" data-choice="collect">Pegar!</button>`;
        } else {
          choicesHtml = `<button class="primary" data-action="process-event" data-choice="continue">Continuar</button>`;
        }
        this._container.innerHTML = `
          <div class="expedition-event">
            <div class="expedition-event-icon room-icon-mystery"><i data-lucide="help-circle"></i></div>
            <h3>${event.name || 'Mistério'}</h3>
            <p>${event.description || 'Algo inesperado aconteceu...'}</p>
            <div class="expedition-event-choices">${choicesHtml}</div>
          </div>`;
      }
    }

    this._refreshIcons();
  }

  // ═══════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════

  _renderSummary(summary) {
    this._subView = 'summary';
    const EC = window.ExpeditionConstants;

    const titleMap = {
      completed: 'Expedição Completa!',
      defeated: 'Derrota...',
      abandoned: 'Expedição Abandonada'
    };
    const biome = EC.BIOMES[summary.biome];

    let lootHtml = `
      <div class="expedition-summary-loot-item xp"><i data-lucide="sparkles"></i> +${summary.totalXP} XP</div>
      <div class="expedition-summary-loot-item coins"><i data-lucide="coins"></i> +${summary.totalCoins} Moedas</div>`;

    if (summary.relicGained) {
      const relic = EC.RELICS[summary.relicGained];
      if (relic) {
        lootHtml += `<div class="expedition-summary-loot-item relic"><i data-lucide="${relic.icon}"></i> ${relic.name}</div>`;
      }
    }

    this._container.innerHTML = `
      <div class="expedition-summary">
        <div class="expedition-summary-title ${summary.status}">${titleMap[summary.status] || 'Fim'}</div>
        <div class="expedition-summary-subtitle">${biome?.name || summary.biome} — Andar ${summary.floor}</div>

        <div class="expedition-summary-stats">
          <div class="expedition-summary-stat">
            <div class="expedition-summary-stat-value">${summary.roomsCleared}/${summary.totalRooms}</div>
            <div class="expedition-summary-stat-label">Salas</div>
          </div>
          <div class="expedition-summary-stat">
            <div class="expedition-summary-stat-value">${summary.accuracy}%</div>
            <div class="expedition-summary-stat-label">Precisão</div>
          </div>
          <div class="expedition-summary-stat">
            <div class="expedition-summary-stat-value">${summary.correctAnswers}/${summary.totalCombatRooms}</div>
            <div class="expedition-summary-stat-label">Corretas</div>
          </div>
          <div class="expedition-summary-stat">
            <div class="expedition-summary-stat-value">${summary.heartsRemaining}</div>
            <div class="expedition-summary-stat-label">♥ Restantes</div>
          </div>
        </div>

        <div class="expedition-summary-loot">
          <h4>Recompensas</h4>
          ${lootHtml}
        </div>

        <div class="expedition-summary-actions">
          <button data-action="back-to-hub">Voltar</button>
          <button class="primary" data-action="new-run">Nova Expedição</button>
        </div>
      </div>`;

    this._refreshIcons();
  }

  // ═══════════════════════════════════════════
  // EVENT LISTENERS
  // ═══════════════════════════════════════════

  _setupEventListeners() {
    // Dashboard button
    document.getElementById('btn-expedition')?.addEventListener('click', () => {
      window.location.hash = '#/expedition';
    });

    // Delegated click handler for expedition view
    this._container?.addEventListener('click', async (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;

      const action = target.dataset.action;

      if (action === 'start-run') {
        await this._handleStartRun();
      } else if (action === 'select-class') {
        this._handleSelectClass(target.dataset.class);
      } else if (action === 'enter-room') {
        const idx = parseInt(target.dataset.roomIndex);
        await this._enterCombatRoom(idx);
      } else if (action === 'abandon-run') {
        await this._handleAbandonRun();
      } else if (action === 'resume-stale') {
        await this.engine.resumeStaleRun();
        this._renderMap();
      } else if (action === 'abandon-stale') {
        await this.engine.abandonStaleRun();
        this._renderHub(false);
      } else if (action === 'mystery-combat') {
        await this._handleMysteryCombat();
      } else if (action === 'process-event') {
        await this._handleProcessEvent(target.dataset.choice);
      } else if (action === 'use-item') {
        await this._handleUseItem(target.dataset.item);
      } else if (action === 'equip-relic') {
        await this._handleEquipRelic(target.dataset.relic);
      } else if (action === 'unequip-relic') {
        await this._handleUnequipRelic(target.dataset.relic);
      } else if (action === 'buy-item') {
        await this._handleBuyItem(target.dataset.item);
      } else if (action === 'buy-upgrade') {
        await this._handleBuyUpgrade(target.dataset.upgrade);
      } else if (action === 'back-to-hub') {
        this._pendingSummary = null;
        this._renderHub(false);
      } else if (action === 'new-run') {
        this._pendingSummary = null;
        await this._handleStartRun();
      }
    });

    // Listen for expedition events from engine
    document.addEventListener('expedition:room_complete', (e) => {
      const detail = e.detail;

      // Coin popup
      if (detail.coinsAwarded > 0) {
        this._showCoinPopup(detail.coinsAwarded);
      }

      // Damage flash
      const tookDamage = detail.shieldConsumed || detail.relicBlocked
        ? false
        : !detail.isCorrect && detail.heartsRemaining < (this._prevHearts || 999);
      if (tookDamage) {
        document.body.classList.add('expedition-damage-flash');
        setTimeout(() => document.body.classList.remove('expedition-damage-flash'), 400);
      }

      if (detail.isGameOver) return;

      // After combat room completes, return to map
      if (this._subView === 'combat') {
        this._removeCombatOverlay();
        const delay = tookDamage ? 500 : 100;
        setTimeout(() => {
          window.location.hash = '#/expedition';
          setTimeout(() => this._renderMap(), 100);
        }, delay);
      }
    });

    document.addEventListener('expedition:run_end', (e) => {
      this._removeCombatOverlay();
      this._pendingSummary = e.detail.summary;
      window.location.hash = '#/expedition';
      setTimeout(() => this._renderSummary(e.detail.summary), 100);
    });

    // Listen for question:answered to advance expedition after answer
    document.addEventListener('question:answered', async (e) => {
      if (!this.engine.hasActiveRun() || this._subView !== 'combat') return;
      const { selectedAnswer, isCorrect, confidence } = e.detail || {};
      if (!selectedAnswer) return;

      // Mystery combat events resolve via processEvent, not processAnswer
      if (this._mysteryEvent) {
        const event = this._mysteryEvent;
        this._mysteryEvent = null;
        const choiceStr = isCorrect ? 'correct' : 'incorrect';
        await this.engine.processEvent(choiceStr);
        return;
      }

      await this.engine.processAnswer(selectedAnswer, confidence || 0);
    });
  }

  async _handleStartRun() {
    try {
      const profile = this.engine.getProfile();
      await this.engine.startRun(profile.activeClass || 'scholar');
      this._renderMap();
    } catch (err) {
      console.error('[ExpeditionUI] Start run failed:', err);
    }
  }

  _handleSelectClass(classId) {
    const profile = this.engine.getProfile();
    if (!profile.unlockedClasses.includes(classId)) return;
    this.engine._profile.activeClass = classId;
    this._renderHub(this.engine.hasStaleRun());
  }

  async _handleAbandonRun() {
    try {
      const summary = await this.engine.abandonRun();
      this._pendingSummary = summary;
      this._renderSummary(summary);
    } catch (err) {
      console.error('[ExpeditionUI] Abandon failed:', err);
    }
  }

  async _handleEquipRelic(relicId) {
    try {
      await this.engine.equipRelic(relicId);
      this._renderHub(this.engine.hasStaleRun());
    } catch (err) {
      console.error('[ExpeditionUI] Equip relic failed:', err);
    }
  }

  async _handleUnequipRelic(relicId) {
    try {
      await this.engine.unequipRelic(relicId);
      this._renderHub(this.engine.hasStaleRun());
    } catch (err) {
      console.error('[ExpeditionUI] Unequip relic failed:', err);
    }
  }

  async _handleBuyItem(itemId) {
    try {
      await this.engine.purchaseItem(itemId, 1);
      this._renderHub(this.engine.hasStaleRun());
    } catch (err) {
      console.error('[ExpeditionUI] Buy item failed:', err);
    }
  }

  async _handleBuyUpgrade(upgradeId) {
    try {
      await this.engine.purchaseUpgrade(upgradeId);
      this._renderHub(this.engine.hasStaleRun());
    } catch (err) {
      console.error('[ExpeditionUI] Buy upgrade failed:', err);
    }
  }

  async _handleMysteryCombat() {
    if (!this._pendingMysteryCtx) return;
    const ctx = this._pendingMysteryCtx;
    this._pendingMysteryCtx = null;
    this._mysteryEvent = ctx.event;

    // Load question into study view like combat
    const run = this.engine.getActiveRun();
    const room = run.rooms[run.currentRoomIndex];
    this._showCombatOverlay(run, room);
    this._loadQuestionIntoStudyUI(ctx.passage, ctx.question);
  }

  async _handleProcessEvent(choice) {
    try {
      if (choice === 'leave' || choice === 'collect' || choice === 'continue') {
        // For shop leave, treasure collect, mystery continue — process and return to map
        if (choice !== 'leave') {
          await this.engine.processEvent(choice);
        } else {
          // Mark shop room as done
          const run = this.engine.getActiveRun();
          const room = run.rooms[run.currentRoomIndex];
          if (room) {
            room.result = 'completed';
            room.timestamp = new Date().toISOString();
            run.roomsCleared++;
          }
        }
        this._renderMap();
        return;
      }

      // Buy item in shop (don't leave shop after buying)
      if (choice.startsWith('buy:')) {
        await this.engine.processEvent(choice);
        // Re-render shop with updated coins
        const run = this.engine.getActiveRun();
        const room = run.rooms[run.currentRoomIndex];
        const ctx = this.engine._currentRoomContext;
        if (ctx) {
          this._renderEventRoom(room, ctx);
        }
        return;
      }

      // Other events (rest, mystery)
      await this.engine.processEvent(choice);

      // Check if run ended (mystery damage could kill)
      if (!this.engine.hasActiveRun()) {
        // run_end event will handle summary
        return;
      }

      this._renderMap();
    } catch (err) {
      console.error('[ExpeditionUI] Process event failed:', err);
      this._renderMap();
    }
  }

  async _handleUseItem(itemId) {
    try {
      const result = await this.engine.useItem(itemId);
      const EC = window.ExpeditionConstants;
      const item = EC.ITEMS[itemId];

      if (item.effect === 'reveal_hint' && window.helpFeatures) {
        window.helpFeatures.showHints();
      } else if (item.effect === 'eliminate_wrong') {
        this._eliminateWrongOption();
      } else if (item.effect === 'heal') {
        const run = this.engine.getActiveRun();
        if (run && run.currentHearts < run.maxHearts) {
          run.currentHearts = Math.min(run.currentHearts + item.value, run.maxHearts);
        }
      } else if (item.effect === 'free_translations') {
        window._expeditionFreeTranslations = (window._expeditionFreeTranslations || 0) + item.value;
      }
      // xp_multiplier and block_damage are passive — handled in engine

      // Refresh combat bar to update item counts
      const run = this.engine.getActiveRun();
      const room = run.rooms[run.currentRoomIndex];
      if (run && room) {
        this._showCombatOverlay(run, room);
      }
    } catch (err) {
      console.error('[ExpeditionUI] Use item failed:', err);
    }
  }

  _eliminateWrongOption() {
    const optionBtns = document.querySelectorAll('.option-btn:not(.correct):not(.selected):not(.eliminated)');
    if (optionBtns.length > 0) {
      const question = window.state.currentPassage?.questions?.[window.state.currentQuestionIndex];
      if (question) {
        for (const btn of optionBtns) {
          if (btn.dataset.value !== question.correct_answer) {
            btn.classList.add('eliminated');
            btn.disabled = true;
            btn.style.opacity = '0.3';
            break;
          }
        }
      }
    }
  }

  // ═══════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════

  _getRoomIcon(type) {
    const icons = {
      combat: 'swords',
      elite: 'skull',
      boss: 'crown',
      treasure: 'gem',
      shop: 'store',
      rest: 'flame',
      mystery: 'help-circle'
    };
    return icons[type] || 'circle';
  }

  _getRoomTypeName(type) {
    const names = {
      combat: 'Combate',
      elite: 'Elite',
      boss: 'Boss',
      treasure: 'Tesouro',
      shop: 'Loja',
      rest: 'Descanso',
      mystery: 'Mistério'
    };
    return names[type] || type;
  }

  _showCoinPopup(amount) {
    if (amount <= 0) return;
    const popup = document.createElement('div');
    popup.className = 'expedition-coin-popup';
    popup.textContent = '+' + amount + ' moedas';
    document.body.appendChild(popup);
    requestAnimationFrame(() => popup.classList.add('show'));
    setTimeout(() => {
      popup.classList.add('fade');
      setTimeout(() => popup.remove(), 800);
    }, 600);
  }

  _refreshIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }
}

// Export
window.ExpeditionUI = ExpeditionUI;
