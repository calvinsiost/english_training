/**
 * E2E Tests — Expedition Batch 2 (UI)
 * Tests: Hub rendering, Map rendering, Navigation, Dashboard button, Combat flow
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
  await page.waitForFunction(() => !!(window as any).expeditionUI, { timeout: 10_000 });
}

test.describe('Expedition Batch 2 — UI', () => {

  test('B2-01: Dashboard has Expedition button with floor badge', async ({ page }) => {
    await waitForApp(page);

    const btn = page.locator('#btn-expedition');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('Expedição');

    const badge = page.locator('#expedition-floor');
    await expect(badge).toContainText('Andar');

    await page.screenshot({ path: 'test-results/B2-01-dashboard-expedition-btn.png' });
  });

  test('B2-02: Clicking Expedition button navigates to #/expedition', async ({ page }) => {
    await waitForApp(page);

    await page.click('#btn-expedition');
    await page.waitForTimeout(500);

    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toBe('#/expedition');

    const expeditionView = page.locator('#expedition');
    await expect(expeditionView).toHaveClass(/view--active/);
  });

  test('B2-03: Hub renders with class selector, stats, and start button', async ({ page }) => {
    await waitForApp(page);

    // Clean up any active run
    await page.evaluate(async () => {
      const engine = (window as any).expeditionEngine;
      if (engine.hasActiveRun()) await engine.abandonRun();
      if (engine.hasStaleRun()) await engine.abandonStaleRun();
    });

    await page.click('#btn-expedition');
    await page.waitForTimeout(500);

    // Check hub elements
    await expect(page.locator('.expedition-hub')).toBeVisible();
    await expect(page.locator('.expedition-hub-header')).toContainText('Expedição Literária');
    await expect(page.locator('.expedition-start-btn')).toBeVisible();
    await expect(page.locator('.expedition-start-btn')).toContainText('Iniciar Expedição');

    // Stats row
    await expect(page.locator('.expedition-stats-row')).toBeVisible();
    const statValues = page.locator('.expedition-stat-value');
    expect(await statValues.count()).toBeGreaterThanOrEqual(3);

    // Class cards
    const classCards = page.locator('.expedition-class-card');
    expect(await classCards.count()).toBeGreaterThanOrEqual(4);

    // Scholar should be selected by default
    const scholarCard = page.locator('.expedition-class-card.selected');
    await expect(scholarCard).toBeVisible();

    await page.screenshot({ path: 'test-results/B2-03-hub.png' });
  });

  test('B2-04: Start expedition shows map with rooms', async ({ page }) => {
    await waitForApp(page);

    await page.evaluate(async () => {
      const engine = (window as any).expeditionEngine;
      if (engine.hasActiveRun()) await engine.abandonRun();
      if (engine.hasStaleRun()) await engine.abandonStaleRun();
    });

    await page.click('#btn-expedition');
    await page.waitForTimeout(500);
    await page.click('.expedition-start-btn');
    await page.waitForTimeout(500);

    // Map should be visible
    await expect(page.locator('.expedition-map')).toBeVisible();

    // Hearts should be visible
    const hearts = page.locator('.expedition-heart');
    expect(await hearts.count()).toBeGreaterThanOrEqual(3);

    // Room nodes
    const rooms = page.locator('.expedition-room-node');
    expect(await rooms.count()).toBeGreaterThanOrEqual(5);

    // First room should be current
    const currentRoom = page.locator('.expedition-room-node.current');
    await expect(currentRoom).toBeVisible();

    // Last room should be locked
    const lockedRooms = page.locator('.expedition-room-node.locked');
    expect(await lockedRooms.count()).toBeGreaterThanOrEqual(1);

    // Biome name shown
    await expect(page.locator('.expedition-map-biome')).toBeVisible();

    await page.screenshot({ path: 'test-results/B2-04-map.png' });
  });

  test('B2-05: Clicking current room enters combat', async ({ page }) => {
    await waitForApp(page);

    await page.evaluate(async () => {
      const engine = (window as any).expeditionEngine;
      if (engine.hasActiveRun()) await engine.abandonRun();
      if (engine.hasStaleRun()) await engine.abandonStaleRun();
    });

    await page.click('#btn-expedition');
    await page.waitForTimeout(500);
    await page.click('.expedition-start-btn');
    await page.waitForTimeout(500);

    // Click current room
    await page.click('.expedition-room-node.current');
    await page.waitForTimeout(1500);

    // Should be in study view now
    const hash = await page.evaluate(() => window.location.hash);
    expect(hash).toBe('#/study');

    // Combat bar should be visible
    const combatBar = page.locator('#expedition-combat-bar');
    await expect(combatBar).toBeVisible();

    // Hearts visible in combat bar
    const hearts = combatBar.locator('.expedition-heart');
    expect(await hearts.count()).toBeGreaterThanOrEqual(3);

    await page.screenshot({ path: 'test-results/B2-05-combat.png' });
  });

  test('B2-06: Abandon expedition from map shows summary with 0 coins', async ({ page }) => {
    await waitForApp(page);

    await page.evaluate(async () => {
      const engine = (window as any).expeditionEngine;
      if (engine.hasActiveRun()) await engine.abandonRun();
      if (engine.hasStaleRun()) await engine.abandonStaleRun();
    });

    await page.click('#btn-expedition');
    await page.waitForTimeout(500);
    await page.click('.expedition-start-btn');
    await page.waitForTimeout(500);

    // Click abandon
    await page.click('[data-action="abandon-run"]');
    await page.waitForTimeout(500);

    // Summary should show
    await expect(page.locator('.expedition-summary')).toBeVisible();
    await expect(page.locator('.expedition-summary-title')).toContainText('Abandonada');

    // Coins should be 0
    const coinsText = await page.locator('.expedition-summary-loot-item.coins').textContent();
    expect(coinsText).toContain('+0');

    await page.screenshot({ path: 'test-results/B2-06-summary-abandoned.png' });
  });

  test('B2-07: Summary "Voltar" returns to hub', async ({ page }) => {
    await waitForApp(page);

    await page.evaluate(async () => {
      const engine = (window as any).expeditionEngine;
      if (engine.hasActiveRun()) await engine.abandonRun();
      if (engine.hasStaleRun()) await engine.abandonStaleRun();
    });

    await page.click('#btn-expedition');
    await page.waitForTimeout(500);
    await page.click('.expedition-start-btn');
    await page.waitForTimeout(500);
    await page.click('[data-action="abandon-run"]');
    await page.waitForTimeout(500);

    // Click "Voltar"
    await page.click('[data-action="back-to-hub"]');
    await page.waitForTimeout(500);

    // Hub should be visible again
    await expect(page.locator('.expedition-hub')).toBeVisible();
  });

  test('B2-08: Locked classes are not clickable', async ({ page }) => {
    await waitForApp(page);

    await page.evaluate(async () => {
      const engine = (window as any).expeditionEngine;
      if (engine.hasActiveRun()) await engine.abandonRun();
      if (engine.hasStaleRun()) await engine.abandonStaleRun();
    });

    await page.click('#btn-expedition');
    await page.waitForTimeout(500);

    // Warrior should be locked (needs 10 completed runs)
    const lockedCards = page.locator('.expedition-class-card.locked');
    expect(await lockedCards.count()).toBeGreaterThanOrEqual(1);

    // Click locked card — scholar should remain selected
    const firstLocked = lockedCards.first();
    await firstLocked.click();
    await page.waitForTimeout(200);

    const selectedCard = page.locator('.expedition-class-card.selected');
    const selectedText = await selectedCard.textContent();
    expect(selectedText).toContain('Estudioso');
  });

  test('B2-09: No console errors during expedition flow', async ({ page }) => {
    const errors = setupConsoleCapture(page);
    await waitForApp(page);

    await page.evaluate(async () => {
      const engine = (window as any).expeditionEngine;
      if (engine.hasActiveRun()) await engine.abandonRun();
      if (engine.hasStaleRun()) await engine.abandonStaleRun();
    });

    // Navigate to expedition
    await page.click('#btn-expedition');
    await page.waitForTimeout(500);

    // Start run
    await page.click('.expedition-start-btn');
    await page.waitForTimeout(500);

    // Enter combat room
    await page.click('.expedition-room-node.current');
    await page.waitForTimeout(1500);

    // Abandon and go back
    await page.evaluate(async () => {
      const engine = (window as any).expeditionEngine;
      if (engine.hasActiveRun()) await engine.abandonRun();
    });
    await page.evaluate(() => { window.location.hash = '#/'; });
    await page.waitForTimeout(500);

    const projectErrors = errors.filter(e =>
      !e.includes('service-worker') &&
      !e.includes('favicon') &&
      !e.includes('chrome-extension') &&
      !e.includes('ERR_CONNECTION_REFUSED') &&
      !e.includes('net::')
    );

    expect(projectErrors).toEqual([]);
  });

  test('B2-10: Stale run banner shows in hub with resume/abandon buttons', async ({ page }) => {
    await waitForApp(page);

    // Create a stale run (2 hours old)
    await page.evaluate(async () => {
      const engine = (window as any).expeditionEngine;
      if (engine.hasActiveRun()) await engine.abandonRun();
      if (engine.hasStaleRun()) await engine.abandonStaleRun();

      const db = (window as any).state.db;
      const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
      const staleRun = {
        id: 'run_stale_ui_test_' + Date.now(),
        status: 'active',
        startedAt: twoHoursAgo,
        endedAt: null,
        biome: 'technology_ai',
        floor: 2,
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
        seed: 54321,
        classId: 'scholar',
      };

      const tx = db.transaction('expedition_runs', 'readwrite');
      tx.objectStore('expedition_runs').put(staleRun);
      await new Promise((resolve: any) => { tx.oncomplete = resolve; });

      await engine.init();
    });

    // Navigate to expedition
    await page.click('#btn-expedition');
    await page.waitForTimeout(500);

    // Stale banner should be visible
    await expect(page.locator('.expedition-stale-banner')).toBeVisible();
    await expect(page.locator('.resume-btn')).toBeVisible();

    // Start button should be disabled
    const startBtn = page.locator('.expedition-start-btn');
    await expect(startBtn).toBeDisabled();

    await page.screenshot({ path: 'test-results/B2-10-stale-banner.png' });

    // Click abandon stale
    await page.click('[data-action="abandon-stale"]');
    await page.waitForTimeout(500);

    // Banner gone, start button enabled
    await expect(page.locator('.expedition-stale-banner')).not.toBeVisible();
    await expect(page.locator('.expedition-start-btn')).toBeEnabled();
  });
});
