/**
 * E2E Full Validation — Expedition System
 * Covers all critical flows as a real user across 3 viewports.
 * Timeout: 10s per step. Screenshots + console errors + visual checks.
 */

import { test, expect, Page, ConsoleMessage } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';
const SS_DIR = path.resolve('test-results/validation/expedition');
const STEP_TIMEOUT = 10_000;

// Viewports
const VIEWPORTS = {
  desktop: { width: 1280, height: 720 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
};

// Results collector
interface TestResult {
  flow: string;
  viewport: string;
  step: string;
  status: 'PASS' | 'FAIL';
  severity?: string;
  detail?: string;
  screenshot?: string;
  consoleErrors?: string[];
  duration?: number;
}

const allResults: TestResult[] = [];

// Helpers
function ssPath(flow: string, viewport: string, step: string): string {
  const dir = path.join(SS_DIR, viewport);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${flow}-${step}.png`);
}

function setupCapture(page: Page) {
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    const text = msg.text();
    // Ignore external/browser noise
    if (text.includes('service-worker') || text.includes('favicon') ||
        text.includes('chrome-extension') || text.includes('net::') ||
        text.includes('ERR_CONNECTION')) return;
    if (msg.type() === 'error') errors.push(text);
    if (msg.type() === 'warning' && !text.includes('DevTools')) warnings.push(text);
  });
  page.on('pageerror', (err: Error) => {
    errors.push(`[pageerror] ${err.message}`);
  });
  return { errors, warnings };
}

async function waitStable(page: Page, selector?: string) {
  try {
    await page.waitForLoadState('networkidle', { timeout: 5000 });
  } catch { /* fallback to selector */ }
  if (selector) {
    await page.waitForSelector(selector, { state: 'visible', timeout: STEP_TIMEOUT });
  }
  await page.waitForTimeout(300); // visual stabilization
}

async function cleanExpedition(page: Page) {
  await page.evaluate(async () => {
    const engine = (window as any).expeditionEngine;
    if (!engine) return;
    if (engine.hasActiveRun()) await engine.abandonRun();
    if (engine.hasStaleRun()) await engine.abandonStaleRun();
  });
}

// ═══════════════════════════════════════════════════════
// TEST FLOWS
// ═══════════════════════════════════════════════════════

for (const [vpName, vpSize] of Object.entries(VIEWPORTS)) {

  test.describe(`Expedition Validation — ${vpName} (${vpSize.width}x${vpSize.height})`, () => {

    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(vpSize);
    });

    // ────────────────────────────────────────
    // FLOW 1: Dashboard → Hub → Start → Map
    // ────────────────────────────────────────
    test(`F1: Dashboard to Map flow [${vpName}]`, async ({ page }) => {
      const { errors } = setupCapture(page);
      const t0 = Date.now();

      // Step 1: Load app
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: STEP_TIMEOUT });
      await page.waitForFunction(() => !!(window as any).expeditionUI, { timeout: STEP_TIMEOUT });
      await cleanExpedition(page);
      await waitStable(page, '#btn-expedition');

      const loadTime = Date.now() - t0;
      await page.screenshot({ path: ssPath('F1', vpName, '01-dashboard') });

      // Visual check: expedition button visible
      const expBtn = page.locator('#btn-expedition');
      await expect(expBtn).toBeVisible({ timeout: STEP_TIMEOUT });
      await expect(expBtn).toContainText('Expedição');

      // Check badge
      const badge = page.locator('#expedition-floor');
      await expect(badge).toBeVisible();

      allResults.push({
        flow: 'F1', viewport: vpName, step: '01-dashboard',
        status: errors.length > 0 ? 'FAIL' : 'PASS',
        severity: errors.length > 0 ? '🔴' : undefined,
        consoleErrors: errors.length > 0 ? [...errors] : undefined,
        duration: loadTime
      });

      // Step 2: Navigate to expedition hub
      await expBtn.click();
      await waitStable(page, '.expedition-hub');
      await page.screenshot({ path: ssPath('F1', vpName, '02-hub') });

      // Visual checks: hub elements
      await expect(page.locator('.expedition-hub-header')).toContainText('Expedição Literária');
      await expect(page.locator('.expedition-start-btn')).toBeVisible();
      await expect(page.locator('.expedition-stats-row')).toBeVisible();
      await expect(page.locator('.expedition-class-card')).toHaveCount(4, { timeout: STEP_TIMEOUT });

      // Check class cards not overflowing
      const hubBox = await page.locator('.expedition-hub').boundingBox();
      const startBox = await page.locator('.expedition-start-btn').boundingBox();
      const overflowCheck = hubBox && startBox && startBox.y + startBox.height <= vpSize.height + 50;

      allResults.push({
        flow: 'F1', viewport: vpName, step: '02-hub',
        status: 'PASS',
        detail: overflowCheck ? undefined : 'Start button may be below fold'
      });

      // Step 3: Start expedition
      await page.click('.expedition-start-btn');
      await waitStable(page, '.expedition-map');
      await page.screenshot({ path: ssPath('F1', vpName, '03-map') });

      // Visual checks: map elements
      await expect(page.locator('.expedition-map')).toBeVisible();
      await expect(page.locator('.expedition-heart')).toHaveCount(3, { timeout: STEP_TIMEOUT }); // scholar = 3 hearts
      const roomNodes = page.locator('.expedition-room-node');
      const roomCount = await roomNodes.count();
      expect(roomCount).toBeGreaterThanOrEqual(5);

      // First room should be current (clickable)
      await expect(page.locator('.expedition-room-node.current')).toBeVisible();
      // Last room should be boss
      const lastRoom = roomNodes.last();
      const lastRoomText = await lastRoom.textContent();
      expect(lastRoomText).toContain('Boss');

      // Check biome label
      await expect(page.locator('.expedition-map-biome')).toBeVisible();

      allResults.push({
        flow: 'F1', viewport: vpName, step: '03-map',
        status: 'PASS'
      });

      // Cleanup
      await cleanExpedition(page);
    });

    // ────────────────────────────────────────
    // FLOW 2: Combat room flow
    // ────────────────────────────────────────
    test(`F2: Combat room — answer question [${vpName}]`, async ({ page }) => {
      const { errors } = setupCapture(page);

      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: STEP_TIMEOUT });
      await page.waitForFunction(() => !!(window as any).expeditionUI, { timeout: STEP_TIMEOUT });
      await cleanExpedition(page);

      // Start expedition
      await page.click('#btn-expedition');
      await waitStable(page, '.expedition-start-btn');
      await page.click('.expedition-start-btn');
      await waitStable(page, '.expedition-room-node.current');

      // Enter combat room
      await page.click('.expedition-room-node.current');
      await page.waitForTimeout(1500);
      await page.screenshot({ path: ssPath('F2', vpName, '01-combat') });

      // Check combat bar is visible
      const combatBar = page.locator('#expedition-combat-bar');
      const hasCombatBar = await combatBar.isVisible().catch(() => false);

      // Check study view is active
      const hash = await page.evaluate(() => window.location.hash);

      allResults.push({
        flow: 'F2', viewport: vpName, step: '01-combat',
        status: hash === '#/study' && hasCombatBar ? 'PASS' : 'FAIL',
        severity: hash !== '#/study' ? '🔴' : (!hasCombatBar ? '🟡' : undefined),
        detail: `hash=${hash}, combatBar=${hasCombatBar}`
      });

      // Check question is loaded
      const hasQuestion = await page.evaluate(() => {
        const el = document.querySelector('.question-text, #question-text');
        return el && el.textContent && el.textContent.length > 5;
      });

      // Check options are visible
      const optionBtns = page.locator('.option-btn');
      const optionCount = await optionBtns.count();

      allResults.push({
        flow: 'F2', viewport: vpName, step: '02-question-loaded',
        status: hasQuestion && optionCount >= 4 ? 'PASS' : 'FAIL',
        severity: !hasQuestion ? '🔴' : (optionCount < 4 ? '🟡' : undefined),
        detail: `question=${hasQuestion}, options=${optionCount}`
      });

      // Answer first option (may be correct or incorrect)
      if (optionCount > 0) {
        await optionBtns.first().click();
        await page.waitForTimeout(500);
        await page.screenshot({ path: ssPath('F2', vpName, '03-answered') });

        // Confidence section should appear
        const confSection = page.locator('#confidence-section');
        const confVisible = await confSection.isVisible().catch(() => false);

        if (confVisible) {
          // Click first confidence button
          await page.locator('.confidence-btn').first().click();
          await page.waitForTimeout(1000);
          await page.screenshot({ path: ssPath('F2', vpName, '04-feedback') });
        }
      }

      // Cleanup
      await page.evaluate(async () => {
        const engine = (window as any).expeditionEngine;
        if (engine?.hasActiveRun()) await engine.abandonRun();
      });

      allResults.push({
        flow: 'F2', viewport: vpName, step: '04-feedback',
        status: errors.length === 0 ? 'PASS' : 'FAIL',
        severity: errors.length > 0 ? '🔴' : undefined,
        consoleErrors: errors.length > 0 ? [...errors] : undefined
      });
    });

    // ────────────────────────────────────────
    // FLOW 3: Abandon flow
    // ────────────────────────────────────────
    test(`F3: Abandon expedition → summary → hub [${vpName}]`, async ({ page }) => {
      const { errors } = setupCapture(page);

      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: STEP_TIMEOUT });
      await page.waitForFunction(() => !!(window as any).expeditionUI, { timeout: STEP_TIMEOUT });
      await cleanExpedition(page);

      await page.click('#btn-expedition');
      await waitStable(page, '.expedition-start-btn');
      await page.click('.expedition-start-btn');
      await waitStable(page, '.expedition-room-node.current');

      // Abandon
      await page.click('[data-action="abandon-run"]');
      await page.waitForTimeout(500);
      await page.screenshot({ path: ssPath('F3', vpName, '01-summary') });

      // Summary visible
      await expect(page.locator('.expedition-summary')).toBeVisible({ timeout: STEP_TIMEOUT });
      await expect(page.locator('.expedition-summary-title')).toContainText('Abandonada');

      // Coins should be 0
      const coinsText = await page.locator('.expedition-summary-loot-item.coins').textContent();
      const zeroCoins = coinsText?.includes('+0');

      allResults.push({
        flow: 'F3', viewport: vpName, step: '01-summary',
        status: zeroCoins ? 'PASS' : 'FAIL',
        severity: !zeroCoins ? '🟡' : undefined,
        detail: `coins text: ${coinsText}`
      });

      // Back to hub
      await page.click('[data-action="back-to-hub"]');
      await waitStable(page, '.expedition-hub');
      await page.screenshot({ path: ssPath('F3', vpName, '02-back-to-hub') });

      await expect(page.locator('.expedition-hub')).toBeVisible();
      await expect(page.locator('.expedition-start-btn')).toBeVisible();

      allResults.push({
        flow: 'F3', viewport: vpName, step: '02-back-to-hub',
        status: 'PASS'
      });
    });

    // ────────────────────────────────────────
    // FLOW 4: Hub — shops and relics
    // ────────────────────────────────────────
    test(`F4: Hub shops — items, upgrades, class select [${vpName}]`, async ({ page }) => {
      const { errors } = setupCapture(page);

      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: STEP_TIMEOUT });
      await page.waitForFunction(() => !!(window as any).expeditionUI, { timeout: STEP_TIMEOUT });
      await cleanExpedition(page);

      // Give coins for testing
      await page.evaluate(async () => {
        const engine = (window as any).expeditionEngine;
        engine._profile.coins = 300;
        engine._profile.unlockedRelics = ['vocab_shield', 'speed_reader'];
        engine._profile.equippedRelics = [];
        await engine._persistProfile();
      });

      await page.click('#btn-expedition');
      await waitStable(page, '.expedition-hub');

      // Check coins display
      await expect(page.locator('.expedition-coins')).toContainText('300');

      // Open item shop
      const itemShop = page.locator('details:has(h4:text("Loja de Itens"))');
      if (await itemShop.isVisible()) {
        await itemShop.click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: ssPath('F4', vpName, '01-item-shop') });

        const buyBtns = page.locator('[data-action="buy-item"]');
        expect(await buyBtns.count()).toBeGreaterThanOrEqual(6);

        // Buy an item
        await page.click('[data-action="buy-item"][data-item="hint_token"]');
        await page.waitForTimeout(500);

        // Coins should decrease
        await expect(page.locator('.expedition-coins')).toContainText('285');

        allResults.push({
          flow: 'F4', viewport: vpName, step: '01-item-shop',
          status: 'PASS'
        });
      }

      // Open upgrades shop
      const upgradeShop = page.locator('details:has(h4:text("Upgrades Permanentes"))');
      if (await upgradeShop.isVisible()) {
        await upgradeShop.click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: ssPath('F4', vpName, '02-upgrades') });

        const upgBtns = page.locator('[data-action="buy-upgrade"]');
        expect(await upgBtns.count()).toBeGreaterThanOrEqual(6);

        allResults.push({
          flow: 'F4', viewport: vpName, step: '02-upgrades',
          status: 'PASS'
        });
      }

      // Relic equip
      const relicSection = page.locator('.expedition-relics');
      if (await relicSection.isVisible()) {
        await page.click('[data-action="equip-relic"][data-relic="vocab_shield"]');
        await page.waitForTimeout(500);
        await page.screenshot({ path: ssPath('F4', vpName, '03-relic-equipped') });

        // Check it's equipped
        const equipped = page.locator('.expedition-relic-slot.filled');
        expect(await equipped.count()).toBeGreaterThanOrEqual(1);

        allResults.push({
          flow: 'F4', viewport: vpName, step: '03-relic-equipped',
          status: 'PASS'
        });
      }

      // Class selection — try selecting scholar (should work)
      const scholarCard = page.locator('.expedition-class-card').first();
      await scholarCard.click();
      await page.waitForTimeout(300);

      // Locked class — should not change selection
      const lockedCards = page.locator('.expedition-class-card.locked');
      if (await lockedCards.count() > 0) {
        await lockedCards.first().click();
        await page.waitForTimeout(300);
        // Scholar should still be selected
        const selectedCard = page.locator('.expedition-class-card.selected');
        const selectedText = await selectedCard.textContent();
        const stillScholar = selectedText?.includes('Estudioso');

        allResults.push({
          flow: 'F4', viewport: vpName, step: '04-locked-class',
          status: stillScholar ? 'PASS' : 'FAIL',
          severity: !stillScholar ? '🟡' : undefined
        });
      }

      // Console errors check
      if (errors.length > 0) {
        allResults.push({
          flow: 'F4', viewport: vpName, step: 'console-errors',
          status: 'FAIL', severity: '🔴',
          consoleErrors: [...errors]
        });
      }
    });

    // ────────────────────────────────────────
    // FLOW 5: Stale run detection (non-spec, flagged)
    // ────────────────────────────────────────
    test(`F5: Stale run banner [${vpName}] [non-spec]`, async ({ page }) => {
      const { errors } = setupCapture(page);

      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: STEP_TIMEOUT });
      await page.waitForFunction(() => !!(window as any).expeditionUI, { timeout: STEP_TIMEOUT });
      await cleanExpedition(page);

      // Create stale run
      await page.evaluate(async () => {
        const engine = (window as any).expeditionEngine;
        const db = (window as any).state.db;
        const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
        const staleRun = {
          id: 'run_validation_stale_' + Date.now(),
          status: 'active', startedAt: twoHoursAgo, endedAt: null,
          biome: 'technology_ai', floor: 1, maxHearts: 3, currentHearts: 2,
          roomsCleared: 1, totalRooms: 5, currentRoomIndex: 0,
          rooms: [{ index: 0, type: 'combat', result: 'correct', timestamp: twoHoursAgo,
                    questionId: null, passageId: null, difficulty: 'easy',
                    xpAwarded: 10, coinsAwarded: 5, itemUsed: null, _questionType: null }],
          activeItems: [], itemsUsed: [], itemsGained: [],
          relicGained: null, totalXP: 10, totalCoins: 5, seed: 99999, classId: 'scholar'
        };
        const tx = db.transaction('expedition_runs', 'readwrite');
        tx.objectStore('expedition_runs').put(staleRun);
        await new Promise((r: any) => { tx.oncomplete = r; });
        await engine.init();
      });

      await page.click('#btn-expedition');
      await waitStable(page, '.expedition-hub');
      await page.screenshot({ path: ssPath('F5', vpName, '01-stale-banner') });

      const banner = page.locator('.expedition-stale-banner');
      const hasBanner = await banner.isVisible().catch(() => false);

      const startDisabled = await page.locator('.expedition-start-btn').isDisabled();

      allResults.push({
        flow: 'F5 [non-spec]', viewport: vpName, step: '01-stale-banner',
        status: hasBanner && startDisabled ? 'PASS' : 'FAIL',
        severity: !hasBanner ? '🔴' : (!startDisabled ? '🟡' : undefined),
        detail: `banner=${hasBanner}, startDisabled=${startDisabled}`
      });

      // Abandon stale
      if (hasBanner) {
        await page.click('[data-action="abandon-stale"]');
        await page.waitForTimeout(500);

        const bannerGone = !(await banner.isVisible().catch(() => false));
        const startEnabled = !(await page.locator('.expedition-start-btn').isDisabled());

        allResults.push({
          flow: 'F5 [non-spec]', viewport: vpName, step: '02-after-abandon',
          status: bannerGone && startEnabled ? 'PASS' : 'FAIL',
          severity: !bannerGone ? '🟡' : undefined
        });
      }
    });

    // ────────────────────────────────────────
    // FLOW 6: Event rooms (non-spec — treasure/rest/shop UI)
    // ────────────────────────────────────────
    test(`F6: Event rooms render correctly [${vpName}] [non-spec]`, async ({ page }) => {
      const { errors } = setupCapture(page);

      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: STEP_TIMEOUT });
      await page.waitForFunction(() => !!(window as any).expeditionUI, { timeout: STEP_TIMEOUT });
      await cleanExpedition(page);

      // Test treasure room rendering
      const treasureResult = await page.evaluate(async () => {
        const engine = (window as any).expeditionEngine;
        const ui = (window as any).expeditionUI;
        const EC = (window as any).ExpeditionConstants;

        await engine.startRun('scholar');
        const run = engine.getActiveRun();
        // Force room 1 to be treasure
        run.rooms[1] = { index: 1, type: 'treasure', questionId: null, passageId: null,
          difficulty: 'easy', result: null, xpAwarded: 0, coinsAwarded: 0,
          itemUsed: null, timestamp: null, _questionType: null };
        // Clear room 0 so room 1 becomes current
        run.rooms[0].result = 'correct';
        run.roomsCleared = 1;

        return { success: true };
      });

      if (treasureResult.success) {
        await page.click('#btn-expedition');
        await waitStable(page, '.expedition-map');

        // Click treasure room (should be current)
        const currentRoom = page.locator('.expedition-room-node.current');
        if (await currentRoom.isVisible()) {
          await currentRoom.click();
          await page.waitForTimeout(1000);
          await page.screenshot({ path: ssPath('F6', vpName, '01-event-room') });

          // Check event UI rendered
          const eventUI = page.locator('.expedition-event');
          const hasEventUI = await eventUI.isVisible().catch(() => false);

          allResults.push({
            flow: 'F6 [non-spec]', viewport: vpName, step: '01-event-room',
            status: hasEventUI ? 'PASS' : 'FAIL',
            severity: !hasEventUI ? '🟡' : undefined,
            detail: `eventUI=${hasEventUI}`
          });
        }
      }

      await cleanExpedition(page);

      if (errors.length > 0) {
        allResults.push({
          flow: 'F6 [non-spec]', viewport: vpName, step: 'console-errors',
          status: 'FAIL', severity: '🟡',
          consoleErrors: [...errors]
        });
      }
    });

  }); // end describe per viewport
} // end viewport loop

// ═══════════════════════════════════════════════════════
// REPORT GENERATION
// ═══════════════════════════════════════════════════════
test.afterAll(async () => {
  const reportDir = path.resolve('test-results/validation');
  fs.mkdirSync(reportDir, { recursive: true });

  // Executive Summary
  const flows = [...new Set(allResults.map(r => r.flow))];
  const viewports = Object.keys(VIEWPORTS);

  let summary = '# Expedition E2E Validation Report\n\n';
  summary += `**Date**: ${new Date().toISOString().split('T')[0]}\n`;
  summary += `**Total checks**: ${allResults.length}\n`;
  summary += `**Pass**: ${allResults.filter(r => r.status === 'PASS').length}\n`;
  summary += `**Fail**: ${allResults.filter(r => r.status === 'FAIL').length}\n\n`;

  // Summary table
  summary += '## Executive Summary\n\n';
  summary += '| Flow | Desktop | Tablet | Mobile | Blockers |\n';
  summary += '|------|---------|--------|--------|----------|\n';

  for (const flow of flows) {
    const row = [flow];
    let blockers = '';
    for (const vp of viewports) {
      const results = allResults.filter(r => r.flow === flow && r.viewport === vp);
      const fails = results.filter(r => r.status === 'FAIL');
      if (fails.length === 0) {
        row.push('PASS');
      } else {
        const maxSev = fails.some(f => f.severity === '🔴') ? '🔴 FAIL' :
                       fails.some(f => f.severity === '🟡') ? '🟡 FAIL' : '🟢 FAIL';
        row.push(maxSev);
        if (fails.some(f => f.severity === '🔴')) {
          blockers += `${vp}: ${fails.filter(f => f.severity === '🔴').map(f => f.step).join(', ')}; `;
        }
      }
    }
    row.push(blockers || '-');
    summary += `| ${row.join(' | ')} |\n`;
  }

  // FAIL details
  const fails = allResults.filter(r => r.status === 'FAIL');
  if (fails.length > 0) {
    summary += '\n## FAIL Details\n\n';
    for (const f of fails) {
      summary += `### ${f.severity || '🟢'} ${f.flow} / ${f.viewport} / ${f.step}\n`;
      if (f.detail) summary += `- **Detail**: ${f.detail}\n`;
      if (f.consoleErrors?.length) summary += `- **Console errors**: ${f.consoleErrors.join('; ')}\n`;
      if (f.screenshot) summary += `- **Screenshot**: ${f.screenshot}\n`;
      summary += '\n';
    }
  } else {
    summary += '\n## No FAILs detected\n';
  }

  fs.writeFileSync(path.join(reportDir, 'report.md'), summary);
  console.log('\n' + summary);
});
