/**
 * fix-question-clipping.spec.ts
 *
 * Validates that the CSS Grid min-width: 0 fix eliminates horizontal text
 * clipping in .question-container and .passage-container on the study view.
 *
 * Four test cases:
 *   T4.1 - Desktop 1200x800  : question-text has no horizontal overflow
 *   T4.2 - Desktop 900x700   : same check at the grid breakpoint threshold
 *   T4.3 - Mobile 375x667    : tab layout works, question visible, no regression
 *   T4.4 - Passage 1200x800  : passage-text has no horizontal overflow
 */

import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';
const SHOTS_DIR = 'test-results/fix-question-clipping';

// Ensure output directory exists
if (!fs.existsSync(SHOTS_DIR)) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Capture a screenshot with an absolute path. */
async function shot(page: Page, name: string): Promise<void> {
  const filePath = path.resolve(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`  screenshot: ${filePath}`);
}

/** Collect project-origin console errors (ignore third-party). */
function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Only care about messages from our own origin, not CDN/extension noise
      const loc = msg.location();
      const url = loc?.url ?? '';
      if (!url || url.startsWith(BASE) || url === '') {
        errors.push(text);
      }
    }
  });
  return errors;
}

/**
 * Boot the app from scratch:
 *   1. Hard navigate to root
 *   2. Wipe IndexedDB + storage so the question bank is reloaded fresh
 *   3. Full reload and wait for appReady signal
 */
async function bootApp(page: Page, viewport: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(viewport);

  // Navigate to root (commit only — we'll wipe and reload after)
  await page.goto(`${BASE}/#/`, { waitUntil: 'commit' });

  // Wipe all storage to guarantee a clean state
  await page.evaluate(async () => {
    try { localStorage.clear(); } catch (_) { /* ignore */ }
    try { sessionStorage.clear(); } catch (_) { /* ignore */ }
    const dbs: { name?: string }[] =
      await (window as any).indexedDB?.databases?.() ?? [];
    await Promise.all(
      dbs
        .filter((d) => d.name)
        .map(
          (d) =>
            new Promise<void>((resolve) => {
              const req = (window as any).indexedDB.deleteDatabase(d.name!);
              req.onsuccess = () => resolve();
              req.onerror = () => resolve();
              req.onblocked = () => resolve();
            })
        )
    );
  }).catch(() => {});

  // Full reload — triggers DOMContentLoaded and fresh initialization
  await page.reload({ waitUntil: 'networkidle' });

  // Wait for the app to signal readiness (set by app.js after init)
  await page.waitForFunction(() => (window as any).appReady === true, {
    timeout: 20_000,
  });
}

/**
 * Navigate from the dashboard to the study view by clicking "Nova Passagem",
 * then wait until:
 *   - The #study section gains view--active
 *   - #question-text has non-empty text content
 *
 * This avoids any fixed sleeps; all waits are condition-based.
 */
async function startStudySession(page: Page): Promise<void> {
  // Click the "Nova Passagem" button
  await page.locator('#btn-study').click();

  // Wait for study section to become the active view
  await page.waitForFunction(
    () => document.getElementById('study')?.classList.contains('view--active'),
    { timeout: 10_000 }
  );

  // Wait until question text is populated (not just the container visible)
  await page.waitForFunction(
    () => {
      const el = document.getElementById('question-text') as HTMLElement | null;
      return el != null && (el.textContent ?? '').trim().length > 5;
    },
    { timeout: 10_000 }
  );

  // Wait until passage text is also populated
  await page.waitForFunction(
    () => {
      const el = document.getElementById('passage-text') as HTMLElement | null;
      return el != null && (el.innerText ?? '').trim().length > 20;
    },
    { timeout: 10_000 }
  );
}

/**
 * Measure overflow on a DOM element:
 *   scrollWidth === clientWidth  →  no horizontal overflow
 *   scrollWidth  >  clientWidth  →  content is clipped / overflowing
 */
async function measureOverflow(
  page: Page,
  selector: string
): Promise<{ scrollWidth: number; clientWidth: number; overflowing: boolean }> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return { scrollWidth: -1, clientWidth: -1, overflowing: false };
    return {
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      overflowing: el.scrollWidth > el.clientWidth,
    };
  }, selector);
}

// ── T4.1 – Desktop 1200×800: question-text no horizontal overflow ──────────

test('T4.1 - Desktop 1200x800: question-text has no horizontal overflow', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);
  const viewport = { width: 1200, height: 800 };

  await bootApp(page, viewport);
  await startStudySession(page);

  // Wait for networkidle before measuring to ensure layout is stable
  await page.waitForLoadState('networkidle');
  // Also wait until the #question-text element is visible in the DOM
  await page.waitForSelector('#question-text', { state: 'visible', timeout: 10_000 });

  await shot(page, 'T4.1-desktop-1200x800-question');

  // ── Measure overflow ──
  const overflow = await measureOverflow(page, '#question-text');
  console.log(`  #question-text scrollWidth : ${overflow.scrollWidth}px`);
  console.log(`  #question-text clientWidth : ${overflow.clientWidth}px`);
  console.log(`  overflowing               : ${overflow.overflowing}`);

  expect(
    overflow.scrollWidth,
    '#question-text element should exist (scrollWidth > 0)'
  ).toBeGreaterThan(0);

  expect(
    overflow.overflowing,
    `#question-text must NOT overflow horizontally. ` +
      `scrollWidth (${overflow.scrollWidth}) should equal clientWidth (${overflow.clientWidth}). ` +
      `CSS fix: .question-container { min-width: 0 } in desktop media query.`
  ).toBe(false);

  // Also verify the text is actually visible and readable
  const questionText = await page.locator('#question-text').innerText();
  console.log(`  question text length : ${questionText.trim().length} chars`);
  console.log(`  question excerpt     : "${questionText.trim().slice(0, 120)}"`);
  expect(questionText.trim().length, 'Question text should be non-empty').toBeGreaterThan(5);

  // Report any project-origin console errors
  if (consoleErrors.length > 0) {
    console.log(`  console errors (${consoleErrors.length}):`);
    consoleErrors.forEach((e) => console.log(`    [error] ${e}`));
  }
});

// ── T4.2 – Desktop 900×700: question-text no overflow at breakpoint ─────────

test('T4.2 - Desktop 900x700: question-text has no horizontal overflow at grid breakpoint', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);
  const viewport = { width: 900, height: 700 };

  await bootApp(page, viewport);
  await startStudySession(page);

  await page.waitForLoadState('networkidle');
  await page.waitForSelector('#question-text', { state: 'visible', timeout: 10_000 });

  await shot(page, 'T4.2-desktop-900x700-question');

  const overflow = await measureOverflow(page, '#question-text');
  console.log(`  viewport              : 900×700 (grid breakpoint threshold)`);
  console.log(`  #question-text scrollWidth : ${overflow.scrollWidth}px`);
  console.log(`  #question-text clientWidth : ${overflow.clientWidth}px`);
  console.log(`  overflowing               : ${overflow.overflowing}`);

  // Confirm two-column grid is active (study-tabs should be hidden at ≥900px)
  const studyTabsVisible = await page.evaluate(() => {
    const el = document.querySelector('.study-tabs') as HTMLElement | null;
    if (!el) return false;
    return window.getComputedStyle(el).display !== 'none';
  });
  console.log(`  .study-tabs visible (should be false at 900px) : ${studyTabsVisible}`);
  expect(
    studyTabsVisible,
    '.study-tabs should be hidden at 900px width (desktop two-column grid is active)'
  ).toBe(false);

  expect(
    overflow.scrollWidth,
    '#question-text element should exist (scrollWidth > 0)'
  ).toBeGreaterThan(0);

  expect(
    overflow.overflowing,
    `#question-text must NOT overflow horizontally at 900px breakpoint. ` +
      `scrollWidth (${overflow.scrollWidth}) vs clientWidth (${overflow.clientWidth}).`
  ).toBe(false);

  const questionText = await page.locator('#question-text').innerText();
  expect(questionText.trim().length, 'Question text should be non-empty at 900px').toBeGreaterThan(5);

  if (consoleErrors.length > 0) {
    console.log(`  console errors (${consoleErrors.length}):`);
    consoleErrors.forEach((e) => console.log(`    [error] ${e}`));
  }
});

// ── T4.3 – Mobile 375×667: tab layout works, question visible, no regression ─

test('T4.3 - Mobile 375x667: study-tabs visible; question text visible after tab click', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);
  const viewport = { width: 375, height: 667 };

  await bootApp(page, viewport);
  await startStudySession(page);

  await page.waitForLoadState('networkidle');

  // --- Step 1: Verify mobile tab bar is visible ---
  const studyTabsLocator = page.locator('.study-tabs');
  await studyTabsLocator.waitFor({ state: 'visible', timeout: 10_000 });

  const studyTabsVisible = await studyTabsLocator.isVisible();
  console.log(`  .study-tabs visible on mobile : ${studyTabsVisible}`);
  expect(
    studyTabsVisible,
    '.study-tabs must be visible on 375px viewport (mobile layout)'
  ).toBe(true);

  await shot(page, 'T4.3-mobile-375x667-passage-tab');

  // --- Step 2: Click the "Questão" tab ---
  const questionTab = page.locator('.study-tab[data-tab="question"]');
  await questionTab.waitFor({ state: 'visible', timeout: 10_000 });
  await questionTab.click();

  // Wait for the question-container to slide into view
  // The mobile CSS uses translateX(0) on .show-question .question-container
  await page.waitForFunction(
    () => {
      const content = document.getElementById('study-content');
      return content?.classList.contains('show-question') ?? false;
    },
    { timeout: 10_000 }
  );

  await shot(page, 'T4.3-mobile-375x667-question-tab');

  // --- Step 3: Verify #question-text is visible and has content ---
  const questionTextLocator = page.locator('#question-text');
  await questionTextLocator.waitFor({ state: 'visible', timeout: 10_000 });

  const questionText = await questionTextLocator.innerText();
  console.log(`  question text length : ${questionText.trim().length} chars`);
  console.log(`  question excerpt     : "${questionText.trim().slice(0, 100)}"`);

  expect(
    questionText.trim().length,
    'Question text must be non-empty after switching to Questão tab on mobile'
  ).toBeGreaterThan(5);

  // --- Step 4: No horizontal overflow on mobile (single-column, but verify) ---
  const overflow = await measureOverflow(page, '#question-text');
  console.log(`  #question-text scrollWidth : ${overflow.scrollWidth}px`);
  console.log(`  #question-text clientWidth : ${overflow.clientWidth}px`);
  console.log(`  overflowing               : ${overflow.overflowing}`);

  expect(
    overflow.overflowing,
    `#question-text must NOT overflow on mobile either. ` +
      `scrollWidth (${overflow.scrollWidth}) vs clientWidth (${overflow.clientWidth}).`
  ).toBe(false);

  // --- Step 5: Option buttons present ---
  const optionCount = await page.locator('#options-list button').count();
  console.log(`  option buttons : ${optionCount}`);
  expect(optionCount, 'Should have at least 5 option buttons (A-E) on mobile').toBeGreaterThanOrEqual(5);

  if (consoleErrors.length > 0) {
    console.log(`  console errors (${consoleErrors.length}):`);
    consoleErrors.forEach((e) => console.log(`    [error] ${e}`));
  }
});

// ── T4.4 – Passage 1200×800: passage-text has no horizontal overflow ─────────

test('T4.4 - Desktop 1200x800: passage-text (passage-container) has no horizontal overflow', async ({ page }) => {
  const consoleErrors = collectConsoleErrors(page);
  const viewport = { width: 1200, height: 800 };

  await bootApp(page, viewport);
  await startStudySession(page);

  await page.waitForLoadState('networkidle');
  await page.waitForSelector('#passage-text', { state: 'visible', timeout: 10_000 });

  await shot(page, 'T4.4-desktop-1200x800-passage');

  // ── Measure overflow on the passage-text element ──
  const passageTextOverflow = await measureOverflow(page, '#passage-text');
  console.log(`  #passage-text scrollWidth : ${passageTextOverflow.scrollWidth}px`);
  console.log(`  #passage-text clientWidth : ${passageTextOverflow.clientWidth}px`);
  console.log(`  overflowing               : ${passageTextOverflow.overflowing}`);

  // ── Also check the passage-container itself ──
  const containerOverflow = await measureOverflow(page, '.passage-container');
  console.log(`  .passage-container scrollWidth : ${containerOverflow.scrollWidth}px`);
  console.log(`  .passage-container clientWidth : ${containerOverflow.clientWidth}px`);
  console.log(`  overflowing                    : ${containerOverflow.overflowing}`);

  expect(
    passageTextOverflow.scrollWidth,
    '#passage-text should exist (scrollWidth > 0)'
  ).toBeGreaterThan(0);

  expect(
    passageTextOverflow.overflowing,
    `#passage-text must NOT overflow horizontally. ` +
      `scrollWidth (${passageTextOverflow.scrollWidth}) should equal clientWidth (${passageTextOverflow.clientWidth}). ` +
      `CSS fix: .passage-container { min-width: 0 } in desktop media query.`
  ).toBe(false);

  expect(
    containerOverflow.overflowing,
    `.passage-container must NOT overflow horizontally. ` +
      `scrollWidth (${containerOverflow.scrollWidth}) vs clientWidth (${containerOverflow.clientWidth}).`
  ).toBe(false);

  // Verify passage text is actually populated
  const passageText = await page.locator('#passage-text').innerText();
  console.log(`  passage text length : ${passageText.trim().length} chars`);
  console.log(`  passage excerpt     : "${passageText.trim().slice(0, 100)}"`);
  expect(passageText.trim().length, 'Passage text should be non-empty').toBeGreaterThan(20);

  if (consoleErrors.length > 0) {
    console.log(`  console errors (${consoleErrors.length}):`);
    consoleErrors.forEach((e) => console.log(`    [error] ${e}`));
  }
});
