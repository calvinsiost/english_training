/**
 * Expedition Engine - English Training
 * Roguelite game engine: run lifecycle, room generation, HP, coins, items, relics.
 * Loaded as classic script after idb-helpers.js and expedition-constants.js.
 */

class ExpeditionEngine {
  constructor(db) {
    this.db = db;
    this._profile = null;
    this._activeRun = null;
    this._staleRun = null;
    this._currentRoomContext = null; // { passage, question } loaded by enterRoom
    this._roomEnterTime = null;
    // Per-run relic state (reset each run)
    this._relicState = {};
  }

  // ═══════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════

  async init() {
    await this._loadProfile();

    // Check for stale/interrupted runs
    const activeRun = await this._findActiveRun();
    if (activeRun) {
      const lastActivity = this._getLastActivityTimestamp(activeRun);
      const hoursElapsed = (Date.now() - new Date(lastActivity).getTime()) / 3600000;

      if (hoursElapsed > 24) {
        await this._forceAbandon(activeRun);
        console.log('[Expedition] Auto-abandoned stale run after 24h+');
      } else if (hoursElapsed > 1) {
        this._staleRun = activeRun;
        console.log('[Expedition] Stale run detected (', Math.round(hoursElapsed), 'h old). Awaiting user decision.');
      } else {
        this._activeRun = activeRun;
        this._initRelicState();
        console.log('[Expedition] Resumed active run:', activeRun.id);
      }
    }

    console.log('[Expedition] Initialized. Floor:', this._profile.currentFloor, 'Coins:', this._profile.coins);
  }

  // ═══════════════════════════════════════════
  // RUN MANAGEMENT
  // ═══════════════════════════════════════════

  async startRun(classId = 'scholar') {
    if (this._activeRun) {
      throw new Error('Ja existe uma expedicao ativa');
    }

    const EC = window.ExpeditionConstants;
    const cls = EC.CLASSES[classId];
    if (!cls) throw new Error('Classe invalida: ' + classId);
    if (cls.unlockCondition && !this._isClassUnlocked(classId)) {
      throw new Error('Classe nao desbloqueada: ' + classId);
    }

    const biome = await this._selectBiome();
    const floor = this._profile.currentFloor;
    const seed = Date.now() % 2147483647;

    // Calculate max hearts: class base + permanent upgrades
    const upgradeLevel = this._profile.permanentUpgrades.extra_hearts || 0;
    const upgradeBonus = upgradeLevel > 0 ? EC.PERMANENT_UPGRADES.extra_hearts.valuePerLevel[upgradeLevel - 1] : 0;
    const maxHearts = cls.maxHearts + upgradeBonus;

    // Generate rooms (linear, no forks in Batch 1)
    const rooms = this._generateRooms(biome, floor, seed);

    // Build starting items
    const activeItems = [];
    // Class starting items (random from inventory)
    if (cls.startingItems > 0 && this._profile.inventory.length > 0) {
      const available = this._profile.inventory.filter(s => s.count > 0);
      const rng = this._seededRandom(seed + 1);
      for (let i = 0; i < cls.startingItems && available.length > 0; i++) {
        const idx = Math.floor(rng() * available.length);
        const slot = available[idx];
        activeItems.push({ id: slot.id, count: 1 });
        slot.count--;
        if (slot.count <= 0) available.splice(idx, 1);
      }
    }
    // Permanent upgrade: free starting item
    const startItemLevel = this._profile.permanentUpgrades.starting_item || 0;
    if (startItemLevel > 0) {
      const rng2 = this._seededRandom(seed + 2);
      const itemKeys = Object.keys(EC.ITEMS);
      const randomItem = itemKeys[Math.floor(rng2() * itemKeys.length)];
      const existing = activeItems.find(s => s.id === randomItem);
      if (existing) existing.count++;
      else activeItems.push({ id: randomItem, count: 1 });
    }

    const run = {
      id: 'run_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      startedAt: new Date().toISOString(),
      endedAt: null,
      status: 'active',
      biome,
      floor,
      maxHearts,
      currentHearts: maxHearts,
      roomsCleared: 0,
      totalRooms: rooms.length,
      currentRoomIndex: -1,
      rooms,
      activeItems,
      itemsUsed: [],
      itemsGained: [],
      relicGained: null,
      totalXP: 0,
      totalCoins: 0,
      seed,
      classId
    };

    this._activeRun = run;
    this._initRelicState();
    await this._persistRun();

    // Persist inventory changes if class consumed starting items
    if (cls.startingItems > 0) {
      await this._persistProfile();
    }

    // Log behavior
    if (window.behaviorLogger) {
      window.behaviorLogger.log('session', 'expedition', 'start_run', {
        biome, floor, classId, seed, maxHearts, totalRooms: rooms.length
      });
    }

    return run;
  }

  async abandonRun() {
    if (!this._activeRun) throw new Error('Nenhuma expedicao ativa');

    this._activeRun.status = 'abandoned';
    this._activeRun.endedAt = new Date().toISOString();

    // Abandon = 0% coins (T3 decision)
    const summary = this._buildSummary(0);
    this._activeRun.totalCoins = 0;

    await this._persistRun();
    await this._updateProfileAfterRun(summary);
    this._activeRun = null;
    this._currentRoomContext = null;
    this._relicState = {};

    document.dispatchEvent(new CustomEvent('expedition:run_end', {
      detail: { runId: summary.runId, status: 'abandoned', summary }
    }));

    return summary;
  }

  async endRun() {
    if (!this._activeRun) throw new Error('Nenhuma expedicao ativa');

    const isDefeated = this._activeRun.currentHearts <= 0;
    this._activeRun.status = isDefeated ? 'defeated' : 'completed';
    this._activeRun.endedAt = new Date().toISOString();

    const coinMultiplier = isDefeated
      ? window.ExpeditionConstants.ECONOMY.coinRewardDefeated
      : window.ExpeditionConstants.ECONOMY.coinRewardCompleted;

    const summary = this._buildSummary(coinMultiplier);
    this._activeRun.totalCoins = Math.round(this._activeRun.totalCoins * coinMultiplier);

    await this._persistRun();
    await this._updateProfileAfterRun(summary);

    // Track daily challenge: expedition completed
    if (!isDefeated && window.dailyChallenge) {
      window.dailyChallenge.recordProgress('expeditions_completed', 1);
    }

    const status = this._activeRun.status;
    this._activeRun = null;
    this._currentRoomContext = null;
    this._relicState = {};

    document.dispatchEvent(new CustomEvent('expedition:run_end', {
      detail: { runId: summary.runId, status, summary }
    }));

    return summary;
  }

  // ═══════════════════════════════════════════
  // ROOM NAVIGATION
  // ═══════════════════════════════════════════

  async enterRoom(roomIndex) {
    if (!this._activeRun) throw new Error('Nenhuma expedicao ativa');
    if (roomIndex < 0 || roomIndex >= this._activeRun.totalRooms) {
      throw new Error('Sala invalida: ' + roomIndex);
    }

    const room = this._activeRun.rooms[roomIndex];
    this._activeRun.currentRoomIndex = roomIndex;
    this._roomEnterTime = Date.now();

    const result = { room, question: null, passage: null, event: null, shopItems: null };

    if (room.type === 'combat' || room.type === 'elite' || room.type === 'boss') {
      const selected = await this._selectQuestion(room.type, this._activeRun.biome, this._activeRun.floor);
      if (selected) {
        room.questionId = selected.question.id;
        room.passageId = selected.passage.id;
        room._questionType = selected.question.question_type;
        result.question = selected.question;
        result.passage = selected.passage;
      }
    } else if (room.type === 'treasure') {
      const item = this._rollTreasureItem();
      result.event = { type: 'treasure', item };
    } else if (room.type === 'shop') {
      result.shopItems = this._generateShopItems();
    } else if (room.type === 'rest') {
      result.event = { type: 'rest', choices: ['heal', 'buff'] };
    } else if (room.type === 'mystery') {
      const EC = window.ExpeditionConstants;
      const rng = this._seededRandom(this._activeRun.seed + roomIndex * 7);
      const idx = Math.floor(rng() * EC.MYSTERY_EVENTS.length);
      result.event = { type: 'mystery', ...EC.MYSTERY_EVENTS[idx] };
    }

    this._currentRoomContext = result;
    await this._persistRun();

    if (window.behaviorLogger) {
      window.behaviorLogger.log('navigation', 'expedition', 'room_enter', {
        roomIndex, roomType: room.type, runId: this._activeRun.id
      });
    }

    return result;
  }

  // ═══════════════════════════════════════════
  // COMBAT — DECOMPOSED (per T3.1 Fix #2)
  // ═══════════════════════════════════════════

  async processAnswer(answer, confidence) {
    if (!this._activeRun) throw new Error('Nenhuma expedicao ativa');
    const room = this._activeRun.rooms[this._activeRun.currentRoomIndex];
    if (!room || !['combat', 'elite', 'boss'].includes(room.type)) {
      throw new Error('Sala atual nao e de combate');
    }
    if (!this._currentRoomContext?.question) {
      throw new Error('Nenhuma questao carregada para esta sala');
    }

    const isCorrect = this._checkCorrectness(answer);
    const damageResult = this._applyDamage(isCorrect, room);
    const timeSpent = this._roomEnterTime ? Date.now() - this._roomEnterTime : 0;
    const rewards = this._calculateRewards(isCorrect, room, confidence, timeSpent);
    const loot = room.type === 'boss' && isCorrect ? this._rollBossRelic() : { itemId: null };

    return await this._persistRoomResult(room, { isCorrect, damageResult, rewards, loot, confidence, answer, timeSpent });
  }

  _checkCorrectness(answer) {
    return answer === this._currentRoomContext.question.correct_answer;
  }

  _applyDamage(isCorrect, room) {
    if (isCorrect) return { heartsLost: 0, shieldConsumed: false, relicBlocked: false };

    // Check shield item
    const shieldIdx = this._activeRun.activeItems.findIndex(s => s.id === 'shield' && s.count > 0);
    if (shieldIdx >= 0) {
      this._activeRun.activeItems[shieldIdx].count--;
      if (this._activeRun.activeItems[shieldIdx].count <= 0) {
        this._activeRun.activeItems.splice(shieldIdx, 1);
      }
      this._activeRun.itemsUsed.push('shield');
      return { heartsLost: 0, shieldConsumed: true, relicBlocked: false };
    }

    // Check vocab_shield relic
    const EC = window.ExpeditionConstants;
    if (this._activeRun.equippedRelics) {
      for (const relicId of this._getEquippedRelics()) {
        const relic = EC.RELICS[relicId];
        if (relic && EC.RELIC_PASSIVES[relic.passive]?.appliesTo === '_applyDamage') {
          const passiveDef = EC.RELIC_PASSIVES[relic.passive];
          if (!this._relicState[relic.passive]) this._relicState[relic.passive] = {};
          if (passiveDef.check(room, this._relicState[relic.passive])) {
            return { heartsLost: 0, shieldConsumed: false, relicBlocked: true };
          }
        }
      }
    }

    // Apply damage
    this._activeRun.currentHearts = Math.max(0, this._activeRun.currentHearts - 1);
    return { heartsLost: 1, shieldConsumed: false, relicBlocked: false };
  }

  _calculateRewards(isCorrect, room, confidence, timeSpentMs) {
    const EC = window.ExpeditionConstants;
    const eco = EC.ECONOMY;

    // Base coins
    let coins = eco.coinPerRoom;
    if (isCorrect) {
      coins += room.type === 'elite' ? eco.coinPerCorrectElite : eco.coinPerCorrect;
      if (room.type === 'boss') {
        coins = Math.round(coins * eco.bossBonusCoins);
      }
    }

    // Base XP (uses existing XP_REWARDS)
    let xp = 0;
    if (isCorrect) {
      xp = confidence >= 3 ? 15 : 10; // XP_REWARDS.ANSWER_CORRECT_CERTEZA : ANSWER_CORRECT
      if (room.type === 'boss') {
        xp = eco.xpPerBoss;
      }
    } else {
      xp = 3; // XP_REWARDS.ANSWER_INCORRECT
    }

    let xpMultiplier = 1;
    let coinMultiplier = 1;

    // XP boost item active
    const xpBoostItem = this._activeRun.activeItems.find(s => s.id === 'xp_boost' && s.count > 0);
    if (xpBoostItem) {
      xpMultiplier *= EC.ITEMS.xp_boost.value; // 1.5x
    }

    // Permanent upgrades
    const xpBonusLevel = this._profile.permanentUpgrades.xp_bonus || 0;
    if (xpBonusLevel > 0) {
      xpMultiplier *= (1 + EC.PERMANENT_UPGRADES.xp_bonus.valuePerLevel[xpBonusLevel - 1]);
    }
    const coinBonusLevel = this._profile.permanentUpgrades.coin_bonus || 0;
    if (coinBonusLevel > 0) {
      coinMultiplier *= (1 + EC.PERMANENT_UPGRADES.coin_bonus.valuePerLevel[coinBonusLevel - 1]);
    }
    const bossRewardLevel = this._profile.permanentUpgrades.boss_reward || 0;
    if (bossRewardLevel > 0 && room.type === 'boss') {
      coinMultiplier *= (1 + EC.PERMANENT_UPGRADES.boss_reward.valuePerLevel[bossRewardLevel - 1]);
      xpMultiplier *= (1 + EC.PERMANENT_UPGRADES.boss_reward.valuePerLevel[bossRewardLevel - 1]);
    }

    // Class passives
    const cls = EC.CLASSES[this._activeRun.classId];
    if (cls.passive && EC.CLASS_PASSIVES[cls.passive]) {
      const cp = EC.CLASS_PASSIVES[cls.passive];
      if (cp.coinMultiplier) coinMultiplier *= cp.coinMultiplier;
      if (cp.xpMultiplier) xpMultiplier *= cp.xpMultiplier;
    }

    // Relic passives for rewards
    for (const relicId of this._getEquippedRelics()) {
      const relic = EC.RELICS[relicId];
      if (!relic) continue;
      const passiveDef = EC.RELIC_PASSIVES[relic.passive];
      if (!passiveDef) continue;
      if (passiveDef.appliesTo === '_calculateRewards') {
        if (passiveDef.flatBonus) coins += passiveDef.flatBonus;
        if (passiveDef.bonusCoins) coins += passiveDef.bonusCoins(timeSpentMs);
      }
    }

    return {
      xp: Math.round(xp * xpMultiplier),
      coins: Math.round(coins * coinMultiplier),
      xpMultiplier,
      coinMultiplier
    };
  }

  _rollTreasureItem() {
    const EC = window.ExpeditionConstants;
    const items = Object.values(EC.ITEMS);
    const totalWeight = items.reduce((sum, item) => sum + item.dropWeight, 0);
    const rng = this._seededRandom(this._activeRun.seed + (this._activeRun.currentRoomIndex || 0) * 13);
    let roll = rng() * totalWeight;
    for (const item of items) {
      roll -= item.dropWeight;
      if (roll <= 0) return item;
    }
    return items[items.length - 1];
  }

  _rollBossRelic() {
    const EC = window.ExpeditionConstants;
    const unlockedIds = this._profile.unlockedRelics || [];
    const available = Object.keys(EC.RELICS).filter(id => !unlockedIds.includes(id));
    if (available.length === 0) return { itemId: null }; // all relics unlocked
    const rng = this._seededRandom(this._activeRun.seed + 997);
    const idx = Math.floor(rng() * available.length);
    return { relicId: available[idx] };
  }

  async _persistRoomResult(room, { isCorrect, damageResult, rewards, loot, confidence, answer, timeSpent }) {
    // Update room record
    room.result = isCorrect ? 'correct' : 'incorrect';
    room.xpAwarded = rewards.xp;
    room.coinsAwarded = rewards.coins;
    room.timestamp = new Date().toISOString();

    // Update run totals
    this._activeRun.totalXP += rewards.xp;
    this._activeRun.totalCoins += rewards.coins;
    this._activeRun.roomsCleared++;

    // Handle loot
    if (loot.relicId) {
      this._activeRun.relicGained = loot.relicId;
      if (!this._profile.unlockedRelics.includes(loot.relicId)) {
        this._profile.unlockedRelics.push(loot.relicId);
      }
    }

    // Award XP via existing system
    if (window.xpSystem) {
      const reason = isCorrect ? 'expedition' : 'expedition';
      await window.xpSystem.awardXP(rewards.xp, reason, 1);
    }

    // Update daily challenge
    if (window.dailyChallenge) {
      window.dailyChallenge.recordProgress('total_answers', 1);
      if (isCorrect) {
        window.dailyChallenge.recordProgress('consecutive_correct', 1);
      } else {
        if (window.dailyChallenge._challenge) {
          window.dailyChallenge._challenge._consecutiveCorrect = 0;
        }
      }
    }

    // Update profile stats
    if (isCorrect) {
      this._profile.statistics.correctAnswers++;
    } else {
      this._profile.statistics.incorrectAnswers++;
    }
    if (room.type === 'boss' && isCorrect) {
      this._profile.statistics.bossesDefeated++;
    }

    // Check game over
    const isGameOver = this._activeRun.currentHearts <= 0;
    const isBoss = room.type === 'boss';

    // Persist
    await this._persistRun();
    if (loot.relicId) {
      await this._persistProfile();
    }

    // Dispatch event
    const eventDetail = {
      runId: this._activeRun.id,
      roomIndex: room.index,
      roomType: room.type,
      isCorrect,
      heartsRemaining: this._activeRun.currentHearts,
      xpAwarded: rewards.xp,
      coinsAwarded: rewards.coins,
      itemFound: null,
      isGameOver,
      isBoss,
      shieldConsumed: damageResult.shieldConsumed,
      relicBlocked: damageResult.relicBlocked
    };
    document.dispatchEvent(new CustomEvent('expedition:room_complete', { detail: eventDetail }));

    // Log behavior
    if (window.behaviorLogger) {
      window.behaviorLogger.log('answer', 'expedition', 'room_complete', {
        roomIndex: room.index, roomType: room.type, isCorrect,
        heartsRemaining: this._activeRun.currentHearts, xp: rewards.xp, coins: rewards.coins
      });
    }

    // Auto-end if game over
    if (isGameOver) {
      await this.endRun();
    }

    return {
      isCorrect,
      heartsRemaining: this._activeRun ? this._activeRun.currentHearts : 0,
      xpAwarded: rewards.xp,
      coinsAwarded: rewards.coins,
      itemsFound: [],
      isGameOver,
      isBoss,
      shieldConsumed: damageResult.shieldConsumed,
      relicBlocked: damageResult.relicBlocked,
      relicGained: loot.relicId || null
    };
  }

  // ═══════════════════════════════════════════
  // NON-COMBAT ROOMS
  // ═══════════════════════════════════════════

  async processEvent(choice) {
    if (!this._activeRun) throw new Error('Nenhuma expedicao ativa');
    const room = this._activeRun.rooms[this._activeRun.currentRoomIndex];
    if (!room) throw new Error('Nenhuma sala atual');

    const result = { outcome: null, heartsAfter: this._activeRun.currentHearts, coinsAfter: this._activeRun.totalCoins, itemGained: null };

    if (room.type === 'treasure') {
      const item = this._currentRoomContext?.event?.item;
      if (item) {
        this._addItemToRun(item.id);
        this._activeRun.itemsGained.push(item.id);
        result.itemGained = item.id;
        result.outcome = 'item_gained';

        // Bonus coins from treasure
        const EC = window.ExpeditionConstants;
        const rng = this._seededRandom(this._activeRun.seed + room.index * 17);
        const bonusCoins = EC.ECONOMY.treasureCoinsMin +
          Math.floor(rng() * (EC.ECONOMY.treasureCoinsMax - EC.ECONOMY.treasureCoinsMin + 1));
        this._activeRun.totalCoins += bonusCoins;
        result.coinsAfter = this._activeRun.totalCoins;
      }
    } else if (room.type === 'rest') {
      if (choice === 'heal') {
        if (this._activeRun.currentHearts < this._activeRun.maxHearts) {
          this._activeRun.currentHearts++;
        }
        result.outcome = 'healed';
        result.heartsAfter = this._activeRun.currentHearts;
      } else if (choice === 'buff') {
        // Give a random common item
        const EC = window.ExpeditionConstants;
        const commonItems = Object.values(EC.ITEMS).filter(i => i.rarity === 'common');
        const rng = this._seededRandom(this._activeRun.seed + room.index * 23);
        const item = commonItems[Math.floor(rng() * commonItems.length)];
        this._addItemToRun(item.id);
        result.itemGained = item.id;
        result.outcome = 'buffed';
      }
    } else if (room.type === 'shop') {
      if (choice && choice.startsWith('buy:')) {
        const itemId = choice.slice(4);
        const EC = window.ExpeditionConstants;
        const item = EC.ITEMS[itemId];
        if (!item) { result.outcome = 'invalid_item'; }
        else {
          let price = item.shopPrice;
          const discountLevel = this._profile.permanentUpgrades.shop_discount || 0;
          if (discountLevel > 0) {
            price = Math.round(price * (1 - EC.PERMANENT_UPGRADES.shop_discount.valuePerLevel[discountLevel - 1]));
          }
          if (this._activeRun.totalCoins >= price) {
            this._activeRun.totalCoins -= price;
            this._addItemToRun(itemId);
            result.itemGained = itemId;
            result.coinsAfter = this._activeRun.totalCoins;
            result.outcome = 'purchased';
          } else {
            result.outcome = 'insufficient_coins';
          }
        }
      }
    } else if (room.type === 'mystery') {
      const event = this._currentRoomContext?.event;
      if (event) {
        result.outcome = this._resolveMystery(event, choice, room);
        result.heartsAfter = this._activeRun.currentHearts;
        result.coinsAfter = this._activeRun.totalCoins;
      }
    }

    room.result = result.outcome || 'completed';
    room.timestamp = new Date().toISOString();
    this._activeRun.roomsCleared++;

    await this._persistRun();
    return result;
  }

  _resolveMystery(event, choice, room) {
    if (event.type === 'windfall') {
      const rng = this._seededRandom(this._activeRun.seed + room.index * 31);
      const range = event.reward.coinsRange;
      const coins = range[0] + Math.floor(rng() * (range[1] - range[0] + 1));
      this._activeRun.totalCoins += coins;
      return 'windfall_' + coins;
    }
    if (event.type === 'trade') {
      if (choice === 'accept') {
        this._activeRun.currentHearts = Math.max(0, this._activeRun.currentHearts + event.cost.hearts);
        // Give rare random item
        const EC = window.ExpeditionConstants;
        const rareItems = Object.values(EC.ITEMS).filter(i => i.rarity === 'rare' || i.rarity === 'uncommon');
        const rng = this._seededRandom(this._activeRun.seed + room.index * 37);
        const item = rareItems[Math.floor(rng() * rareItems.length)];
        this._addItemToRun(item.id);
        return 'trade_accepted';
      }
      return 'trade_declined';
    }
    if (event.type === 'combat_gamble' || event.type === 'ambush') {
      // These need a question - handled like combat via processAnswer
      return 'awaiting_answer';
    }
    return 'mystery_resolved';
  }

  // ═══════════════════════════════════════════
  // ITEMS
  // ═══════════════════════════════════════════

  async useItem(itemId) {
    if (!this._activeRun) throw new Error('Nenhuma expedicao ativa');
    const EC = window.ExpeditionConstants;
    const item = EC.ITEMS[itemId];
    if (!item) throw new Error('Item invalido: ' + itemId);

    // Check class passive for free hints
    const cls = EC.CLASSES[this._activeRun.classId];
    const classPassive = cls.passive ? EC.CLASS_PASSIVES[cls.passive] : null;
    const isFreeHint = itemId === 'hint_token' && classPassive?.freeHints;

    if (!isFreeHint) {
      const slot = this._activeRun.activeItems.find(s => s.id === itemId && s.count > 0);
      if (!slot) throw new Error('Item nao disponivel: ' + itemId);
      slot.count--;
      if (slot.count <= 0) {
        this._activeRun.activeItems = this._activeRun.activeItems.filter(s => s.count > 0);
      }
    }

    this._activeRun.itemsUsed.push(itemId);
    const room = this._activeRun.rooms[this._activeRun.currentRoomIndex];
    if (room) room.itemUsed = itemId;

    await this._persistRun();

    if (window.behaviorLogger) {
      window.behaviorLogger.log('click', 'expedition', 'use_item', {
        itemId, roomIndex: this._activeRun.currentRoomIndex, free: isFreeHint
      });
    }

    return {
      applied: true,
      effect: item.effect,
      value: item.value,
      remaining: this._activeRun.activeItems.find(s => s.id === itemId)?.count || 0
    };
  }

  // ═══════════════════════════════════════════
  // META-PROGRESSION
  // ═══════════════════════════════════════════

  async purchaseUpgrade(upgradeId) {
    const EC = window.ExpeditionConstants;
    const upgrade = EC.PERMANENT_UPGRADES[upgradeId];
    if (!upgrade) throw new Error('Upgrade invalido: ' + upgradeId);

    const currentLevel = this._profile.permanentUpgrades[upgradeId] || 0;
    if (currentLevel >= upgrade.maxLevel) throw new Error('Upgrade no nivel maximo');

    const cost = upgrade.costPerLevel[currentLevel];
    if (this._profile.coins < cost) throw new Error('Moedas insuficientes');

    this._profile.coins -= cost;
    this._profile.permanentUpgrades[upgradeId] = currentLevel + 1;
    await this._persistProfile();

    return { success: true, coinsRemaining: this._profile.coins, newLevel: currentLevel + 1 };
  }

  async purchaseItem(itemId, quantity = 1) {
    const EC = window.ExpeditionConstants;
    const item = EC.ITEMS[itemId];
    if (!item) throw new Error('Item invalido: ' + itemId);

    const currentSlot = this._profile.inventory.find(s => s.id === itemId);
    const currentCount = currentSlot ? currentSlot.count : 0;
    if (currentCount + quantity > EC.MAX_INVENTORY_PER_ITEM) {
      throw new Error('Inventario cheio para este item');
    }

    const totalCost = item.shopPrice * quantity;
    if (this._profile.coins < totalCost) throw new Error('Moedas insuficientes');

    this._profile.coins -= totalCost;
    if (currentSlot) {
      currentSlot.count += quantity;
    } else {
      this._profile.inventory.push({ id: itemId, count: quantity });
    }

    await this._persistProfile();
    return { success: true, coinsRemaining: this._profile.coins, inventory: this._profile.inventory };
  }

  async equipRelic(relicId) {
    const EC = window.ExpeditionConstants;
    if (!this._profile.unlockedRelics.includes(relicId)) {
      throw new Error('Reliquia nao desbloqueada: ' + relicId);
    }
    if (this._profile.equippedRelics.includes(relicId)) return; // already equipped
    if (this._profile.equippedRelics.length >= EC.MAX_EQUIPPED_RELICS) {
      throw new Error('Desequipe uma reliquia primeiro');
    }

    this._profile.equippedRelics.push(relicId);
    await this._persistProfile();
  }

  async unequipRelic(relicId) {
    this._profile.equippedRelics = this._profile.equippedRelics.filter(id => id !== relicId);
    await this._persistProfile();
  }

  // ═══════════════════════════════════════════
  // STALE RUN HANDLING
  // ═══════════════════════════════════════════

  hasStaleRun() { return !!this._staleRun; }
  getStaleRun() { return this._staleRun; }

  async resumeStaleRun() {
    if (!this._staleRun) return;
    this._activeRun = this._staleRun;
    this._staleRun = null;
    this._initRelicState();
  }

  async abandonStaleRun() {
    if (!this._staleRun) return;
    await this._forceAbandon(this._staleRun);
    this._staleRun = null;
  }

  // ═══════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════

  getProfile() { return { ...this._profile }; }

  getActiveRun() { return this._activeRun; }

  hasActiveRun() { return this._activeRun !== null; }

  async getRunHistory(limit = 20) {
    const tx = this.db.transaction('expedition_runs', 'readonly');
    const store = tx.objectStore('expedition_runs');
    const all = await idbGetAll(store);
    return all
      .filter(r => r.status !== 'active')
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
      .slice(0, limit);
  }

  // ═══════════════════════════════════════════
  // PRIVATE — PRNG
  // ═══════════════════════════════════════════

  _seededRandom(seed) {
    // Mulberry32
    let s = seed | 0;
    return function() {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ═══════════════════════════════════════════
  // PRIVATE — ROOM GENERATION
  // ═══════════════════════════════════════════

  _generateRooms(biome, floor, seed) {
    const EC = window.ExpeditionConstants;
    const dc = EC.DIFFICULTY_CURVE;
    const roomCount = dc.roomCountBase + Math.min(floor - 1, dc.roomCountMax - dc.roomCountBase);

    // Apply treasure_room_boost relic
    let dist = { ...EC.ROOM_DISTRIBUTION };
    for (const relicId of this._getEquippedRelics()) {
      const relic = EC.RELICS[relicId];
      if (relic) {
        const passiveDef = EC.RELIC_PASSIVES[relic.passive];
        if (passiveDef?.appliesTo === '_generateRooms' && passiveDef.modifyDistribution) {
          dist = passiveDef.modifyDistribution(dist);
        }
      }
    }

    const rng = this._seededRandom(seed);
    const rooms = [];

    for (let i = 0; i < roomCount; i++) {
      let type;
      let difficulty = 'medium';

      if (i === 0) {
        type = 'combat'; // first room always combat (gentle start)
      } else if (i === roomCount - 1) {
        type = 'boss'; // last room always boss
      } else {
        const roll = rng();
        let cumulative = 0;
        type = 'combat'; // fallback
        for (const [roomType, weight] of Object.entries(dist)) {
          cumulative += weight;
          if (roll < cumulative) {
            type = roomType;
            break;
          }
        }
      }

      // Scale difficulty by floor
      if (['combat', 'elite', 'boss'].includes(type)) {
        if (floor <= 2) difficulty = 'easy';
        else if (floor <= 5) difficulty = 'medium';
        else difficulty = 'hard';

        if (type === 'elite' || type === 'boss') difficulty = 'hard';
      }

      rooms.push({
        index: i,
        type,
        questionId: null,
        passageId: null,
        difficulty,
        result: null,
        xpAwarded: 0,
        coinsAwarded: 0,
        itemUsed: null,
        timestamp: null,
        _questionType: null
      });
    }

    return rooms;
  }

  // ═══════════════════════════════════════════
  // PRIVATE — QUESTION SELECTION (with fallback chain per T3.1 Fix #1)
  // ═══════════════════════════════════════════

  async _selectQuestion(roomType, biome, floor) {
    const weakTypes = await this._getWeakQuestionTypes();
    const typeFilter = (roomType === 'elite' || roomType === 'boss') ? (weakTypes[0] || null) : null;

    const chain = [
      { biomeFilter: biome, avoidRuns: 3, questionType: typeFilter },
      { biomeFilter: biome, avoidRuns: 1, questionType: typeFilter },
      { biomeFilter: biome, avoidRuns: 0, questionType: typeFilter },
      { biomeFilter: null, avoidRuns: 1, questionType: typeFilter },
      { biomeFilter: null, avoidRuns: 0, questionType: typeFilter },
      { biomeFilter: null, avoidRuns: 0, questionType: null }
    ];

    for (const criteria of chain) {
      const result = await this._queryQuestionBank(criteria, floor);
      if (result) return result;
    }

    console.warn('[Expedition] No questions available');
    return null;
  }

  async _queryQuestionBank(criteria, floor) {
    const tx = this.db.transaction('question_bank', 'readonly');
    const store = tx.objectStore('question_bank');
    const allPassages = await idbGetAll(store);

    // Filter by biome (passage_topic)
    let filtered = allPassages;
    if (criteria.biomeFilter) {
      filtered = filtered.filter(p => p.passage_topic === criteria.biomeFilter);
    }

    if (filtered.length === 0) return null;

    // Get recently seen question IDs
    let recentIds = [];
    if (criteria.avoidRuns > 0) {
      recentIds = await this._getRecentQuestionIds(criteria.avoidRuns);
    }

    // Build candidate questions
    const candidates = [];
    for (const passage of filtered) {
      if (!passage.questions) continue;
      for (const q of passage.questions) {
        if (recentIds.includes(q.id)) continue;
        if (criteria.questionType && q.question_type !== criteria.questionType) continue;
        candidates.push({ passage, question: q });
      }
    }

    if (candidates.length === 0) return null;

    // Pick random from candidates
    const rng = this._seededRandom(this._activeRun.seed + (this._activeRun.currentRoomIndex || 0) * 3 + candidates.length);
    return candidates[Math.floor(rng() * candidates.length)];
  }

  async _getRecentQuestionIds(numRuns) {
    const tx = this.db.transaction('expedition_runs', 'readonly');
    const store = tx.objectStore('expedition_runs');
    const allRuns = await idbGetAll(store);

    const recentRuns = allRuns
      .filter(r => r.id !== this._activeRun?.id && r.status !== 'active')
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
      .slice(0, numRuns);

    const ids = [];
    for (const run of recentRuns) {
      for (const room of run.rooms) {
        if (room.questionId) ids.push(room.questionId);
      }
    }
    return ids;
  }

  async _getWeakQuestionTypes() {
    try {
      const tx = this.db.transaction('weakness_map', 'readonly');
      const store = tx.objectStore('weakness_map');
      const entries = await idbGetAll(store);
      if (!entries || entries.length === 0) return [];
      // Sort by accuracy ascending (weakest first)
      return entries
        .filter(e => e.totalAttempts >= 3) // need minimum attempts
        .sort((a, b) => (a.accuracy || 1) - (b.accuracy || 1))
        .map(e => e.id);
    } catch {
      return [];
    }
  }

  // ═══════════════════════════════════════════
  // PRIVATE — BIOME SELECTION
  // ═══════════════════════════════════════════

  async _selectBiome() {
    const EC = window.ExpeditionConstants;
    const biomeIds = Object.keys(EC.BIOMES);

    try {
      const tx = this.db.transaction('expedition_runs', 'readonly');
      const store = tx.objectStore('expedition_runs');
      const index = store.index('biome');

      const counts = {};
      for (const id of biomeIds) {
        counts[id] = await idbCount(index, IDBKeyRange.only(id));
      }

      // Return least-played biome
      const sorted = Object.entries(counts).sort((a, b) => a[1] - b[1]);
      return sorted[0][0];
    } catch {
      // Fallback: random biome
      return biomeIds[Math.floor(Math.random() * biomeIds.length)];
    }
  }

  // ═══════════════════════════════════════════
  // PRIVATE — HELPERS
  // ═══════════════════════════════════════════

  _addItemToRun(itemId) {
    const EC = window.ExpeditionConstants;
    const slot = this._activeRun.activeItems.find(s => s.id === itemId);
    if (slot) {
      slot.count++;
    } else {
      // Cap check for overflow -> convert to coins
      if (this._activeRun.activeItems.filter(s => s.id === itemId).length > 0) {
        const item = EC.ITEMS[itemId];
        this._activeRun.totalCoins += Math.round(item.shopPrice / 2);
      } else {
        this._activeRun.activeItems.push({ id: itemId, count: 1 });
      }
    }
  }

  _generateShopItems() {
    const EC = window.ExpeditionConstants;
    const rng = this._seededRandom(this._activeRun.seed + (this._activeRun.currentRoomIndex || 0) * 41);
    const allItems = Object.values(EC.ITEMS);
    const count = EC.ECONOMY.shopItemCount;
    const shop = [];
    const used = new Set();

    for (let i = 0; i < count && i < allItems.length; i++) {
      let idx;
      do { idx = Math.floor(rng() * allItems.length); } while (used.has(idx));
      used.add(idx);

      const item = allItems[idx];
      let price = item.shopPrice;
      const discountLevel = this._profile.permanentUpgrades.shop_discount || 0;
      if (discountLevel > 0) {
        price = Math.round(price * (1 - EC.PERMANENT_UPGRADES.shop_discount.valuePerLevel[discountLevel - 1]));
      }
      shop.push({ ...item, currentPrice: price });
    }

    return shop;
  }

  _getEquippedRelics() {
    return this._profile.equippedRelics || [];
  }

  _initRelicState() {
    this._relicState = {};
    // Reset per-run state for each equipped relic
    for (const relicId of this._getEquippedRelics()) {
      const relic = window.ExpeditionConstants.RELICS[relicId];
      if (relic) this._relicState[relic.passive] = {};
    }
  }

  _isClassUnlocked(classId) {
    return this._profile.unlockedClasses.includes(classId);
  }

  _getLastActivityTimestamp(run) {
    // Last room with a timestamp, or startedAt
    for (let i = run.rooms.length - 1; i >= 0; i--) {
      if (run.rooms[i].timestamp) return run.rooms[i].timestamp;
    }
    return run.startedAt;
  }

  _buildSummary(coinMultiplier) {
    const run = this._activeRun;
    const combatRooms = run.rooms.filter(r => ['combat', 'elite', 'boss'].includes(r.type));
    const correctRooms = combatRooms.filter(r => r.result === 'correct');

    return {
      runId: run.id,
      status: run.status,
      floor: run.floor,
      biome: run.biome,
      roomsCleared: run.roomsCleared,
      totalRooms: run.totalRooms,
      correctAnswers: correctRooms.length,
      totalCombatRooms: combatRooms.length,
      accuracy: combatRooms.length > 0 ? Math.round((correctRooms.length / combatRooms.length) * 100) : 0,
      totalXP: run.totalXP,
      totalCoins: Math.round(run.totalCoins * coinMultiplier),
      relicGained: run.relicGained,
      itemsGained: run.itemsGained,
      heartsRemaining: run.currentHearts,
      duration: run.endedAt ? new Date(run.endedAt) - new Date(run.startedAt) : 0
    };
  }

  async _updateProfileAfterRun(summary) {
    this._profile.totalRuns++;
    if (summary.status === 'completed') {
      this._profile.completedRuns = (this._profile.completedRuns || 0) + 1;
      this._profile.currentFloor++;
    }

    this._profile.coins += summary.totalCoins;
    this._profile.totalRoomsCleared = (this._profile.totalRoomsCleared || 0) + summary.roomsCleared;

    if (summary.roomsCleared > (this._profile.statistics.longestRun || 0)) {
      this._profile.statistics.longestRun = summary.roomsCleared;
    }

    const heartsDiff = this._activeRun ? (this._activeRun.maxHearts - (this._activeRun.maxHearts - this._activeRun.currentHearts)) : 0;
    if (summary.status === 'completed' && this._activeRun && this._activeRun.currentHearts === this._activeRun.maxHearts) {
      this._profile.statistics.perfectRuns = (this._profile.statistics.perfectRuns || 0) + 1;
    }

    if (this._profile.currentFloor > (this._profile.bestFloor || 0)) {
      this._profile.bestFloor = this._profile.currentFloor;
    }

    // Check class unlocks
    this._checkClassUnlocks();

    await this._persistProfile();
  }

  _checkClassUnlocks() {
    const EC = window.ExpeditionConstants;
    for (const [classId, cls] of Object.entries(EC.CLASSES)) {
      if (this._profile.unlockedClasses.includes(classId)) continue;
      if (!cls.unlockCondition) continue;

      let unlocked = true;
      for (const [stat, required] of Object.entries(cls.unlockCondition)) {
        const current = this._profile.statistics[stat] || this._profile[stat] || 0;
        if (current < required) { unlocked = false; break; }
      }

      if (unlocked) {
        this._profile.unlockedClasses.push(classId);
        console.log('[Expedition] Class unlocked:', classId);
      }
    }
  }

  async _forceAbandon(run) {
    run.status = 'abandoned';
    run.endedAt = new Date().toISOString();

    const tx = this.db.transaction('expedition_runs', 'readwrite');
    tx.objectStore('expedition_runs').put(run);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async _findActiveRun() {
    const tx = this.db.transaction('expedition_runs', 'readonly');
    const index = tx.objectStore('expedition_runs').index('status');
    const request = index.getAll(IDBKeyRange.only('active'));
    const runs = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return runs.length > 0 ? runs[0] : null;
  }

  // ═══════════════════════════════════════════
  // PRIVATE — PERSISTENCE
  // ═══════════════════════════════════════════

  async _loadProfile() {
    try {
      const tx = this.db.transaction('meta', 'readonly');
      const stored = await idbGet(tx.objectStore('meta'), 'expedition_profile');
      if (stored) {
        this._profile = { ...this._defaultProfile(), ...stored };
        return;
      }
    } catch (e) {
      console.warn('[Expedition] Load profile error:', e);
    }
    this._profile = this._defaultProfile();
    await this._persistProfile();
  }

  _defaultProfile() {
    return {
      key: 'expedition_profile',
      totalRuns: 0,
      completedRuns: 0,
      bestFloor: 0,
      totalRoomsCleared: 0,
      totalBossesDefeated: 0,
      coins: 0,
      currentFloor: 1,
      unlockedRelics: [],
      equippedRelics: [],
      unlockedClasses: ['scholar'],
      activeClass: 'scholar',
      permanentUpgrades: {},
      inventory: [],
      statistics: {
        correctAnswers: 0,
        incorrectAnswers: 0,
        bossesDefeated: 0,
        longestRun: 0,
        perfectRuns: 0
      }
    };
  }

  async _persistRun() {
    if (!this._activeRun) return;
    try {
      const tx = this.db.transaction('expedition_runs', 'readwrite');
      tx.objectStore('expedition_runs').put(this._activeRun);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.error('[Expedition] Persist run error:', e);
    }
  }

  async _persistProfile() {
    try {
      const tx = this.db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put({ ...this._profile, key: 'expedition_profile' });
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.error('[Expedition] Persist profile error:', e);
    }
  }
}

// Export to global scope
window.ExpeditionEngine = ExpeditionEngine;
