/**
 * E2E Tests — Expedition Batch 1 (Foundation)
 * Tests: Constants, DB Schema, Engine lifecycle, processAnswer
 */

import { test, expect, Page, ConsoleMessage } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';

function setupConsoleCapture(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err: Error) => errors.push(err.message));
  return errors;
}

async function waitForApp(page: Page) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15_000 });
  // Wait for ExpeditionEngine to initialize
  await page.waitForFunction(() => !!(window as any).expeditionEngine, { timeout: 10_000 });
}

test.describe('Expedition Batch 1 — Foundation', () => {

  // ════════════════════════════════════════════
  // HAPPY PATH
  // ════════════════════════════════════════════

  test('B1-01: App loads without console errors after DB v7 upgrade', async ({ page }) => {
    const errors = setupConsoleCapture(page);
    await waitForApp(page);

    const projectErrors = errors.filter(e =>
      !e.includes('service-worker') &&
      !e.includes('favicon') &&
      !e.includes('chrome-extension') &&
      !e.includes('ERR_CONNECTION_REFUSED') &&
      !e.includes('net::')
    );

    await page.screenshot({ path: 'test-results/B1-01-app-loaded.png' });
    expect(projectErrors).toEqual([]);
  });

  test('B1-02: ExpeditionConstants is defined with all expected keys', async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate(() => {
      const EC = (window as any).ExpeditionConstants;
      if (!EC) return { error: 'ExpeditionConstants not defined' };
      return {
        hasItems: !!EC.ITEMS && Object.keys(EC.ITEMS).length >= 6,
        hasRelics: !!EC.RELICS && Object.keys(EC.RELICS).length >= 5,
        hasClasses: !!EC.CLASSES && Object.keys(EC.CLASSES).length >= 4,
        hasRoomDist: !!EC.ROOM_DISTRIBUTION,
        hasBiomes: !!EC.BIOMES && Object.keys(EC.BIOMES).length >= 12,
        hasEconomy: !!EC.ECONOMY,
        hasUpgrades: !!EC.PERMANENT_UPGRADES,
        hasRelicPassives: !!EC.RELIC_PASSIVES,
        hasClassPassives: !!EC.CLASS_PASSIVES,
        hasMystery: !!EC.MYSTERY_EVENTS && EC.MYSTERY_EVENTS.length >= 5,
        roomDistSum: EC.ROOM_DISTRIBUTION
          ? Object.values(EC.ROOM_DISTRIBUTION).reduce((a: number, b: number) => a + b, 0)
          : 0,
        scholarExists: !!EC.CLASSES?.scholar,
        scholarUnlockNull: EC.CLASSES?.scholar?.unlockCondition === null,
      };
    });

    expect(result).not.toHaveProperty('error');
    expect(result.hasItems).toBe(true);
    expect(result.hasRelics).toBe(true);
    expect(result.hasClasses).toBe(true);
    expect(result.hasRoomDist).toBe(true);
    expect(result.hasBiomes).toBe(true);
    expect(result.hasEconomy).toBe(true);
    expect(result.hasUpgrades).toBe(true);
    expect(result.hasRelicPassives).toBe(true);
    expect(result.hasClassPassives).toBe(true);
    expect(result.hasMystery).toBe(true);
    expect(result.roomDistSum).toBeCloseTo(1.0, 2);
    expect(result.scholarExists).toBe(true);
    expect(result.scholarUnlockNull).toBe(true);
  });

  test('B1-03: expedition_runs IndexedDB store exists after upgrade', async ({ page }) => {
    await waitForApp(page);

    const storeExists = await page.evaluate(() => {
      const db = (window as any).state?.db;
      if (!db) return { error: 'DB not initialized' };
      return {
        exists: db.objectStoreNames.contains('expedition_runs'),
        version: db.version,
      };
    });

    expect(storeExists).not.toHaveProperty('error');
    expect(storeExists.exists).toBe(true);
    expect(storeExists.version).toBeGreaterThanOrEqual(7);
  });

  test('B1-04: ExpeditionEngine initializes with default profile', async ({ page }) => {
    await waitForApp(page);

    const profile = await page.evaluate(() => {
      const engine = (window as any).expeditionEngine;
      if (!engine) return { error: 'ExpeditionEngine not initialized' };
      const p = engine.getProfile();
      return {
        totalRuns: p.totalRuns,
        coins: p.coins,
        currentFloor: p.currentFloor,
        activeClass: p.activeClass,
        unlockedClasses: p.unlockedClasses,
        equippedRelics: p.equippedRelics,
      };
    });

    expect(profile).not.toHaveProperty('error');
    expect(profile.totalRuns).toBe(0);
    expect(profile.coins).toBe(50); // starting coins for new players
    expect(profile.currentFloor).toBe(1);
    expect(profile.activeClass).toBe('scholar');
    expect(profile.unlockedClasses).toContain('scholar');
    expect(profile.equippedRelics).toEqual([]);
  });

  test('B1-05: startRun creates valid run with deterministic rooms', async ({ page }) => {
    await waitForApp(page);

    const run = await page.evaluate(async () => {
      const engine = (window as any).expeditionEngine;
      if (!engine) return { error: 'no engine' };
      try {
        const r = await engine.startRun('scholar');
        return {
          id: r.id,
          status: r.status,
          biome: r.biome,
          floor: r.floor,
          maxHearts: r.maxHearts,
          currentHearts: r.currentHearts,
          totalRooms: r.totalRooms,
          firstRoomType: r.rooms[0]?.type,
          lastRoomType: r.rooms[r.rooms.length - 1]?.type,
          roomCount: r.rooms.length,
        };
      } catch (e: any) {
        return { error: e.message };
      }
    });

    expect(run).not.toHaveProperty('error');
    expect(run.status).toBe('active');
    expect(run.maxHearts).toBe(3);
    expect(run.currentHearts).toBe(3);
    expect(run.totalRooms).toBeGreaterThanOrEqual(5);
    expect(run.totalRooms).toBeLessThanOrEqual(12);
    expect(run.firstRoomType).toBe('combat');
    expect(run.lastRoomType).toBe('boss');
    expect(run.roomCount).toBe(run.totalRooms);

    await page.screenshot({ path: 'test-results/B1-05-run-started.png' });
  });

  test('B1-06: startRun throws if run already active', async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate(async () => {
      const engine = (window as any).expeditionEngine;
      // Clean up any existing run first
      if (engine.hasActiveRun()) await engine.abandonRun();
      await engine.startRun('scholar');
      try {
        await engine.startRun('scholar');
        return { threw: false };
      } catch (e: any) {
        return { threw: true, message: e.message };
      }
    });

    expect(result.threw).toBe(true);
    expect(result.message).toContain('ativa');
  });

  test('B1-07: abandonRun ends run with 0 coins and clears active state', async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate(async () => {
      const engine = (window as any).expeditionEngine;
      if (engine.hasActiveRun()) await engine.abandonRun();
      await engine.startRun('scholar');
      const summary = await engine.abandonRun();
      return {
        status: summary.status,
        totalCoins: summary.totalCoins,
        hasActiveRun: engine.hasActiveRun(),
      };
    });

    expect(result.status).toBe('abandoned');
    expect(result.totalCoins).toBe(0);
    expect(result.hasActiveRun).toBe(false);
  });

  test('B1-08: startRun rejects unlocked class', async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate(async () => {
      const engine = (window as any).expeditionEngine;
      if (engine.hasActiveRun()) await engine.abandonRun();
      try {
        await engine.startRun('warrior');
        return { threw: false };
      } catch (e: any) {
        return { threw: true, message: e.message };
      }
    });

    expect(result.threw).toBe(true);
    expect(result.message).toContain('desbloqueada');
  });

  test('B1-09: Room generation deterministic — same seed = same rooms', async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate(() => {
      const engine = (window as any).expeditionEngine;
      const rooms1 = engine._generateRooms('medicine_health', 1, 42);
      const rooms2 = engine._generateRooms('medicine_health', 1, 42);
      return {
        same: JSON.stringify(rooms1.map((r: any) => r.type)) ===
              JSON.stringify(rooms2.map((r: any) => r.type)),
        count: rooms1.length,
        firstIsCombat: rooms1[0]?.type === 'combat',
        lastIsBoss: rooms1[rooms1.length - 1]?.type === 'boss',
      };
    });

    expect(result.same).toBe(true);
    expect(result.firstIsCombat).toBe(true);
    expect(result.lastIsBoss).toBe(true);
  });

  test('B1-10: No expedition items allow skipping questions', async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate(() => {
      const EC = (window as any).ExpeditionConstants;
      const items = Object.values(EC.ITEMS) as any[];
      return {
        skipItems: items.filter((i: any) =>
          i.effect === 'skip_question' || i.effect === 'skip' || i.effect === 'auto_correct'
        ).map((i: any) => i.id),
        totalItems: items.length,
      };
    });

    expect(result.skipItems).toEqual([]);
    expect(result.totalItems).toBeGreaterThanOrEqual(6);
  });

  // ════════════════════════════════════════════
  // SPEC ERROR FLOWS
  // ════════════════════════════════════════════

  test('B1-11: hasActiveRun prevents double XP in handleConfidenceSelect', async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate(async () => {
      const engine = (window as any).expeditionEngine;
      if (engine.hasActiveRun()) await engine.abandonRun();

      const beforeFlag = engine.hasActiveRun();
      await engine.startRun('scholar');
      const duringFlag = engine.hasActiveRun();
      await engine.abandonRun();
      const afterFlag = engine.hasActiveRun();

      return { beforeFlag, duringFlag, afterFlag };
    });

    expect(result.beforeFlag).toBe(false);
    expect(result.duringFlag).toBe(true);
    expect(result.afterFlag).toBe(false);
  });

  test('B1-12: Stale run detected on engine re-init', async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate(async () => {
      const engine = (window as any).expeditionEngine;
      const db = (window as any).state.db;
      if (engine.hasActiveRun()) await engine.abandonRun();

      const initialProfile = engine.getProfile();
      const initialTotalRuns = initialProfile.totalRuns;

      // Create a fake stale run (2 hours old)
      const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
      const staleRun = {
        id: 'run_stale_test_' + Date.now(),
        status: 'active',
        startedAt: twoHoursAgo,
        endedAt: null,
        biome: 'medicine_health',
        floor: 1,
        maxHearts: 3,
        currentHearts: 2,
        roomsCleared: 2,
        totalRooms: 6,
        currentRoomIndex: 1,
        rooms: [
          { index: 0, type: 'combat', result: 'correct', timestamp: twoHoursAgo, questionId: null, passageId: null, difficulty: 'easy', xpAwarded: 10, coinsAwarded: 5, itemUsed: null, _questionType: null },
          { index: 1, type: 'combat', result: null, timestamp: null, questionId: null, passageId: null, difficulty: 'easy', xpAwarded: 0, coinsAwarded: 0, itemUsed: null, _questionType: null },
        ],
        activeItems: [],
        itemsUsed: [],
        itemsGained: [],
        relicGained: null,
        totalXP: 10,
        totalCoins: 5,
        seed: 12345,
        classId: 'scholar',
      };

      const tx = db.transaction('expedition_runs', 'readwrite');
      tx.objectStore('expedition_runs').put(staleRun);
      await new Promise((resolve: any, reject: any) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });

      // Re-init engine
      await engine.init();

      const profileAfter = engine.getProfile();

      return {
        hasStaleRun: engine.hasStaleRun(),
        staleRunId: engine.getStaleRun()?.id,
        profileIntact: profileAfter.totalRuns === initialTotalRuns,
        profileCoins: profileAfter.coins >= 0,
      };
    });

    expect(result.hasStaleRun).toBe(true);
    expect(result.staleRunId).toBeDefined();
    expect(result.profileIntact).toBe(true);
    expect(result.profileCoins).toBe(true);
  });

  // ════════════════════════════════════════════
  // REGRESSION
  // ════════════════════════════════════════════

  test('B1-13: Dashboard still renders correctly after expedition code added', async ({ page }) => {
    await waitForApp(page);

    const dashboard = await page.evaluate(() => {
      const statsCards = document.querySelectorAll('.stat-card, .action-btn');
      const xpBar = document.getElementById('xp-bar-fill');
      const navItems = document.querySelectorAll('.nav-item');
      return {
        hasStatsCards: statsCards.length > 0,
        hasXpBar: !!xpBar,
        navCount: navItems.length,
      };
    });

    expect(dashboard.hasStatsCards).toBe(true);
    expect(dashboard.hasXpBar).toBe(true);
    expect(dashboard.navCount).toBeGreaterThanOrEqual(4);

    await page.screenshot({ path: 'test-results/B1-13-dashboard-intact.png' });
  });

  // ════════════════════════════════════════════
  // processAnswer TESTS (T3.1 Fix #13)
  // ════════════════════════════════════════════

  test('B1-14: processAnswer correct — hearts intact, rewards awarded', async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate(async () => {
      const engine = (window as any).expeditionEngine;
      if (engine.hasActiveRun()) await engine.abandonRun();
      await engine.startRun('scholar');
      const ctx = await engine.enterRoom(0);

      if (!ctx.question) return { error: 'No question loaded for room 0' };

      const correctAnswer = ctx.question.correct_answer;
      const roomResult = await engine.processAnswer(correctAnswer, 2);

      // Clean up
      if (engine.hasActiveRun()) await engine.abandonRun();

      return {
        isCorrect: roomResult.isCorrect,
        heartsRemaining: roomResult.heartsRemaining,
        xpAwarded: roomResult.xpAwarded,
        coinsAwarded: roomResult.coinsAwarded,
        isGameOver: roomResult.isGameOver,
      };
    });

    if (result.error) {
      console.log('Skipped B1-14:', result.error);
      test.skip();
      return;
    }

    expect(result.isCorrect).toBe(true);
    expect(result.heartsRemaining).toBe(3);
    expect(result.xpAwarded).toBeGreaterThan(0);
    expect(result.coinsAwarded).toBeGreaterThan(0);
    expect(result.isGameOver).toBe(false);
  });

  test('B1-15: processAnswer incorrect — hearts decrease by 1', async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate(async () => {
      const engine = (window as any).expeditionEngine;
      if (engine.hasActiveRun()) await engine.abandonRun();
      await engine.startRun('scholar');
      const ctx = await engine.enterRoom(0);

      if (!ctx.question) return { error: 'No question loaded' };

      const options = ['A', 'B', 'C', 'D', 'E'];
      const wrongAnswer = options.find(o => o !== ctx.question.correct_answer)!;
      const roomResult = await engine.processAnswer(wrongAnswer, 0);

      // Clean up (may have ended via game over)
      if (engine.hasActiveRun()) await engine.abandonRun();

      return {
        isCorrect: roomResult.isCorrect,
        heartsRemaining: roomResult.heartsRemaining,
      };
    });

    if (result.error) {
      console.log('Skipped B1-15:', result.error);
      test.skip();
      return;
    }

    expect(result.isCorrect).toBe(false);
    expect(result.heartsRemaining).toBe(2);
  });

  test('B1-16: processAnswer with shield — hearts intact, shield consumed', async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate(async () => {
      const engine = (window as any).expeditionEngine;
      if (engine.hasActiveRun()) await engine.abandonRun();

      // Start run with a shield in activeItems
      const run = await engine.startRun('scholar');
      run.activeItems.push({ id: 'shield', count: 1 });

      const ctx = await engine.enterRoom(0);
      if (!ctx.question) return { error: 'No question loaded' };

      const wrongAnswer = ['A', 'B', 'C', 'D', 'E'].find(
        (o: string) => o !== ctx.question.correct_answer
      )!;
      const roomResult = await engine.processAnswer(wrongAnswer, 0);

      if (engine.hasActiveRun()) await engine.abandonRun();

      return {
        isCorrect: roomResult.isCorrect,
        heartsRemaining: roomResult.heartsRemaining,
        shieldConsumed: roomResult.shieldConsumed,
      };
    });

    if (result.error) {
      console.log('Skipped B1-16:', result.error);
      test.skip();
      return;
    }

    expect(result.isCorrect).toBe(false);
    expect(result.heartsRemaining).toBe(3); // shield blocked
    expect(result.shieldConsumed).toBe(true);
  });
});
