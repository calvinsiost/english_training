/**
 * Constants - English Training
 * Based on Spec v3.3
 */

/** Question types from FUVEST exam analysis */
export const QUESTION_TYPES = [
  'main_idea',
  'inference',
  'vocab_synonym',
  'vocab_meaning',
  'expression',
  'discourse',
  'reference',
  'logic',
  'challenge'
];

/** Distribution of question types in real exam (~30 questions) */
export const EXAM_DISTRIBUTION = {
  main_idea: 5,
  inference: 5,
  vocab_synonym: 6,
  vocab_meaning: 5,
  expression: 4,
  discourse: 2,
  reference: 1,
  logic: 1,
  challenge: 1
};

/** Passage topics for diversity tracking */
export const TOPICS = [
  'technology_ai',
  'medicine_health',
  'environment_climate',
  'social_sciences',
  'culture_arts',
  'education',
  'politics_governance',
  'economics_business',
  'science_research',
  'language_communication',
  'history',
  'psychology'
];

/** Passing score for FUVEST proficiency exam */
export const PASSING_SCORE = 21; // out of 30 = 70%

/** Confidence levels (auto-reported) */
export const CONFIDENCE_LEVELS = ['chutei', 'pouco', 'confiante', 'certeza'];
export const CONFIDENCE_MAP = { 'chutei': 0, 'pouco': 1, 'confiante': 2, 'certeza': 3 };

/** Question Bank thresholds */
export const BANK_MIN_FRESH_PER_TYPE = 5;
export const BANK_BATCH_COUNT = 10;
export const BANK_SESSION_GENERATE = 4;
export const BANK_STALE_DAYS = 30;

/** SRS/FSRS settings */
export const LEECH_THRESHOLD = 8;

/** Daily goals */
export const DEFAULT_DAILY_GOAL_MINUTES = 15;

/** IndexedDB */
export const DB_NAME = 'english_training';
export const DB_VERSION = 7;

/** IndexedDB Store Names */
export const STORES = {
  PROFILE: 'profile',
  QUESTION_ATTEMPTS: 'question_attempts',
  SESSIONS: 'sessions',
  FLASHCARDS: 'flashcards',
  SRS_CARDS: 'srs_cards',
  WEAKNESS_MAP: 'weakness_map',
  VOCABULARY: 'vocabulary',
  EXAM_ATTEMPTS: 'exam_attempts',
  QUESTION_BANK: 'question_bank',
  ACTIVE_PASSAGE: 'active_passage',
  TOKEN_LOG: 'token_log',
  META: 'meta',
  ANALYTICS: 'analytics',
  DAILY_STATS: 'daily_stats',
  STUDY_SESSIONS: 'study_sessions',
  EVENT_LOG: 'event_log',
  XP_LOG: 'xp_log',
  LESSON_PROGRESS: 'lesson_progress',
  EXPEDITION_RUNS: 'expedition_runs'
};

/** Behavior Logger Event Types */
export const EVENT_TYPES = ['click', 'navigation', 'answer', 'help_use', 'session', 'scroll', 'hesitation'];
export const EVENT_CATEGORIES = ['study', 'review', 'exam', 'flashcard', 'navigation', 'settings', 'lesson'];

/** XP System Constants */
export const XP_REWARDS = {
  ANSWER_CORRECT: 10,
  ANSWER_CORRECT_CERTEZA: 15,
  ANSWER_INCORRECT: 3,
  STREAK_BONUS_PER_DAY: 5,
  STREAK_BONUS_CAP: 30,
  FLASHCARD_REVIEW: 3,
  SRS_REVIEW: 5,
  DAILY_CHALLENGE: 25,
  LESSON_COMPLETE: 20,
  EXAM_COMPLETE: 50,
  TREASURE_MULTIPLIER: 2
};
export const XP_LEVEL_EXPONENT = 1.5;
export const XP_LEVEL_BASE = 100;
export const TREASURE_CHANCE = 0.10;

/** Daily Challenge Types */
export const CHALLENGE_TYPES = [
  { type: 'speed', title: 'Velocista', description: '5 questoes em 3 minutos', target: 5 },
  { type: 'accuracy', title: 'Precisao', description: '3 corretas consecutivas', target: 3 },
  { type: 'vocabulary', title: 'Vocabulario', description: 'Traduzir 5 palavras', target: 5 },
  { type: 'review', title: 'Revisao', description: '10 cards SRS revisados', target: 10 },
  { type: 'variety', title: 'Variedade', description: '1 questao de cada tipo (min 4)', target: 4 },
  { type: 'marathon', title: 'Maratona', description: '15 questoes respondidas', target: 15 },
  { type: 'perfect', title: 'Perfeicao', description: '5 corretas sem ajuda', target: 5 }
];
