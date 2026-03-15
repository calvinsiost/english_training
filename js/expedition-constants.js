/**
 * Expedition Constants - English Training
 * Roguelite gamification: items, relics, classes, biomes, economy, mystery events.
 * Loaded as classic script before expedition-engine.js.
 */

// --- ITEMS (consumables per run) ---
const EXPEDITION_ITEMS = {
  hint_token: {
    id: 'hint_token',
    name: 'Pergaminho de Dica',
    description: 'Revela uma dica contextual para a questao',
    icon: 'scroll',
    rarity: 'common',
    effect: 'reveal_hint',
    value: 1,
    shopPrice: 15,
    dropWeight: 0.30
  },
  extra_heart: {
    id: 'extra_heart',
    name: 'Pocao de Vida',
    description: 'Restaura 1 coracao',
    icon: 'heart',
    rarity: 'uncommon',
    effect: 'heal',
    value: 1,
    shopPrice: 25,
    dropWeight: 0.15
  },
  xp_boost: {
    id: 'xp_boost',
    name: 'Pergaminho de Sabedoria',
    description: '1.5x XP pelo resto da expedicao',
    icon: 'sparkles',
    rarity: 'rare',
    effect: 'xp_multiplier',
    value: 1.5,
    shopPrice: 40,
    dropWeight: 0.08
  },
  eliminate_option: {
    id: 'eliminate_option',
    name: 'Luneta do Conhecimento',
    description: 'Elimina 1 opcao incorreta',
    icon: 'search',
    rarity: 'uncommon',
    effect: 'eliminate_wrong',
    value: 1,
    shopPrice: 20,
    dropWeight: 0.12
  },
  translation_free: {
    id: 'translation_free',
    name: 'Dicionario Portatil',
    description: 'Traducao gratuita de 3 palavras nesta sala',
    icon: 'book-open',
    rarity: 'common',
    effect: 'free_translations',
    value: 3,
    shopPrice: 10,
    dropWeight: 0.25
  },
  shield: {
    id: 'shield',
    name: 'Escudo de Papel',
    description: 'Bloqueia o proximo erro (nao perde coracao)',
    icon: 'shield',
    rarity: 'rare',
    effect: 'block_damage',
    value: 1,
    shopPrice: 35,
    dropWeight: 0.05
  }
};

// --- RELICS (passive bonuses, earned from bosses, max 3 equipped) ---
const EXPEDITION_RELICS = {
  vocab_shield: {
    id: 'vocab_shield',
    name: 'Escudo Lexical',
    description: 'Questoes de vocabulario nao tiram coracao no 1o erro da run',
    icon: 'shield-check',
    passive: 'vocab_damage_block_first'
  },
  speed_reader: {
    id: 'speed_reader',
    name: 'Olho Veloz',
    description: '+5 moedas por resposta em menos de 30 segundos',
    icon: 'zap',
    passive: 'speed_coin_bonus'
  },
  lucky_charm: {
    id: 'lucky_charm',
    name: 'Amuleto da Sorte',
    description: '+50% chance de sala tesouro na geracao',
    icon: 'gem',
    passive: 'treasure_room_boost'
  },
  srs_master: {
    id: 'srs_master',
    name: 'Tomo da Memoria',
    description: 'Reviews SRS na expedicao contam 2x',
    icon: 'brain',
    passive: 'srs_double_review'
  },
  coin_magnet: {
    id: 'coin_magnet',
    name: 'Ima de Moedas',
    description: '+3 moedas por sala completada',
    icon: 'magnet',
    passive: 'coin_per_room'
  }
};

// --- RELIC PASSIVE EFFECTS (how each passive is applied by the engine) ---
const RELIC_PASSIVES = {
  vocab_damage_block_first: {
    appliesTo: '_applyDamage',
    // state.triggered is reset per run in engine.startRun()
    check(room, relicState) {
      if (relicState.triggered) return false;
      const vocabTypes = ['vocab_synonym', 'vocab_meaning'];
      if (vocabTypes.includes(room._questionType)) {
        relicState.triggered = true;
        return true; // block damage
      }
      return false;
    }
  },
  speed_coin_bonus: {
    appliesTo: '_calculateRewards',
    bonusCoins(timeSpentMs) {
      return timeSpentMs < 30000 ? 5 : 0;
    }
  },
  treasure_room_boost: {
    appliesTo: '_generateRooms',
    modifyDistribution(dist) {
      const boost = dist.treasure * 0.5;
      return {
        ...dist,
        treasure: dist.treasure + boost,
        combat: dist.combat - boost
      };
    }
  },
  srs_double_review: {
    appliesTo: '_persistRoomResult',
    srsQualityMultiplier: 2
  },
  coin_per_room: {
    appliesTo: '_calculateRewards',
    flatBonus: 3
  }
};

// --- CLASSES (playstyles) ---
const EXPEDITION_CLASSES = {
  scholar: {
    id: 'scholar',
    name: 'Estudioso',
    description: 'Equilibrado. Comeca com 3 coracoes.',
    maxHearts: 3,
    startingItems: 0,
    passive: null,
    unlockCondition: null
  },
  warrior: {
    id: 'warrior',
    name: 'Guerreiro',
    description: '4 coracoes, mas sem itens iniciais.',
    maxHearts: 4,
    startingItems: 0,
    passive: null,
    unlockCondition: { completedRuns: 10 }
  },
  rogue: {
    id: 'rogue',
    name: 'Ladino',
    description: '2 coracoes, mas comeca com 2 itens aleatorios e +50% moedas.',
    maxHearts: 2,
    startingItems: 2,
    passive: 'coin_bonus_50',
    unlockCondition: { bossesDefeated: 5 }
  },
  sage: {
    id: 'sage',
    name: 'Sabio',
    description: '3 coracoes. Dicas gratuitas. +25% XP.',
    maxHearts: 3,
    startingItems: 0,
    passive: 'free_hints_and_xp',
    unlockCondition: { totalRoomsCleared: 200 }
  }
};

// --- CLASS PASSIVE EFFECTS ---
const CLASS_PASSIVES = {
  coin_bonus_50: {
    appliesTo: '_calculateRewards',
    coinMultiplier: 1.5
  },
  free_hints_and_xp: {
    appliesTo: ['useItem', '_calculateRewards'],
    freeHints: true,
    xpMultiplier: 1.25
  }
};

// --- ROOM DISTRIBUTION (must sum to 1.0) ---
const ROOM_DISTRIBUTION = {
  combat: 0.60,
  elite: 0.15,
  treasure: 0.08,
  shop: 0.07,
  rest: 0.05,
  mystery: 0.05
};

// Validate sum at load time
const _roomDistSum = Object.values(ROOM_DISTRIBUTION).reduce((a, b) => a + b, 0);
console.assert(Math.abs(_roomDistSum - 1.0) < 0.001, `ROOM_DISTRIBUTION sum is ${_roomDistSum}, expected 1.0`);

// --- BIOMES (mapped 1:1 from TOPICS in constants.js) ---
const EXPEDITION_BIOMES = {
  technology_ai: { id: 'technology_ai', name: 'Laboratorio Digital', icon: 'cpu', color: '#5b8def' },
  medicine_health: { id: 'medicine_health', name: 'Hospital Abandonado', icon: 'heart-pulse', color: '#e94560' },
  environment_climate: { id: 'environment_climate', name: 'Floresta Ancestral', icon: 'trees', color: '#4ead8a' },
  social_sciences: { id: 'social_sciences', name: 'Ruinas da Sociedade', icon: 'users', color: '#d4a944' },
  culture_arts: { id: 'culture_arts', name: 'Galeria Encantada', icon: 'palette', color: '#f368e0' },
  education: { id: 'education', name: 'Biblioteca Perdida', icon: 'graduation-cap', color: '#00d9ff' },
  politics_governance: { id: 'politics_governance', name: 'Parlamento Sombrio', icon: 'landmark', color: '#ff9f43' },
  economics_business: { id: 'economics_business', name: 'Cofre do Dragao', icon: 'coins', color: '#ffd700' },
  science_research: { id: 'science_research', name: 'Observatorio Cosmico', icon: 'telescope', color: '#a855f7' },
  language_communication: { id: 'language_communication', name: 'Torre de Babel', icon: 'message-circle', color: '#06b6d4' },
  history: { id: 'history', name: 'Templo do Tempo', icon: 'clock', color: '#8b5e3c' },
  psychology: { id: 'psychology', name: 'Labirinto Mental', icon: 'brain', color: '#ec4899' }
};

// --- DIFFICULTY CURVE ---
const DIFFICULTY_CURVE = {
  roomCountBase: 5,
  roomCountMax: 12,
  // rooms = base + min(floor - 1, max - base)
  floorScaling: 1,
  bossBonusXP: 3,    // 3x normal XP
  bossBonusCoins: 5  // 5x normal coins
};

// --- ECONOMY ---
const EXPEDITION_ECONOMY = {
  coinPerCorrect: 5,
  coinPerCorrectElite: 10,
  coinPerRoom: 2,
  treasureCoinsMin: 10,
  treasureCoinsMax: 25,
  shopItemCount: 3,
  xpPerBoss: 30,
  coinRewardCompleted: 1.0,    // 100% coins kept
  coinRewardDefeated: 0.5,     // 50% coins kept
  coinRewardAbandoned: 0.0     // 0% coins kept
};

// --- PERMANENT UPGRADES ---
const PERMANENT_UPGRADES = {
  extra_hearts: {
    id: 'extra_hearts',
    name: 'Coracoes Extra',
    description: '+1 coracao maximo por nivel',
    maxLevel: 2,
    costPerLevel: [100, 250],
    effect: 'max_hearts',
    valuePerLevel: [1, 2]
  },
  starting_item: {
    id: 'starting_item',
    name: 'Mochila Preparada',
    description: 'Comece com 1 item aleatorio',
    maxLevel: 1,
    costPerLevel: [150],
    effect: 'free_starting_item',
    valuePerLevel: [1]
  },
  xp_bonus: {
    id: 'xp_bonus',
    name: 'Mente Afiada',
    description: '+5% XP por nivel',
    maxLevel: 4,
    costPerLevel: [50, 100, 200, 400],
    effect: 'xp_percent_bonus',
    valuePerLevel: [0.05, 0.10, 0.15, 0.20]
  },
  coin_bonus: {
    id: 'coin_bonus',
    name: 'Olho para Ouro',
    description: '+10% moedas por nivel',
    maxLevel: 3,
    costPerLevel: [75, 150, 300],
    effect: 'coin_percent_bonus',
    valuePerLevel: [0.10, 0.20, 0.30]
  },
  shop_discount: {
    id: 'shop_discount',
    name: 'Barganhista',
    description: 'Desconto na loja por nivel',
    maxLevel: 2,
    costPerLevel: [100, 200],
    effect: 'shop_discount',
    valuePerLevel: [0.10, 0.25]
  },
  boss_reward: {
    id: 'boss_reward',
    name: 'Cacador de Bosses',
    description: '+25% recompensa de boss por nivel',
    maxLevel: 2,
    costPerLevel: [125, 275],
    effect: 'boss_reward_bonus',
    valuePerLevel: [0.25, 0.50]
  }
};

// --- MYSTERY EVENTS ---
const MYSTERY_EVENTS = [
  {
    id: 'double_or_nothing',
    name: 'Tudo ou Nada',
    description: 'Responda corretamente: +20 moedas. Erre: perca 1 coracao.',
    type: 'combat_gamble',
    outcomes: {
      correct: { coins: 20 },
      incorrect: { hearts: -1 }
    }
  },
  {
    id: 'word_challenge',
    name: 'Desafio Lexical',
    description: 'Traduza 3 palavras em 60s. Sucesso: +1 coracao.',
    type: 'mini_game',
    successReward: { hearts: 1 },
    failReward: null
  },
  {
    id: 'cursed_chest',
    name: 'Bau Amaldicoado',
    description: 'Ganhe um item raro, mas perca 1 coracao.',
    type: 'trade',
    cost: { hearts: 1 },
    reward: { item: 'rare_random' },
    choices: ['accept', 'decline']
  },
  {
    id: 'lucky_find',
    name: 'Achado de Sorte',
    description: 'Voce encontrou moedas esquecidas!',
    type: 'windfall',
    reward: { coinsRange: [10, 30] }
  },
  {
    id: 'trap',
    name: 'Armadilha',
    description: 'Uma questao surpresa! Sem tempo para usar itens.',
    type: 'ambush',
    penaltyOnFail: { hearts: -1 }
  }
];

// --- EXPEDITION LIMITS ---
const MAX_EQUIPPED_RELICS = 3;
const MAX_INVENTORY_PER_ITEM = 10;

// --- EXPORT ---
window.ExpeditionConstants = Object.freeze({
  ITEMS: EXPEDITION_ITEMS,
  RELICS: EXPEDITION_RELICS,
  RELIC_PASSIVES,
  CLASSES: EXPEDITION_CLASSES,
  CLASS_PASSIVES,
  ROOM_DISTRIBUTION,
  BIOMES: EXPEDITION_BIOMES,
  DIFFICULTY_CURVE,
  ECONOMY: EXPEDITION_ECONOMY,
  PERMANENT_UPGRADES,
  MYSTERY_EVENTS,
  MAX_EQUIPPED_RELICS,
  MAX_INVENTORY_PER_ITEM
});
