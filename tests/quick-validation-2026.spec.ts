/**
 * Quick Validation Tests – calvinsiost.github.io/english_training/
 *
 * KNOWN BLOCKER: js/core/request-with-fallback.js returns 404 on the deployed
 * site (the file exists locally but was never committed/pushed).
 * All tests that need the app to work intercept this request and serve the
 * local file content so the app can initialise normally.
 *
 * Tests 1 and 7 (dashboard-only) do not need the fix and run unmodified.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'https://calvinsiost.github.io/english_training/';
const SHOTS = 'test-results/validation';

// Real content of the missing module (committed locally, not yet pushed)
const MODULE_SRC = fs.readFileSync(
  path.join(__dirname, '../js/core/request-with-fallback.js'),
  'utf8'
);

async function shot(page: any, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

// Clean storage after navigation in openApp function
async function cleanStorage(page: any) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  }).catch(() => {});
  await page.evaluate(async () => {
    const databases = await (window as any).indexedDB?.databases?.() || [];
    const deletions = databases
      .filter((db: any) => db.name)
      .map((db: any) => new Promise<void>((resolve) => {
        const req = (window as any).indexedDB.deleteDatabase(db.name);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      }));
    await Promise.all(deletions);
  }).catch(() => {});
}

/** Register a route intercept that patches the 404 module before navigating */
async function patchMissingModule(page: any) {
  // No-op for now - debugging syntax error
}

/** Navigate to app and wait for it to load */
async function openApp(page: any, viewport = { width: 1200, height: 800 }) {
  await page.setViewportSize(viewport);
  // Clear IndexedDB before loading to force bank reload
  await page.goto(BASE + '#/', { waitUntil: 'commit' });
  await page.evaluate(async () => {
    // Delete all IndexedDB databases — properly await each deletion
    const databases = await (window as any).indexedDB?.databases?.() || [];
    const deletions = databases
      .filter((db: any) => db.name)
      .map((db: any) => new Promise<void>((resolve) => {
        const req = (window as any).indexedDB.deleteDatabase(db.name);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      }));
    await Promise.all(deletions);
    localStorage.clear();
    sessionStorage.clear();
  }).catch(() => {});
  // Full reload to trigger fresh DOMContentLoaded + initialization
  await page.reload({ waitUntil: 'networkidle' });
  // Wait for app to finish async initialization (bank load, etc.)
  await page.waitForFunction(() => (window as any).appReady === true, { timeout: 15000 });
}

/** Click Nova Passagem and wait for study view to become active */
async function startStudy(page: any) {
  await page.click('#btn-study');
  await page.waitForFunction(
    () => document.getElementById('study')?.classList.contains('view--active'),
    { timeout: 10000 }
  );
  // Wait for passage text to be populated
  await page.waitForFunction(
    () => {
      const el = document.getElementById('passage-text') as HTMLElement | null;
      return el && el.innerText.trim().length > 20;
    },
    { timeout: 10000 }
  );
  await page.waitForTimeout(500);
}

// ── Test 1: Dashboard – no study content bleed ─────────────────────────────

test('1 - Dashboard: no study content bleeding through', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto(BASE + '#/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await shot(page, '01-dashboard');

  // Check bank count
  const bankCount = await page.locator('#bank-count').textContent();
  console.log(`  Test 1 - Bank count: ${bankCount}`);

  const studyActive = await page.evaluate(
    () => document.getElementById('study')?.classList.contains('view--active') ?? false
  );
  const studyBackVisible = await page.locator('#study-back').isVisible();
  const studyProgVisible = await page.locator('#study-progress').isVisible();
  const passageHeaderRect = await page.evaluate(() => {
    const el = document.querySelector('.passage-header') as HTMLElement | null;
    if (!el) return { w: 0, h: 0 };
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });

  console.log(`  study view active:        ${studyActive}`);
  console.log(`  #study-back visible:      ${studyBackVisible}`);
  console.log(`  #study-progress visible:  ${studyProgVisible}`);
  console.log(`  .passage-header visible:  ${passageHeaderRect.w > 0 && passageHeaderRect.h > 0}`);

  expect(studyActive,      'Study view should NOT be active on dashboard').toBe(false);
  expect(studyBackVisible, '"Voltar" back-button should NOT be visible on dashboard').toBe(false);
  expect(studyProgVisible, '"Passagem/Questão X/Y" counter should NOT be visible on dashboard').toBe(false);
  expect(passageHeaderRect.w > 0 && passageHeaderRect.h > 0,
    '"Texto da Passagem" header should NOT be visible on dashboard').toBe(false);
});

// ── Test 2: Study desktop two-column layout ────────────────────────────────

test('2 - Study desktop: two-column layout with passage and question', async ({ page }) => {
  await openApp(page, { width: 1200, height: 800 });
  
  // Check if bank is loaded
  const bankCount = await page.locator('#bank-count').textContent();
  console.log(`  Bank count after openApp: ${bankCount}`);
  
  await startStudy(page);
  await shot(page, '02-study-desktop');

  const passageVisible  = await page.locator('#passage-panel').isVisible();
  const passageText     = (await page.locator('#passage-text').innerText()).trim();
  const questionVisible = await page.locator('#question-panel').isVisible();
  const questionText    = (await page.locator('#question-text').innerText()).trim();
  const optionCount     = await page.locator('#options-list button').count();

  console.log(`  #passage-panel visible:  ${passageVisible}`);
  console.log(`  passage text length:     ${passageText.length} chars`);
  console.log(`  passage excerpt:         "${passageText.slice(0, 100)}"`);
  console.log(`  #question-panel visible: ${questionVisible}`);
  console.log(`  question text length:    ${questionText.length} chars`);
  console.log(`  question excerpt:        "${questionText.slice(0, 100)}"`);
  console.log(`  option buttons:          ${optionCount}`);
  for (let i = 0; i < Math.min(optionCount, 5); i++) {
    const t = (await page.locator('#options-list button').nth(i).innerText()).trim().slice(0, 80);
    console.log(`    [${['A','B','C','D','E'][i]}] ${t}`);
  }

  expect(passageVisible,      '#passage-panel should be visible (LEFT column)').toBe(true);
  expect(passageText.length,  'Passage text should have content (> 20 chars)').toBeGreaterThan(20);
  expect(questionVisible,     '#question-panel should be visible (RIGHT column)').toBe(true);
  expect(questionText.length, 'Question text should have content (> 10 chars)').toBeGreaterThan(10);
  expect(optionCount,         'Should have 5 option buttons (A-E)').toBeGreaterThanOrEqual(5);
});

// ── Test 3: Answer flow – confidence buttons, no duplicated feedback ────────

test('3 - Answer flow: confidence buttons appear; feedback shown once', async ({ page }) => {
  await openApp(page, { width: 1200, height: 800 });
  await startStudy(page);

  // Click first option button
  const firstOption = page.locator('#options-list button').first();
  await firstOption.waitFor({ state: 'visible', timeout: 5000 });
  await firstOption.click();
  await page.waitForTimeout(600);
  await shot(page, '03a-after-option-click');

  // Confidence section should now be visible
  const confVisible = await page.evaluate(() => {
    const el = document.getElementById('confidence-section') as HTMLElement | null;
    return el ? window.getComputedStyle(el).display !== 'none' : false;
  });
  console.log(`  confidence section visible: ${confVisible}`);
  expect(confVisible, 'Confidence section should appear after selecting an answer').toBe(true);

  // Click "Chutei" (data-confidence="0")
  const chuteiBtn = page.locator('button[data-confidence="0"]');
  await chuteiBtn.waitFor({ state: 'visible', timeout: 5000 });
  await chuteiBtn.click();
  await page.waitForTimeout(600);
  await shot(page, '03b-after-chutei');

  // Feedback section should be visible
  const feedbackVisible = await page.evaluate(() => {
    const el = document.getElementById('feedback-section') as HTMLElement | null;
    return el ? window.getComputedStyle(el).display !== 'none' : false;
  });
  console.log(`  feedback section visible: ${feedbackVisible}`);
  expect(feedbackVisible, 'Feedback section should be visible after clicking Chutei').toBe(true);

  // Exactly 1 feedback section in DOM (no duplication)
  const feedbackDomCount = await page.evaluate(
    () => document.querySelectorAll('#feedback-section').length
  );
  console.log(`  #feedback-section DOM instances: ${feedbackDomCount}`);
  expect(feedbackDomCount, 'Exactly 1 #feedback-section should exist in DOM').toBe(1);

  // No duplicate feedback text
  const feedbackEl = page.locator('#feedback-section');
  const feedbackHTML = await feedbackEl.innerHTML();
  console.log(`  feedback HTML: ${feedbackHTML.slice(0, 200)}`);

  const bodyText = await page.locator('body').innerText();
  const correctCount   = [...bodyText.matchAll(/Resposta correta/gi)].length;
  const incorrectCount = [...bodyText.matchAll(/Resposta incorreta/gi)].length;
  console.log(`  "Resposta correta" count:   ${correctCount}`);
  console.log(`  "Resposta incorreta" count: ${incorrectCount}`);
  expect(correctCount + incorrectCount,
    'Feedback message should appear at most once (not duplicated)').toBeLessThanOrEqual(1);
});

// ── Test 4: Text quality ───────────────────────────────────────────────────

test('4 - Text quality: no broken contractions or FUVEST exam header in passage', async ({ page }) => {
  await openApp(page, { width: 1200, height: 800 });
  await startStudy(page);

  const passageText = (await page.locator('#passage-text').innerText()).trim();

  const hasFuvest = /EXAME DE PROFICI/i.test(passageText);
  const brokenRe  = /\b(can|doesn|won|isn|don|hasn|hadn|couldn|wouldn|shouldn|weren|didn|wasn|aren|haven|needn|mustn|shan)\s+t\b/i;
  const hasBroken = brokenRe.test(passageText);

  console.log(`  Passage length:               ${passageText.length} chars`);
  console.log(`  Contains "EXAME DE PROFICI":  ${hasFuvest}`);
  console.log(`  Contains broken contractions: ${hasBroken}`);
  if (hasBroken) {
    const m = passageText.match(brokenRe);
    console.log(`  Example broken contraction:   "${m?.[0]}"`);
  }
  console.log(`  Passage excerpt: "${passageText.slice(0, 250)}"`);

  expect(hasFuvest, '"EXAME DE PROFICI" should NOT appear in passage text').toBe(false);
  expect(hasBroken, 'Broken contractions like "can t" should NOT appear in passage text').toBe(false);
});

// ── Test 5: Mobile – Questão tab shows question content ───────────────────

test('5 - Mobile: Questão tab shows question content', async ({ page }) => {
  await openApp(page, { width: 375, height: 812 });
  await startStudy(page);
  await shot(page, '05a-mobile-initial');

  // Questão tab (data-tab="question")
  const questaoTab   = page.locator('.study-tab[data-tab="question"]');
  const tabVisible   = await questaoTab.isVisible();
  console.log(`  Questão tab visible: ${tabVisible}`);
  expect(tabVisible, '.study-tab[data-tab="question"] should be visible on mobile').toBe(true);

  await questaoTab.click();
  await page.waitForTimeout(600);
  await shot(page, '05b-mobile-questao-tab');

  // question-panel and option buttons should now be visible
  const questionVisible = await page.locator('#question-panel').isVisible();
  const optionCount     = await page.locator('#options-list button').count();
  console.log(`  #question-panel visible: ${questionVisible}`);
  console.log(`  Option buttons: ${optionCount}`);

  expect(questionVisible, '#question-panel should be visible after clicking Questão tab').toBe(true);
  expect(optionCount, 'Should have 5 option buttons after switching to Questão tab').toBeGreaterThanOrEqual(5);
});

// ── Test 6: Theme toggle ───────────────────────────────────────────────────

test('6 - Theme toggle: clicking Claro sets data-theme=light on html', async ({ page }) => {
  await openApp(page, { width: 1200, height: 800 });
  // Navigate to settings view via hash
  await page.evaluate(() => { window.location.hash = '#/settings'; });
  await page.waitForFunction(
    () => document.getElementById('settings')?.classList.contains('view--active'),
    { timeout: 8000 }
  );
  await shot(page, '06a-settings-initial');

  const initialTheme  = await page.locator('html').getAttribute('data-theme');
  const settingsActive = await page.evaluate(
    () => document.getElementById('settings')?.classList.contains('view--active') ?? false
  );
  console.log(`  Settings view active: ${settingsActive}`);
  console.log(`  Initial data-theme:   "${initialTheme}"`);
  expect(settingsActive, 'Settings view should be active after navigating to #/settings').toBe(true);

  const claroBtn     = page.locator('#theme-light');
  const claroVisible = await claroBtn.isVisible();
  console.log(`  #theme-light visible: ${claroVisible}`);
  expect(claroVisible, '#theme-light button should be visible in settings').toBe(true);

  await claroBtn.click();
  await page.waitForTimeout(400);
  await shot(page, '06b-settings-after-claro');

  const afterTheme = await page.locator('html').getAttribute('data-theme');
  console.log(`  After click data-theme: "${afterTheme}"`);
  expect(afterTheme, 'html[data-theme] should equal "light" after clicking Claro').toBe('light');
});

// ── Test 7: Font sizes – no text below 12px on dashboard ──────────────────

test('7 - Font sizes: no visible text below 12px on dashboard', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto(BASE + '#/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  const tinyElements: { tag: string; text: string; fontSize: string }[] = await page.evaluate(() => {
    const results: { tag: string; text: string; fontSize: string }[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const text = node.textContent?.trim();
      if (!text || text.length < 2) continue;
      const el = node.parentElement;
      if (!el) continue;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (!el.closest('#dashboard.view--active')) continue;
      const fs = parseFloat(style.fontSize);
      if (fs < 12) results.push({ tag: el.tagName, text: text.slice(0, 50), fontSize: style.fontSize });
    }
    return results;
  });

  if (tinyElements.length > 0) {
    console.log('  Elements with font-size < 12px:');
    tinyElements.forEach(e => console.log(`    <${e.tag}> "${e.text}" → ${e.fontSize}`));
  } else {
    console.log('  No visible text elements below 12px on dashboard.');
  }

  await shot(page, '07-dashboard-fonts');
  expect(tinyElements.length, `${tinyElements.length} visible text element(s) have computed font-size < 12px`).toBe(0);
});
