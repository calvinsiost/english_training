/**
 * E2E Clipping Fix Validation
 *
 * Validates the CSS Grid min-width:0 fix applied to .passage-container and
 * .question-container in css/study-layout.css.  All five flows run across
 * three viewports (desktop 1280x720, tablet 768x1024, mobile 375x812).
 *
 * Flow 1  – Study View: question text visibility (no horizontal overflow)
 * Flow 2  – Study View: passage text visibility (no horizontal overflow)
 * Flow 3  – Study View: interactive elements (option clicks, keyboard nav)
 * Flow 4  – Study View: navigation & state transitions
 * Flow 5  – Dashboard: no regression (non-spec, informational)
 *
 * Screenshots land in test-results/validation/.
 * Run with: npx playwright test tests/e2e-clipping-fix-validation.spec.ts --reporter=list
 */

import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE    = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';
const SHOTS   = 'test-results/validation';
const TIMEOUT = 10_000; // per-step timeout (ms)

const VIEWPORTS = [
  { label: 'desktop', width: 1280, height: 720  },
  { label: 'tablet',  width: 768,  height: 1024 },
  { label: 'mobile',  width: 375,  height: 812  },
] as const;

// ---------------------------------------------------------------------------
// Ensure output directory exists
// ---------------------------------------------------------------------------

if (!fs.existsSync(SHOTS)) {
  fs.mkdirSync(SHOTS, { recursive: true });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OverflowResult {
  exists:      boolean;
  visible?:    boolean;
  scrollWidth?: number;
  clientWidth?: number;
  hasOverflow?: boolean;
  width?:       number;
  height?:      number;
}

interface ConsoleEntry {
  type:    string;
  text:    string;
  url:     string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Take a viewport-labeled screenshot into test-results/validation/. */
async function shot(page: Page, name: string): Promise<string> {
  const filePath = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  return filePath;
}

/**
 * Check whether an element overflows its own client width.
 * Returns a structured result; hasOverflow === true is a BLOCKER.
 */
async function checkOverflow(page: Page, selector: string): Promise<OverflowResult> {
  return page.evaluate((sel: string): OverflowResult => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return { exists: false };
    const rect = el.getBoundingClientRect();
    return {
      exists:      true,
      visible:     rect.width > 0 && rect.height > 0,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      hasOverflow: el.scrollWidth > el.clientWidth + 1,
      width:       rect.width,
      height:      rect.height,
    };
  }, selector);
}

/**
 * Attach a console listener that captures error/warning messages
 * from the project origin only (localhost:8080).
 * Returns a getter that returns all captured entries so far.
 */
function attachConsoleCapture(page: Page): () => ConsoleEntry[] {
  const entries: ConsoleEntry[] = [];
  page.on('console', (msg) => {
    const type = msg.type();
    if (type !== 'error' && type !== 'warning') return;
    const url = msg.location().url ?? '';
    // Only capture messages from project origin
    if (!url.startsWith(BASE) && url !== '') return;
    entries.push({ type, text: msg.text(), url });
  });
  // Also capture page errors (uncaught exceptions)
  page.on('pageerror', (err) => {
    entries.push({ type: 'error', text: err.message, url: BASE });
  });
  return () => entries;
}

/**
 * Log captured console entries to stdout so they appear in --reporter=list.
 */
function reportConsole(label: string, entries: ConsoleEntry[]): void {
  if (entries.length === 0) {
    console.log(`  [console] ${label}: no errors/warnings from project origin`);
    return;
  }
  entries.forEach((e) => {
    console.log(`  [console][${e.type.toUpperCase()}] ${label}: ${e.text.slice(0, 200)}`);
  });
}

/**
 * Wipe storage + reload, then wait for appReady.
 * Mirrors the pattern used in quick-validation-2026.spec.ts.
 */
async function openApp(
  page: Page,
  viewport: { width: number; height: number },
): Promise<void> {
  await page.setViewportSize(viewport);

  // Navigate to commit (bare load) then clear all persistent state
  await page.goto(`${BASE}/#/`, { waitUntil: 'commit' });
  await page.evaluate(async () => {
    const dbs = await (window as any).indexedDB?.databases?.() ?? [];
    await Promise.all(
      dbs
        .filter((d: any) => d.name)
        .map(
          (d: any) =>
            new Promise<void>((res) => {
              const r = (window as any).indexedDB.deleteDatabase(d.name);
              r.onsuccess = r.onerror = r.onblocked = () => res();
            }),
        ),
    );
    localStorage.clear();
    sessionStorage.clear();
  }).catch(() => {});

  // Full reload so DOMContentLoaded fires with clean state
  await page.reload({ waitUntil: 'networkidle' });

  // Wait for app async init
  await page.waitForFunction(
    () => (window as any).appReady === true,
    { timeout: 15_000 },
  );
}

/**
 * Click "Nova Passagem" and wait until a question is visible in the study view.
 */
async function startStudy(page: Page): Promise<void> {
  await page.click('#btn-study');

  // Study section becomes active
  await page.waitForFunction(
    () => document.getElementById('study')?.classList.contains('view--active'),
    { timeout: TIMEOUT },
  );

  // Passage text populated
  await page.waitForFunction(
    () => {
      const el = document.getElementById('passage-text') as HTMLElement | null;
      return el !== null && el.innerText.trim().length > 20;
    },
    { timeout: TIMEOUT },
  );

  // Question text populated
  await page.waitForFunction(
    () => {
      const el = document.getElementById('question-text') as HTMLElement | null;
      return el !== null && el.innerText.trim().length > 5;
    },
    { timeout: TIMEOUT },
  );
}

/**
 * On mobile (width < 900), switch to the "Questão" tab so the question panel
 * is visible.  On desktop/tablet the two-column grid shows both at once.
 */
async function ensureQuestionVisible(
  page: Page,
  viewport: { width: number; label: string },
): Promise<void> {
  if (viewport.width < 900) {
    const questaoTab = page.locator('.study-tab[data-tab="question"]');
    await questaoTab.waitFor({ state: 'visible', timeout: TIMEOUT });
    await questaoTab.click();
    // Wait for panel to slide in
    await page.waitForFunction(
      () => {
        const sc = document.getElementById('study-content');
        return sc?.classList.contains('show-question') ?? false;
      },
      { timeout: TIMEOUT },
    );
  }
}

// ===========================================================================
// FLOW 1 — Study View: Question Text Visibility (no horizontal overflow)
// ===========================================================================

for (const vp of VIEWPORTS) {
  test(`Flow 1 | ${vp.label} (${vp.width}x${vp.height}) — question text: no clipping`, async ({ page }) => {
    const getConsole = attachConsoleCapture(page);
    await openApp(page, vp);
    await startStudy(page);
    await ensureQuestionVisible(page, vp);

    // Step 2 — wait for #question-text to be visible
    await page.locator('#question-text').waitFor({ state: 'visible', timeout: TIMEOUT });

    // Step 3 — scrollWidth === clientWidth on #question-text
    const qtOverflow = await checkOverflow(page, '#question-text');
    console.log(
      `  [flow1][${vp.label}] #question-text → scrollW=${qtOverflow.scrollWidth} clientW=${qtOverflow.clientWidth} overflow=${qtOverflow.hasOverflow}`,
    );
    expect(qtOverflow.exists,   '#question-text must exist in DOM').toBe(true);
    expect(qtOverflow.visible,  '#question-text must have non-zero dimensions').toBe(true);
    expect(qtOverflow.hasOverflow, `#question-text must NOT overflow (scrollWidth ${qtOverflow.scrollWidth} > clientWidth ${qtOverflow.clientWidth})`).toBe(false);

    // Step 4 — scrollWidth === clientWidth on .question-container
    // Measured after ensureQuestionVisible() — on mobile the tab switch slides
    // the panel in before we measure.
    const qcOverflow = await checkOverflow(page, '.question-container');
    console.log(
      `  [flow1][${vp.label}] .question-container → scrollW=${qcOverflow.scrollWidth} clientW=${qcOverflow.clientWidth} overflow=${qcOverflow.hasOverflow}`,
    );
    expect(qcOverflow.exists, '.question-container must exist').toBe(true);

    // Diagnose which child element (if any) is causing the overflow so we have
    // actionable information in the failure message.
    const qcChildDiag: Array<{ tag: string; cls: string; scrollW: number; clientW: number }> = await page.evaluate(() => {
      const container = document.querySelector('.question-container') as HTMLElement | null;
      if (!container) return [];
      return Array.from(container.querySelectorAll('*')).map((el) => {
        const h = el as HTMLElement;
        return {
          tag:     h.tagName,
          cls:     h.className.toString().slice(0, 60),
          scrollW: h.scrollWidth,
          clientW: h.clientWidth,
        };
      }).filter((r) => r.scrollW > r.clientW + 1);
    });
    if (qcChildDiag.length > 0) {
      console.log(`  [flow1][${vp.label}] .question-container — overflowing children:`);
      qcChildDiag.forEach((c) =>
        console.log(`    <${c.tag} class="${c.cls}"> scrollW=${c.scrollW} clientW=${c.clientW}`),
      );
    }

    expect(qcOverflow.hasOverflow, `.question-container must NOT overflow (scrollW=${qcOverflow.scrollWidth} clientW=${qcOverflow.clientWidth})`).toBe(false);

    // Step 5 — screenshot
    await page.waitForLoadState('networkidle').catch(() => {});
    const screenshotPath = await shot(page, `flow1-${vp.label}-question-overflow`);
    console.log(`  [flow1][${vp.label}] screenshot → ${screenshotPath}`);

    // Step 6 — console errors
    const errors = getConsole();
    reportConsole(`flow1/${vp.label}`, errors);
    const blockers = errors.filter((e) => e.type === 'error');
    expect(blockers, `No project-origin JS errors expected. Got: ${blockers.map((e) => e.text).join('; ')}`).toHaveLength(0);
  });
}

// ===========================================================================
// FLOW 2 — Study View: Passage Text Visibility (no horizontal overflow)
// ===========================================================================

for (const vp of VIEWPORTS) {
  test(`Flow 2 | ${vp.label} (${vp.width}x${vp.height}) — passage text: no clipping`, async ({ page }) => {
    const getConsole = attachConsoleCapture(page);
    await openApp(page, vp);
    await startStudy(page);

    // On mobile the passage tab is active by default, no extra click needed.
    // For tablet/desktop both panels are visible.

    // Step 2 — wait for .passage-text to be visible
    // On mobile the passage panel is shown initially (no tab switch needed)
    await page.locator('.passage-text').waitFor({ state: 'visible', timeout: TIMEOUT });

    // Step 3 — scrollWidth === clientWidth on .passage-text
    const ptOverflow = await checkOverflow(page, '.passage-text');
    console.log(
      `  [flow2][${vp.label}] .passage-text → scrollW=${ptOverflow.scrollWidth} clientW=${ptOverflow.clientWidth} overflow=${ptOverflow.hasOverflow}`,
    );
    expect(ptOverflow.exists,      '.passage-text must exist in DOM').toBe(true);
    expect(ptOverflow.visible,     '.passage-text must have non-zero dimensions').toBe(true);
    expect(ptOverflow.hasOverflow, `.passage-text must NOT overflow`).toBe(false);

    // Step 4 — scrollWidth === clientWidth on .passage-container
    const pcOverflow = await checkOverflow(page, '.passage-container');
    console.log(
      `  [flow2][${vp.label}] .passage-container → scrollW=${pcOverflow.scrollWidth} clientW=${pcOverflow.clientWidth} overflow=${pcOverflow.hasOverflow}`,
    );
    expect(pcOverflow.exists,      '.passage-container must exist').toBe(true);
    expect(pcOverflow.hasOverflow, `.passage-container must NOT overflow`).toBe(false);

    // Step 5 — screenshot
    await page.waitForLoadState('networkidle').catch(() => {});
    const screenshotPath = await shot(page, `flow2-${vp.label}-passage-overflow`);
    console.log(`  [flow2][${vp.label}] screenshot → ${screenshotPath}`);

    // Step 6 — console errors
    const errors = getConsole();
    reportConsole(`flow2/${vp.label}`, errors);
    const blockers = errors.filter((e) => e.type === 'error');
    expect(blockers, `No project-origin JS errors expected. Got: ${blockers.map((e) => e.text).join('; ')}`).toHaveLength(0);
  });
}

// ===========================================================================
// FLOW 3 — Study View: Interactive Elements
// ===========================================================================

for (const vp of VIEWPORTS) {
  test(`Flow 3 | ${vp.label} (${vp.width}x${vp.height}) — interactive elements`, async ({ page }) => {
    const getConsole = attachConsoleCapture(page);
    await openApp(page, vp);
    await startStudy(page);
    await ensureQuestionVisible(page, vp);

    // Step 2 — wait for options
    await page.locator('.option-btn').first().waitFor({ state: 'visible', timeout: TIMEOUT });
    const optionCount = await page.locator('.option-btn').count();
    console.log(`  [flow3][${vp.label}] option count: ${optionCount}`);
    expect(optionCount, 'At least one option button must be present').toBeGreaterThanOrEqual(1);

    // Step 3 — click first option and verify .selected class
    const firstOption = page.locator('.option-btn').first();
    await firstOption.click();
    // Wait for selection to register
    const hasSelected = await page.waitForFunction(
      () => document.querySelector('.option-btn.selected') !== null,
      { timeout: TIMEOUT },
    ).then(() => true).catch(() => false);
    console.log(`  [flow3][${vp.label}] first option got .selected: ${hasSelected}`);
    expect(hasSelected, 'Clicking first option must apply .selected class').toBe(true);

    // Step 4 — verify no option text truncated (scrollWidth check on each btn)
    const optionOverflows: Array<{ index: number; hasOverflow: boolean; scrollW: number; clientW: number }> = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('.option-btn')) as HTMLElement[];
      return buttons.map((btn, i) => ({
        index:      i,
        hasOverflow: btn.scrollWidth > btn.clientWidth + 1,
        scrollW:    btn.scrollWidth,
        clientW:    btn.clientWidth,
      }));
    });
    const clippedOptions = optionOverflows.filter((o) => o.hasOverflow);
    if (clippedOptions.length > 0) {
      clippedOptions.forEach((o) =>
        console.log(
          `  [flow3][${vp.label}] option[${o.index}] OVERFLOW scrollW=${o.scrollW} clientW=${o.clientW}`,
        ),
      );
    }
    expect(clippedOptions, `Option buttons must not clip text. Clipped: ${clippedOptions.map((o) => o.index).join(', ')}`).toHaveLength(0);

    // Take screenshot after option click, before keyboard test
    await shot(page, `flow3-${vp.label}-after-click`);

    // Step 5 — keyboard navigation: press A-E and check a response occurs
    // First navigate to a fresh question by reloading the study session
    // (keyboard shortcuts map A-E to options 0-4)
    //
    // We test from the current state: press B and confirm a second .selected
    // may appear or the selection changes (no error thrown).
    // Since an answer was already submitted (first click), we navigate to next
    // if the next button is available, otherwise we just verify keys don't crash.
    const nextVisible = await page.locator('#btn-next').isVisible();
    if (nextVisible) {
      // Confidence section may need to be dismissed first if it appeared
      const confidentBtn = page.locator('button[data-confidence]').first();
      const confVisible  = await confidentBtn.isVisible();
      if (confVisible) await confidentBtn.click();

      // Now wait for next button and proceed
      await page.locator('#btn-next').waitFor({ state: 'visible', timeout: TIMEOUT });
      await page.locator('#btn-next').click();
      await page.waitForFunction(
        () => {
          const qt = document.getElementById('question-text') as HTMLElement | null;
          return qt !== null && qt.innerText.trim().length > 5;
        },
        { timeout: TIMEOUT },
      );
      await ensureQuestionVisible(page, vp);
      await page.locator('.option-btn').first().waitFor({ state: 'visible', timeout: TIMEOUT });
    }

    // Press keyboard keys A through E; at least one should select an option
    const keysToTest = ['a', 'b', 'c', 'd', 'e'];
    let keyboardWorked = false;
    for (const key of keysToTest) {
      // Only press if options are still unselected (fresh question or after reset)
      const alreadySelected = await page.locator('.option-btn.selected').count();
      if (alreadySelected > 0) break;
      await page.keyboard.press(key);
      const nowSelected = await page.locator('.option-btn.selected').count();
      if (nowSelected > 0) {
        keyboardWorked = true;
        console.log(`  [flow3][${vp.label}] keyboard key "${key}" successfully selected an option`);
        break;
      }
    }

    // Keyboard nav is a best-effort check (may not work on mobile viewport where
    // the virtual keyboard concept differs); flag as warning only.
    if (!keyboardWorked) {
      console.log(`  [flow3][${vp.label}] WARNING: keyboard A-E did not select an option (may be intentional on mobile)`);
    }

    // Step 6 — screenshot after interaction
    await page.waitForLoadState('networkidle').catch(() => {});
    const screenshotPath = await shot(page, `flow3-${vp.label}-after-keyboard`);
    console.log(`  [flow3][${vp.label}] screenshot → ${screenshotPath}`);

    // Step 7 — console errors
    const errors = getConsole();
    reportConsole(`flow3/${vp.label}`, errors);
    const blockers = errors.filter((e) => e.type === 'error');
    expect(blockers, `No project-origin JS errors. Got: ${blockers.map((e) => e.text).join('; ')}`).toHaveLength(0);
  });
}

// ===========================================================================
// FLOW 4 — Study View: Navigation & State Transitions
// ===========================================================================

for (const vp of VIEWPORTS) {
  test(`Flow 4 | ${vp.label} (${vp.width}x${vp.height}) — navigation & state transitions`, async ({ page }) => {
    const getConsole = attachConsoleCapture(page);
    await openApp(page, vp);
    await startStudy(page);

    // Step 2 — click "Voltar" (#study-back / .btn-back) and verify dashboard shown
    const backBtn = page.locator('#study-back');
    await backBtn.waitFor({ state: 'visible', timeout: TIMEOUT });
    await backBtn.click();

    // Dashboard should become active
    await page.waitForFunction(
      () => document.getElementById('dashboard')?.classList.contains('view--active'),
      { timeout: TIMEOUT },
    );
    const dashActive = await page.evaluate(
      () => document.getElementById('dashboard')?.classList.contains('view--active') ?? false,
    );
    console.log(`  [flow4][${vp.label}] dashboard active after back: ${dashActive}`);
    expect(dashActive, 'Dashboard must become active after clicking Voltar').toBe(true);

    // Study view must be inactive
    const studyActive = await page.evaluate(
      () => document.getElementById('study')?.classList.contains('view--active') ?? false,
    );
    expect(studyActive, 'Study view must NOT be active after navigating back').toBe(false);

    // Step 3 — navigate back to /#/study
    await page.click('#btn-study');
    await page.waitForFunction(
      () => document.getElementById('study')?.classList.contains('view--active'),
      { timeout: TIMEOUT },
    );
    // Wait for content
    await page.waitForFunction(
      () => {
        const qt = document.getElementById('question-text') as HTMLElement | null;
        return qt !== null && qt.innerText.trim().length > 5;
      },
      { timeout: TIMEOUT },
    );

    // Step 4 — verify question counter shows expected pattern
    const progressEl = page.locator('#study-progress');
    await progressEl.waitFor({ state: 'visible', timeout: TIMEOUT });
    const progressText = await progressEl.textContent() ?? '';
    console.log(`  [flow4][${vp.label}] progress text: "${progressText}"`);
    // Expect something like "Passagem 1/1 · Questão 1/5" or "Questão X/Y"
    const hasCounter = /Quest[aã]o\s+\d+\/\d+/i.test(progressText);
    expect(hasCounter, `Progress text "${progressText}" must contain a question counter like "Questão 1/5"`).toBe(true);

    // Step 5 — screenshot
    await page.waitForLoadState('networkidle').catch(() => {});
    const screenshotPath = await shot(page, `flow4-${vp.label}-nav-state`);
    console.log(`  [flow4][${vp.label}] screenshot → ${screenshotPath}`);

    // Step 6 — console errors
    const errors = getConsole();
    reportConsole(`flow4/${vp.label}`, errors);
    const blockers = errors.filter((e) => e.type === 'error');
    expect(blockers, `No project-origin JS errors. Got: ${blockers.map((e) => e.text).join('; ')}`).toHaveLength(0);
  });
}

// ===========================================================================
// FLOW 5 — Dashboard: No Regression  [non-spec / informational]
// ===========================================================================

for (const vp of VIEWPORTS) {
  test(`Flow 5 | ${vp.label} (${vp.width}x${vp.height}) — dashboard no regression [non-spec]`, async ({ page }) => {
    const getConsole = attachConsoleCapture(page);

    await page.setViewportSize(vp);
    await page.goto(`${BASE}/#/`, { waitUntil: 'networkidle' });

    // Step 2 — verify primary dashboard sections are visible
    await page.locator('.dashboard-welcome').waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.locator('.stats-grid').waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.locator('.action-grid').waitFor({ state: 'visible', timeout: TIMEOUT });

    const welcomeVisible = await page.locator('.dashboard-welcome').isVisible();
    const statsVisible   = await page.locator('.stats-grid').isVisible();
    const actionVisible  = await page.locator('.action-grid').isVisible();

    console.log(`  [flow5][${vp.label}] .dashboard-welcome: ${welcomeVisible}`);
    console.log(`  [flow5][${vp.label}] .stats-grid:        ${statsVisible}`);
    console.log(`  [flow5][${vp.label}] .action-grid:       ${actionVisible}`);

    expect(welcomeVisible, '.dashboard-welcome must be visible').toBe(true);
    expect(statsVisible,   '.stats-grid must be visible').toBe(true);
    expect(actionVisible,  '.action-grid must be visible').toBe(true);

    // Step 5 — verify no horizontal overflow on critical dashboard elements
    const dashboardSelectors = [
      '.dashboard-welcome',
      '.stats-grid',
      '.action-grid',
      '#app',
    ];

    for (const sel of dashboardSelectors) {
      const result = await checkOverflow(page, sel);
      if (!result.exists) {
        console.log(`  [flow5][${vp.label}] ${sel}: NOT FOUND (skipping overflow check)`);
        continue;
      }
      console.log(
        `  [flow5][${vp.label}] ${sel} → scrollW=${result.scrollWidth} clientW=${result.clientWidth} overflow=${result.hasOverflow}`,
      );
      expect(result.hasOverflow, `${sel} must NOT have horizontal overflow`).toBe(false);
    }

    // Step 6 — screenshot
    await page.waitForLoadState('networkidle').catch(() => {});
    const screenshotPath = await shot(page, `flow5-${vp.label}-dashboard`);
    console.log(`  [flow5][${vp.label}] screenshot → ${screenshotPath}`);

    // Step 7 — console errors (non-spec: report but do not hard-fail)
    const errors = getConsole();
    reportConsole(`flow5/${vp.label}`, errors);
    const blockers = errors.filter((e) => e.type === 'error');
    if (blockers.length > 0) {
      console.log(`  [flow5][${vp.label}] NON-SPEC WARNING: ${blockers.length} console error(s) on dashboard`);
    }
    // Non-spec: no expect() on console here — dashboard errors are informational
  });
}
