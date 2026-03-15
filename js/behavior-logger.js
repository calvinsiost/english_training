/**
 * Behavior Logger - English Training
 * Tracks user interactions for adaptive learning.
 * All data stays local (IndexedDB). No network calls.
 *
 * Must be loaded AFTER idb-helpers.js (classic script).
 */

const EVENT_TYPES = ['click', 'navigation', 'answer', 'help_use', 'session', 'scroll', 'hesitation'];
const EVENT_CATEGORIES = ['study', 'review', 'exam', 'flashcard', 'navigation', 'settings', 'lesson'];
const BUFFER_FLUSH_SIZE = 20;
const BUFFER_FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER_SIZE = 100;
const ROTATION_DAYS = 90;

class BehaviorLogger {
  constructor(db) {
    this.db = db;
    this._buffer = [];
    this._flushTimer = null;
    this._sessionId = null;
    this._questionLoadTime = null;
    this._disabled = false;
  }

  init() {
    this._sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    // Periodic flush
    this._flushTimer = setInterval(() => this._flush(), BUFFER_FLUSH_INTERVAL_MS);

    // Flush on page unload
    window.addEventListener('beforeunload', () => this._flushSync());

    // Rotate old events on startup (non-blocking)
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => this._rotateOldEvents());
    } else {
      setTimeout(() => this._rotateOldEvents(), 5000);
    }

    console.log('[BehaviorLogger] Initialized');
  }

  /**
   * Log a user interaction event.
   * @param {string} type - One of EVENT_TYPES
   * @param {string} category - One of EVENT_CATEGORIES
   * @param {string} action - Specific action name
   * @param {object} metadata - Action-specific data
   */
  log(type, category, action, metadata = {}) {
    if (this._disabled) return;
    if (!EVENT_TYPES.includes(type)) {
      console.warn('[BehaviorLogger] Invalid type:', type);
      return;
    }
    if (!EVENT_CATEGORIES.includes(category)) {
      console.warn('[BehaviorLogger] Invalid category:', category);
      return;
    }

    const now = new Date();
    const event = {
      id: 'evt_' + now.getTime() + '_' + Math.random().toString(36).slice(2, 6),
      type,
      category,
      action,
      metadata,
      timestamp: now.toISOString(),
      sessionId: this._sessionId,
      viewId: window.location.hash || '#/',
      dayKey: now.toISOString().split('T')[0]
    };

    this._buffer.push(event);

    // Force flush if buffer is full
    if (this._buffer.length >= MAX_BUFFER_SIZE) {
      this._flush();
    } else if (this._buffer.length >= BUFFER_FLUSH_SIZE) {
      this._scheduleFlush();
    }
  }

  /** Mark when a question starts loading (for hesitation/time tracking) */
  markQuestionLoad() {
    this._questionLoadTime = performance.now();
  }

  /** Get milliseconds since question loaded */
  getTimeSinceQuestionLoad() {
    if (!this._questionLoadTime) return 0;
    return Math.round(performance.now() - this._questionLoadTime);
  }

  // --- Query methods ---

  async getEventsByDay(dayKey) {
    if (!this.db) return [];
    try {
      const tx = this.db.transaction('event_log', 'readonly');
      const store = tx.objectStore('event_log');
      const index = store.index('dayKey');
      return await new Promise((resolve, reject) => {
        const request = index.getAll(dayKey);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn('[BehaviorLogger] getEventsByDay error:', e);
      return [];
    }
  }

  async getAggregatedStats(days = 30) {
    if (!this.db) return {};
    try {
      const tx = this.db.transaction('event_log', 'readonly');
      const events = await idbGetAll(tx.objectStore('event_log'));
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString();

      const recent = events.filter(e => e.timestamp >= cutoffStr);

      const stats = {
        totalEvents: recent.length,
        byType: {},
        byCategory: {},
        byDay: {},
        avgEventsPerDay: 0
      };

      for (const e of recent) {
        stats.byType[e.type] = (stats.byType[e.type] || 0) + 1;
        stats.byCategory[e.category] = (stats.byCategory[e.category] || 0) + 1;
        stats.byDay[e.dayKey] = (stats.byDay[e.dayKey] || 0) + 1;
      }

      const activeDays = Object.keys(stats.byDay).length;
      stats.avgEventsPerDay = activeDays > 0 ? Math.round(stats.totalEvents / activeDays) : 0;

      return stats;
    } catch (e) {
      console.warn('[BehaviorLogger] getAggregatedStats error:', e);
      return {};
    }
  }

  async getStudyPatterns() {
    if (!this.db) return { preferredHour: null, avgSessionLength: 0, returnInterval: 0 };
    try {
      const tx = this.db.transaction('event_log', 'readonly');
      const events = await idbGetAll(tx.objectStore('event_log'));

      // Find preferred hour from answer events
      const hourCounts = new Array(24).fill(0);
      const sessionDays = new Set();

      for (const e of events) {
        if (e.type === 'answer' || e.type === 'session') {
          const hour = new Date(e.timestamp).getHours();
          hourCounts[hour]++;
        }
        sessionDays.add(e.dayKey);
      }

      const preferredHour = hourCounts.indexOf(Math.max(...hourCounts));

      // Calculate avg session length from session events
      const sessionStarts = events
        .filter(e => e.type === 'session' && e.action === 'start')
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const sessionEnds = events
        .filter(e => e.type === 'session' && e.action === 'end')
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      let totalLength = 0;
      let sessionCount = 0;
      for (let i = 0; i < Math.min(sessionStarts.length, sessionEnds.length); i++) {
        const start = new Date(sessionStarts[i].timestamp).getTime();
        const end = new Date(sessionEnds[i].timestamp).getTime();
        if (end > start) {
          totalLength += (end - start) / 1000;
          sessionCount++;
        }
      }

      // Calculate return interval (days between sessions)
      const sortedDays = Array.from(sessionDays).sort();
      let totalGap = 0;
      let gapCount = 0;
      for (let i = 1; i < sortedDays.length; i++) {
        const d1 = new Date(sortedDays[i - 1]);
        const d2 = new Date(sortedDays[i]);
        const gap = (d2 - d1) / (1000 * 60 * 60 * 24);
        totalGap += gap;
        gapCount++;
      }

      return {
        preferredHour: hourCounts.some(c => c > 0) ? preferredHour : null,
        avgSessionLength: sessionCount > 0 ? Math.round(totalLength / sessionCount) : 0,
        returnInterval: gapCount > 0 ? Math.round((totalGap / gapCount) * 10) / 10 : 0
      };
    } catch (e) {
      console.warn('[BehaviorLogger] getStudyPatterns error:', e);
      return { preferredHour: null, avgSessionLength: 0, returnInterval: 0 };
    }
  }

  // --- Internal methods ---

  _scheduleFlush() {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => this._flush());
    } else {
      setTimeout(() => this._flush(), 100);
    }
  }

  async _flush() {
    if (this._buffer.length === 0 || !this.db) return;

    const batch = this._buffer.splice(0);
    try {
      const tx = this.db.transaction('event_log', 'readwrite');
      const store = tx.objectStore('event_log');
      for (const event of batch) {
        store.put(event);
      }
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      });
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        console.warn('[BehaviorLogger] Storage quota exceeded, rotating immediately');
        await this._rotateOldEvents(30);
        // Retry once
        try {
          const tx2 = this.db.transaction('event_log', 'readwrite');
          const store2 = tx2.objectStore('event_log');
          for (const event of batch) {
            store2.put(event);
          }
          await new Promise((resolve, reject) => {
            tx2.oncomplete = resolve;
            tx2.onerror = () => reject(tx2.error);
          });
        } catch (_) {
          console.error('[BehaviorLogger] Flush failed after rotation, disabling');
          this._disabled = true;
        }
      } else {
        console.warn('[BehaviorLogger] Flush error:', e);
      }
    }
  }

  _flushSync() {
    if (this._buffer.length === 0 || !this.db) return;
    try {
      const tx = this.db.transaction('event_log', 'readwrite');
      const store = tx.objectStore('event_log');
      for (const event of this._buffer) {
        store.put(event);
      }
      this._buffer = [];
    } catch (e) {
      console.warn('[BehaviorLogger] Sync flush error:', e);
    }
  }

  async _rotateOldEvents(maxAgeDays = ROTATION_DAYS) {
    if (!this.db) return;
    try {
      const tx = this.db.transaction('event_log', 'readwrite');
      const store = tx.objectStore('event_log');
      const allEvents = await new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - maxAgeDays);
      const cutoffStr = cutoff.toISOString();

      let deleted = 0;
      for (const event of allEvents) {
        if (event.timestamp < cutoffStr) {
          store.delete(event.id);
          deleted++;
        }
      }

      if (deleted > 0) {
        console.log(`[BehaviorLogger] Rotated ${deleted} events older than ${maxAgeDays} days`);
      }
    } catch (e) {
      console.warn('[BehaviorLogger] Rotation error:', e);
    }
  }

  destroy() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
    this._flushSync();
  }
}

// Export to global scope
window.BehaviorLogger = BehaviorLogger;
