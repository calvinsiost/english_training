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
export const DB_VERSION = 4;

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
  STUDY_SESSIONS: 'study_sessions'
};