/**
 * Comprehensive E2E test for English Training app
 * Covers: Desktop layout, Mobile layout, Settings, UX audit
 * Target: https://calvinsiost.github.io/english_training/
 */

import { test, expect, Page, ConsoleMessage } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://calvinsiost.github.io/english_training/';
const SS_DIR = '/c/Users/calvi/Github/english_training/test-screenshots/2026';
const DESKTOP = { width: 1200, height: 800 };
const MOBILE = { width: 375, height: 812 };

fs.mkdirSync(SS_DIR, { recursive: true });

async function ss(page: Page, name: string) {
  const filePath = path.join(SS_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  console.log(`Screenshot: ${filePath}`);
  return filePath;
}

async function goTo(page: Page, hash: string, waitMs = 1200) {
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await page.waitForTimeout(waitMs);
}

// Collect all console errors across all tests
const globalConsoleErrors: { test: string; type: string; text: string }[] = [];

// ═══════════════════════════════════════════════════════════════════════════════
// DESKTOP TESTS (1200x800)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Desktop (1200x800)', () => {
  let consoleErrors: { type: string; text: string }[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') {
        consoleErrors.push({ type: 'console.error', text: msg.text() });
        globalConsoleErrors.push({ test: test.info().title, type: 'console.error', text: msg.text() });
      }
    });
    page.on('pageerror', (err: Error) => {
      consoleErrors.push({ type: 'pageerror', text: err.message });
      globalConsoleErrors.push({ test: test.info().title, type: 'pageerror', text: err.message });
    });
  });

  test('D1: Dashboard loads — stats and bottom nav render', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    const t0 = Date.now();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    console.log(`Load time: ${Date.now() - t0}ms`);

    await ss(page, 'D1-01-initial-load');

    // Page title
    const title = await page.title();
    console.log(`Title: "${title}"`);
    expect(title).toBeTruthy();

    // Body content exists
    const bodyText = await page.locator('body').textContent();
    expect(bodyText!.trim().length).toBeGreaterThan(50);

    // --- Stats section ---
    const statsInfo = await page.evaluate(() => {
      // Look for stat numbers / cards
      const candidates = document.querySelectorAll(
        '[class*="stat"], [class*="card"], [class*="score"], [class*="metric"], [class*="count"], [class*="summary"]'
      );
      return Array.from(candidates).slice(0, 10).map(el => ({
        tag: el.tagName,
        class: el.className,
        text: el.textContent?.trim().substring(0, 80),
        visible: (el as HTMLElement).offsetParent !== null,
      }));
    });
    console.log('Stat/card elements found:');
    statsInfo.forEach((s, i) => console.log(`  [${i}] <${s.tag} class="${s.class}"> visible=${s.visible} text="${s.text}"`));

    const visibleStats = statsInfo.filter(s => s.visible);
    if (visibleStats.length === 0) {
      console.warn('ISSUE: No visible stat/card elements found on dashboard');
    } else {
      console.log(`OK: ${visibleStats.length} stat/card elements visible`);
    }

    // --- Bottom nav ---
    const bottomNavInfo = await page.evaluate(() => {
      const candidates = document.querySelectorAll(
        'nav, [class*="nav"], [class*="bottom"], [class*="tabbar"], [class*="footer-nav"]'
      );
      return Array.from(candidates).map(el => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        return {
          tag: el.tagName,
          class: el.className,
          visible: (el as HTMLElement).offsetParent !== null,
          bottom: rect.bottom,
          top: rect.top,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          text: el.textContent?.trim().substring(0, 100),
        };
      });
    });
    console.log('Nav/bottom elements:');
    bottomNavInfo.forEach((n, i) =>
      console.log(`  [${i}] <${n.tag} class="${n.class}"> visible=${n.visible} pos=top:${n.top.toFixed(0)},bottom:${n.bottom.toFixed(0)} size=${n.width}x${n.height} text="${n.text?.substring(0, 60)}"`));

    const bottomNavCandidates = bottomNavInfo.filter(n => n.visible && n.top > 600 && n.height > 30 && n.height < 120);
    if (bottomNavCandidates.length > 0) {
      console.log(`OK: Bottom nav detected (${bottomNavCandidates.length} candidate(s))`);
    } else {
      console.warn('ISSUE: No bottom navigation bar detected at bottom of desktop viewport');
    }

    await ss(page, 'D1-02-dashboard-annotated');

    // Headings
    const headings = await page.locator('h1, h2, h3').all();
    console.log(`Headings: ${headings.length}`);
    for (const h of headings) {
      const t = await h.textContent();
      if (t?.trim()) console.log(`  Heading: "${t.trim()}"`);
    }

    if (consoleErrors.length > 0) {
      console.warn('Console errors on dashboard:', JSON.stringify(consoleErrors));
    }
  });

  test('D2: Study view — two-column layout (passage LEFT, questions RIGHT)', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await goTo(page, '#/study', 2000);

    await ss(page, 'D2-01-study-initial');

    // --- Check two-column layout ---
    const layoutInfo = await page.evaluate(() => {
      const allEls = Array.from(document.querySelectorAll('*'));
      const containers: any[] = [];

      for (const el of allEls) {
        const style = window.getComputedStyle(el);
        const rect = (el as HTMLElement).getBoundingClientRect();
        if (rect.width < 400 || rect.height < 100) continue;

        const display = style.display;
        if (display === 'grid' || display === 'flex') {
          containers.push({
            tag: el.tagName,
            class: el.className.substring(0, 60),
            display,
            gridCols: style.gridTemplateColumns,
            flexDir: style.flexDirection,
            flexWrap: style.flexWrap,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            children: el.children.length,
          });
        }
      }
      return containers.slice(0, 15);
    });

    console.log('Layout containers on study page:');
    layoutInfo.forEach(c =>
      console.log(`  <${c.tag} class="${c.class}"> ${c.display} gridCols="${c.gridCols}" flex="${c.flexDir}" ${c.width}x${c.height}@(${c.x},${c.y}) children=${c.children}`)
    );

    // Check that a two-column container exists (grid with two columns or flex row with children side by side)
    const twoColContainer = layoutInfo.find(c => {
      if (c.display === 'grid' && c.gridCols && c.gridCols !== 'none' && c.gridCols.includes(' ')) return true;
      if (c.display === 'flex' && c.flexDir !== 'column' && c.children >= 2 && c.width > 800) return true;
      return false;
    });
    if (twoColContainer) {
      console.log(`OK: Two-column container found: <${twoColContainer.tag} class="${twoColContainer.class}">`);
    } else {
      console.warn('ISSUE: No obvious two-column layout container found at desktop width');
    }

    // --- Passage column (left) ---
    const passageInfo = await page.evaluate(() => {
      const selectors = ['.passage', '.passage-panel', '[class*="passage"]', '.reading', '[class*="reading"]', 'article'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const rect = (el as HTMLElement).getBoundingClientRect();
          const text = el.textContent?.trim().substring(0, 200);
          return { selector: sel, x: rect.x, y: rect.y, width: Math.round(rect.width), height: Math.round(rect.height), text };
        }
      }
      return null;
    });
    console.log('Passage column:', passageInfo);
    if (passageInfo) {
      if (passageInfo.x > 400) {
        console.warn(`LAYOUT ISSUE: Passage appears on right side (x=${passageInfo.x}), expected left`);
      } else {
        console.log(`OK: Passage on left side (x=${passageInfo.x})`);
      }
      if (passageInfo.width > 900) {
        console.warn(`LAYOUT ISSUE: Passage is full-width (${passageInfo.width}px), expected ~half-width in two-column layout`);
      } else {
        console.log(`OK: Passage width ${passageInfo.width}px (expected < 900 in two-column layout)`);
      }
    } else {
      console.warn('ISSUE: Passage/reading column not found');
    }

    // --- Questions column (right) ---
    const questionsInfo = await page.evaluate(() => {
      const selectors = [
        '.questions', '.question-panel', '[class*="question"]',
        '.quiz', '.exercise', '.answers', '[class*="answer"]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const rect = (el as HTMLElement).getBoundingClientRect();
          const text = el.textContent?.trim().substring(0, 200);
          return { selector: sel, x: rect.x, y: rect.y, width: Math.round(rect.width), height: Math.round(rect.height), text };
        }
      }
      return null;
    });
    console.log('Questions column:', questionsInfo);
    if (questionsInfo) {
      if (questionsInfo.x < 400) {
        console.warn(`LAYOUT ISSUE: Questions appear on left (x=${questionsInfo.x}), expected right column`);
      } else {
        console.log(`OK: Questions on right side (x=${questionsInfo.x})`);
      }
    } else {
      console.warn('ISSUE: Questions/answers column not found');
    }

    // --- Passage text cleanliness ---
    const passageText = passageInfo?.text || '';
    if (passageText.includes('EXAME DE PROFICIÊNCIA')) {
      console.warn('BUG: Passage text contains artifact "EXAME DE PROFICIÊNCIA" — not cleaned!');
    } else if (passageText.length > 10) {
      console.log('OK: No "EXAME DE PROFICIÊNCIA" artifact in passage text');
    }

    // --- Bottom nav visibility on desktop study ---
    const bottomNavVisible = await page.evaluate(() => {
      const navCandidates = document.querySelectorAll('[class*="bottom-nav"], [class*="bottom_nav"], [class*="tabbar"]');
      return Array.from(navCandidates).map(el => ({
        class: el.className,
        visible: (el as HTMLElement).offsetParent !== null,
        display: window.getComputedStyle(el).display,
      }));
    });
    console.log('Bottom nav on desktop study:', bottomNavVisible);

    await ss(page, 'D2-02-study-layout');
    console.log('Layout screenshot taken');

    if (consoleErrors.length > 0) {
      console.warn('Console errors in study view:', JSON.stringify(consoleErrors));
    }
  });

  test('D3: Study view — answer a question (click option, confidence, feedback)', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await goTo(page, '#/study', 2000);

    await ss(page, 'D3-01-before-interaction');

    // --- Inspect all interactive elements ---
    const interactives = await page.evaluate(() => {
      const els = document.querySelectorAll('button, input, [role="button"], [class*="option"], [class*="choice"], [class*="answer"]');
      return Array.from(els)
        .filter(el => (el as HTMLElement).offsetParent !== null)
        .map(el => ({
          tag: el.tagName,
          type: (el as HTMLInputElement).type || '',
          class: el.className.substring(0, 60),
          text: el.textContent?.trim().substring(0, 60),
          role: el.getAttribute('role') || '',
        }))
        .slice(0, 30);
    });
    console.log('Interactive elements on study page:');
    interactives.forEach((el, i) =>
      console.log(`  [${i}] <${el.tag} type="${el.type}" class="${el.class}" role="${el.role}"> "${el.text}"`));

    // --- Try clicking an answer option ---
    let clicked = false;

    // Try radio buttons first
    const radios = page.locator('input[type="radio"]');
    const radioCount = await radios.count();
    console.log(`Radio buttons: ${radioCount}`);
    if (radioCount > 0) {
      await radios.first().click();
      await page.waitForTimeout(500);
      await ss(page, 'D3-02-after-radio-click');
      console.log('OK: Clicked first radio button');
      clicked = true;
    }

    // Try clickable option divs
    if (!clicked) {
      const optionDivs = page.locator('[class*="option"]:not(input), [class*="choice"], [class*="answer-btn"], [class*="answer-option"]');
      const optCount = await optionDivs.count();
      console.log(`Option divs: ${optCount}`);
      if (optCount > 0) {
        await optionDivs.first().click();
        await page.waitForTimeout(500);
        await ss(page, 'D3-02-after-option-click');
        console.log('OK: Clicked first option div');
        clicked = true;
      }
    }

    if (!clicked) {
      console.warn('ISSUE: Could not find any clickable answer options on study page');
    }

    // --- Confidence buttons ---
    const confidenceBtns = page.locator('button').filter({ hasText: /easy|medium|hard|fácil|difícil|normal|certeza|dúvida|não sei|again|good|great/i });
    const confCount = await confidenceBtns.count();
    console.log(`Confidence buttons: ${confCount}`);
    if (confCount > 0) {
      const confText = await confidenceBtns.first().textContent();
      console.log(`Clicking confidence button: "${confText?.trim()}"`);
      await confidenceBtns.first().click();
      await page.waitForTimeout(500);
      await ss(page, 'D3-03-after-confidence');
    }

    // --- Look for feedback shown ---
    const feedbackInfo = await page.evaluate(() => {
      const feedbackSelectors = [
        '[class*="feedback"]', '[class*="result"]', '[class*="correct"]',
        '[class*="wrong"]', '[class*="explanation"]', '[class*="toast"]',
        '.alert', '[role="alert"]',
      ];
      const results: any[] = [];
      for (const sel of feedbackSelectors) {
        const els = document.querySelectorAll(sel);
        els.forEach(el => {
          if ((el as HTMLElement).offsetParent !== null) {
            results.push({ selector: sel, text: el.textContent?.trim().substring(0, 100) });
          }
        });
      }
      return results;
    });
    if (feedbackInfo.length > 0) {
      console.log('OK: Feedback visible after answering:');
      feedbackInfo.forEach(f => console.log(`  [${f.selector}]: "${f.text}"`));
    } else {
      console.warn('ISSUE: No visible feedback after clicking an answer option');
    }

    // --- Submit/check button ---
    const submitBtn = page.locator('button').filter({ hasText: /check|submit|confirm|ver resposta|confirmar|responder/i });
    const submitCount = await submitBtn.count();
    if (submitCount > 0) {
      console.log(`Submit button found: "${await submitBtn.first().textContent()}"`);
      await submitBtn.first().click();
      await page.waitForTimeout(600);
      await ss(page, 'D3-04-after-submit');
    }

    await ss(page, 'D3-05-final-state');

    if (consoleErrors.length > 0) {
      console.warn('Console errors during interaction:', JSON.stringify(consoleErrors));
    }
  });

  test('D4: Bottom nav hides during study on desktop', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // First check bottom nav on dashboard
    const dashboardNavInfo = await page.evaluate(() => {
      const navEls = document.querySelectorAll(
        '[class*="bottom"], [class*="tab-bar"], [class*="tabbar"], nav, [class*="navbar"]'
      );
      return Array.from(navEls).map(el => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          class: el.className.substring(0, 60),
          visible: (el as HTMLElement).offsetParent !== null,
          display: style.display,
          top: Math.round(rect.top),
          height: Math.round(rect.height),
        };
      });
    });
    console.log('Nav elements on dashboard:');
    dashboardNavInfo.forEach(n => console.log(`  class="${n.class}" visible=${n.visible} display=${n.display} top=${n.top} h=${n.height}`));
    await ss(page, 'D4-01-dashboard-nav');

    // Navigate to study
    await goTo(page, '#/study', 2000);

    const studyNavInfo = await page.evaluate(() => {
      const navEls = document.querySelectorAll(
        '[class*="bottom"], [class*="tab-bar"], [class*="tabbar"], nav, [class*="navbar"]'
      );
      return Array.from(navEls).map(el => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          class: el.className.substring(0, 60),
          visible: (el as HTMLElement).offsetParent !== null,
          display: style.display,
          top: Math.round(rect.top),
          height: Math.round(rect.height),
        };
      });
    });
    console.log('Nav elements on study page:');
    studyNavInfo.forEach(n => console.log(`  class="${n.class}" visible=${n.visible} display=${n.display} top=${n.top} h=${n.height}`));
    await ss(page, 'D4-02-study-nav');

    // If bottom nav was visible on dashboard but should be hidden on desktop study view, check
    const dashVisible = dashboardNavInfo.some(n => n.visible && n.top > 600);
    const studyVisible = studyNavInfo.some(n => n.visible && n.top > 600);
    if (dashVisible && !studyVisible) {
      console.log('OK: Bottom nav hidden during study on desktop (as expected)');
    } else if (dashVisible && studyVisible) {
      console.warn('POSSIBLE ISSUE: Bottom nav still visible during study on desktop (may overlap content)');
    } else {
      console.log(`Bottom nav: dashboard visible=${dashVisible}, study visible=${studyVisible}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MOBILE TESTS (375x812)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Mobile (375x812)', () => {
  let consoleErrors: { type: string; text: string }[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') {
        consoleErrors.push({ type: 'console.error', text: msg.text() });
        globalConsoleErrors.push({ test: test.info().title, type: 'console.error', text: msg.text() });
      }
    });
    page.on('pageerror', (err: Error) => {
      consoleErrors.push({ type: 'pageerror', text: err.message });
      globalConsoleErrors.push({ test: test.info().title, type: 'pageerror', text: err.message });
    });
  });

  test('M1: Study — passage tab shows text', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await goTo(page, '#/study', 2000);

    await ss(page, 'M1-01-mobile-study-initial');

    // Horizontal overflow check
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (overflow.scrollWidth > overflow.clientWidth) {
      console.warn(`MOBILE OVERFLOW: scrollWidth=${overflow.scrollWidth} > clientWidth=${overflow.clientWidth}`);
    } else {
      console.log(`OK: No horizontal overflow (scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth})`);
    }

    // Check for tabs on mobile (passage / question tabs)
    const tabsInfo = await page.evaluate(() => {
      const tabSelectors = [
        '[class*="tab"]', '[role="tab"]', '[class*="switch"]', '[class*="toggle"]'
      ];
      const results: any[] = [];
      for (const sel of tabSelectors) {
        const els = document.querySelectorAll(sel);
        els.forEach(el => {
          if ((el as HTMLElement).offsetParent !== null) {
            const className = typeof el.className === 'string' ? el.className : (el.className as any).baseVal || '';
            results.push({
              selector: sel,
              tag: el.tagName,
              class: className.substring(0, 50),
              text: el.textContent?.trim().substring(0, 40),
            });
          }
        });
      }
      return results.slice(0, 10);
    });
    console.log('Tab elements on mobile study:');
    tabsInfo.forEach(t => console.log(`  [${t.selector}] <${t.tag} class="${t.class}"> "${t.text}"`));

    // Check passage text is visible (first tab should be passage)
    const passageText = await page.evaluate(() => {
      const passageSelectors = ['.passage', '[class*="passage"]', '.reading', 'article', '[class*="text-content"]'];
      for (const sel of passageSelectors) {
        const el = document.querySelector(sel);
        if (el && (el as HTMLElement).offsetParent !== null) {
          return { selector: sel, text: el.textContent?.trim().substring(0, 200), visible: true };
        }
      }
      return null;
    });

    if (passageText) {
      console.log(`OK: Passage visible on mobile: "${passageText.text?.substring(0, 80)}..."`);
      if (passageText.text && passageText.text.includes('EXAME DE PROFICIÊNCIA')) {
        console.warn('BUG: Artifact text "EXAME DE PROFICIÊNCIA" found in passage!');
      }
    } else {
      // Check if the passage tab is not selected (maybe question tab is active)
      const visibleText = await page.locator('body').textContent();
      console.log(`Body text length: ${visibleText?.length}`);
      console.warn('ISSUE: Passage content not found in visible DOM on mobile');
    }

    await ss(page, 'M1-02-passage-tab');

    if (consoleErrors.length > 0) {
      console.warn('Console errors:', JSON.stringify(consoleErrors));
    }
  });

  test('M2: Study — click Questão tab and answer a question', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await goTo(page, '#/study', 2000);

    await ss(page, 'M2-01-before-tab-switch');

    // Find and click the "Questão" tab
    const questaoTab = page.locator('button, [role="tab"], [class*="tab"]').filter({ hasText: /quest[aã]o|question/i });
    const questaoCount = await questaoTab.count();
    console.log(`Questão tab elements: ${questaoCount}`);

    if (questaoCount > 0) {
      const tabText = await questaoTab.first().textContent();
      console.log(`Clicking tab: "${tabText?.trim()}"`);
      await questaoTab.first().click();
      await page.waitForTimeout(600);
      await ss(page, 'M2-02-after-questao-tab-click');
      console.log('OK: Clicked Questão tab');
    } else {
      // Try clicking any second tab
      const allTabs = page.locator('[role="tab"], [class*="tab-btn"], [class*="tab-item"]');
      const allTabCount = await allTabs.count();
      console.log(`All tab elements: ${allTabCount}`);
      if (allTabCount >= 2) {
        await allTabs.nth(1).click();
        await page.waitForTimeout(600);
        await ss(page, 'M2-02-after-second-tab-click');
        console.log('Clicked second tab');
      } else {
        console.warn('ISSUE: No tab switching mechanism found on mobile study view');
      }
    }

    // Verify question content appears after tab switch
    const questionContent = await page.evaluate(() => {
      const questionSelectors = [
        '.question', '[class*="question"]', 'input[type="radio"]',
        '[class*="option"]', '[class*="choice"]', '.answers',
      ];
      for (const sel of questionSelectors) {
        const el = document.querySelector(sel);
        if (el && (el as HTMLElement).offsetParent !== null) {
          return { selector: sel, text: el.textContent?.trim().substring(0, 100) };
        }
      }
      return null;
    });

    if (questionContent) {
      console.log(`OK: Question content visible after tab switch: [${questionContent.selector}] "${questionContent.text}"`);
    } else {
      console.warn('ISSUE: No question content visible after clicking Questão tab');
    }

    // Try answering a question on mobile
    const radios = page.locator('input[type="radio"]');
    const radioCount = await radios.count();
    const optionBtns = page.locator('[class*="option"]:not(input), [class*="choice"]');
    const optCount = await optionBtns.count();
    console.log(`Mobile - radios: ${radioCount}, option btns: ${optCount}`);

    if (radioCount > 0) {
      await radios.first().click();
      await page.waitForTimeout(400);
      await ss(page, 'M2-03-after-answer-click');
      console.log('OK: Clicked answer option on mobile');
    } else if (optCount > 0) {
      await optionBtns.first().click();
      await page.waitForTimeout(400);
      await ss(page, 'M2-03-after-answer-click');
      console.log('OK: Clicked option button on mobile');
    } else {
      console.warn('ISSUE: No answer options found on mobile after tab switch');
      await ss(page, 'M2-03-no-answer-options');
    }

    if (consoleErrors.length > 0) {
      console.warn('Console errors:', JSON.stringify(consoleErrors));
    }
  });

  test('M3: Bottom nav visible on mobile', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    await ss(page, 'M3-01-mobile-dashboard');

    const navInfo = await page.evaluate(() => {
      const candidates = document.querySelectorAll(
        'nav, [class*="bottom-nav"], [class*="bottom_nav"], [class*="tabbar"], [class*="tab-bar"], [class*="nav-bar"], [class*="navbar"]'
      );
      return Array.from(candidates).map(el => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return {
          tag: el.tagName,
          class: el.className.substring(0, 80),
          visible: (el as HTMLElement).offsetParent !== null,
          display: style.display,
          position: style.position,
          bottom: style.bottom,
          top: Math.round(rect.top),
          height: Math.round(rect.height),
          text: el.textContent?.trim().substring(0, 100),
        };
      });
    });

    console.log('Nav elements on mobile:');
    navInfo.forEach(n =>
      console.log(`  <${n.tag} class="${n.class}"> visible=${n.visible} display=${n.display} pos=${n.position} bottom=${n.bottom} top=${n.top} h=${n.height} text="${n.text?.substring(0, 50)}"`));

    const bottomNavVisible = navInfo.some(n => n.visible && n.height > 30 && n.height < 120);
    if (bottomNavVisible) {
      console.log('OK: Bottom navigation is visible on mobile dashboard');
    } else {
      console.warn('ISSUE: Bottom navigation not found/visible on mobile');
    }

    // Navigate to study on mobile and check nav is still visible
    await goTo(page, '#/study', 1500);
    await ss(page, 'M3-02-mobile-study-nav');

    const studyNavInfo = await page.evaluate(() => {
      const candidates = document.querySelectorAll(
        'nav, [class*="bottom-nav"], [class*="tabbar"], [class*="tab-bar"], [class*="navbar"]'
      );
      return Array.from(candidates).map(el => {
        const rect = (el as HTMLElement).getBoundingClientRect();
        return {
          class: el.className.substring(0, 60),
          visible: (el as HTMLElement).offsetParent !== null,
          top: Math.round(rect.top),
          height: Math.round(rect.height),
        };
      });
    });

    const studyBottomNavVisible = studyNavInfo.some(n => n.visible && n.height > 30 && n.height < 120);
    if (studyBottomNavVisible) {
      console.log('OK: Bottom nav visible on mobile study view');
    } else {
      console.warn('ISSUE: Bottom nav not visible on mobile study view');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS TESTS
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Settings', () => {
  let consoleErrors: { type: string; text: string }[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') {
        consoleErrors.push({ type: 'console.error', text: msg.text() });
      }
    });
    page.on('pageerror', (err: Error) => {
      consoleErrors.push({ type: 'pageerror', text: err.message });
    });
  });

  test('S1: Theme toggle — Claro sets light, Escuro sets dark', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await goTo(page, '#/settings', 1500);

    await ss(page, 'S1-01-settings-initial');

    // Get initial theme
    const initialTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme') || document.documentElement.className
    );
    console.log(`Initial theme: "${initialTheme}"`);

    // Find all buttons in settings
    const allBtns = await page.locator('button').all();
    console.log(`Buttons in settings: ${allBtns.length}`);
    for (let i = 0; i < allBtns.length; i++) {
      const t = await allBtns[i].textContent();
      const v = await allBtns[i].isVisible();
      console.log(`  Button [${i}]: "${t?.trim()}" visible=${v}`);
    }

    // Click "Claro" (light theme)
    const claroBtn = page.locator('button').filter({ hasText: /claro|light/i });
    const claroCount = await claroBtn.count();
    console.log(`"Claro" button count: ${claroCount}`);

    if (claroCount > 0) {
      await claroBtn.first().click();
      await page.waitForTimeout(600);

      const afterLightTheme = await page.evaluate(() =>
        document.documentElement.getAttribute('data-theme') || document.documentElement.className
      );
      console.log(`Theme after clicking Claro: "${afterLightTheme}"`);
      await ss(page, 'S1-02-after-claro');

      if (afterLightTheme === 'light' || afterLightTheme?.includes('light')) {
        console.log('OK: data-theme="light" set after clicking Claro');
      } else {
        console.warn(`ISSUE: Expected data-theme="light" after clicking Claro, got "${afterLightTheme}"`);
      }
    } else {
      console.warn('ISSUE: No "Claro" button found in settings');
    }

    // Click "Escuro" (dark theme)
    const escuroBtn = page.locator('button').filter({ hasText: /escuro|dark/i });
    const escuroCount = await escuroBtn.count();
    console.log(`"Escuro" button count: ${escuroCount}`);

    if (escuroCount > 0) {
      await escuroBtn.first().click();
      await page.waitForTimeout(600);

      const afterDarkTheme = await page.evaluate(() =>
        document.documentElement.getAttribute('data-theme') || document.documentElement.className
      );
      console.log(`Theme after clicking Escuro: "${afterDarkTheme}"`);
      await ss(page, 'S1-03-after-escuro');

      if (afterDarkTheme === 'dark' || afterDarkTheme?.includes('dark')) {
        console.log('OK: data-theme="dark" set after clicking Escuro');
      } else {
        console.warn(`ISSUE: Expected data-theme="dark" after clicking Escuro, got "${afterDarkTheme}"`);
      }
    } else {
      console.warn('ISSUE: No "Escuro" button found in settings');
    }

    // Check for "Sistema" (system) option
    const sistemaBtn = page.locator('button').filter({ hasText: /sistema|system/i });
    if (await sistemaBtn.count() > 0) {
      console.log('OK: "Sistema" theme option also present');
    }

    await ss(page, 'S1-04-settings-final');

    if (consoleErrors.length > 0) {
      console.warn('Console errors in settings:', JSON.stringify(consoleErrors));
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// UX AUDIT
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('UX Audit', () => {
  let consoleErrors: { type: string; text: string }[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') {
        consoleErrors.push({ type: 'console.error', text: msg.text() });
        globalConsoleErrors.push({ test: test.info().title, type: 'console.error', text: msg.text() });
      }
    });
    page.on('pageerror', (err: Error) => {
      consoleErrors.push({ type: 'pageerror', text: err.message });
      globalConsoleErrors.push({ test: test.info().title, type: 'pageerror', text: err.message });
    });
  });

  test('UX1: Console errors across all routes', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    const routeErrors: { route: string; errors: string[] }[] = [];

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const routes = [
      { hash: '#/', label: 'dashboard' },
      { hash: '#/study', label: 'study' },
      { hash: '#/exam', label: 'exam' },
      { hash: '#/review', label: 'review' },
      { hash: '#/analytics', label: 'analytics' },
      { hash: '#/settings', label: 'settings' },
    ];

    for (const route of routes) {
      const errors: string[] = [];
      const listener = (msg: ConsoleMessage) => {
        if (msg.type() === 'error') errors.push(msg.text());
      };
      page.on('console', listener);

      await goTo(page, route.hash, 1500);
      await ss(page, `UX1-${route.label}`);

      page.off('console', listener);

      if (errors.length > 0) {
        routeErrors.push({ route: route.hash, errors });
        console.warn(`CONSOLE ERRORS at ${route.hash}:`, errors);
      } else {
        console.log(`OK: No console errors at ${route.hash}`);
      }
    }

    console.log(`\nConsole error summary: ${routeErrors.length} routes with errors`);
    routeErrors.forEach(r => console.warn(`  ${r.route}: ${r.errors.join(' | ')}`));
  });

  test('UX2: Toast behavior — auto-dismiss within 3s', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await goTo(page, '#/study', 2000);

    // Trigger toast by answering a question
    const radios = page.locator('input[type="radio"]');
    if (await radios.count() > 0) {
      await radios.first().click();
      await page.waitForTimeout(200);

      // Check immediately for toasts
      const toastInfo = await page.evaluate(() => {
        const toastSelectors = ['[class*="toast"]', '[class*="snack"]', '[class*="notification"]', '[role="alert"]', '[class*="alert"]'];
        const found: any[] = [];
        for (const sel of toastSelectors) {
          document.querySelectorAll(sel).forEach(el => {
            if ((el as HTMLElement).offsetParent !== null) {
              found.push({ selector: sel, text: el.textContent?.trim().substring(0, 80) });
            }
          });
        }
        return found;
      });
      console.log(`Toasts visible immediately after click: ${toastInfo.length}`);
      if (toastInfo.length > 0) {
        console.log('Toast content:', toastInfo.map(t => `[${t.selector}] "${t.text}"`).join(', '));
        if (toastInfo.length > 2) {
          console.warn(`ISSUE: More than 2 toasts visible (${toastInfo.length}) — should be limited to 2`);
        }
        await ss(page, 'UX2-01-toast-visible');

        // Wait 3s and check if auto-dismissed
        await page.waitForTimeout(3000);
        const toastsAfter3s = await page.evaluate(() => {
          const toastSelectors = ['[class*="toast"]', '[class*="snack"]', '[class*="notification"]'];
          let count = 0;
          for (const sel of toastSelectors) {
            document.querySelectorAll(sel).forEach(el => {
              if ((el as HTMLElement).offsetParent !== null) count++;
            });
          }
          return count;
        });
        if (toastsAfter3s === 0) {
          console.log('OK: Toast auto-dismissed within 3s');
        } else {
          console.warn(`ISSUE: Toast still visible after 3s (${toastsAfter3s} toasts)`);
        }
        await ss(page, 'UX2-02-after-3s');
      } else {
        console.log('No toasts visible after clicking radio (toasts may only show on submit)');
      }
    }
  });

  test('UX3: Navigation paths — all routes reachable', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const routes = [
      { hash: '#/', label: 'dashboard', minContentLength: 50 },
      { hash: '#/study', label: 'study', minContentLength: 50 },
      { hash: '#/exam', label: 'exam', minContentLength: 20 },
      { hash: '#/review', label: 'review', minContentLength: 20 },
      { hash: '#/analytics', label: 'analytics', minContentLength: 20 },
      { hash: '#/settings', label: 'settings', minContentLength: 20 },
    ];

    for (const route of routes) {
      await goTo(page, route.hash, 1500);

      const bodyText = (await page.locator('body').textContent())?.trim() ?? '';
      const currentHash = await page.evaluate(() => window.location.hash);

      if (bodyText.length < route.minContentLength) {
        console.warn(`ISSUE: Route ${route.hash} has very little content (${bodyText.length} chars)`);
      } else {
        console.log(`OK: ${route.hash} loaded (${bodyText.length} chars of content)`);
      }

      // Check for crash indicators
      if (bodyText.toLowerCase().includes('error') && bodyText.length < 200) {
        console.warn(`POSSIBLE CRASH at ${route.hash}: "${bodyText.substring(0, 100)}"`);
      }
    }

    console.log('All routes navigated successfully');
  });

  test('UX4: Auto-load passage on direct #/study navigation', async ({ page }) => {
    await page.setViewportSize(DESKTOP);

    // Navigate directly to #/study without loading dashboard first
    await page.goto(BASE_URL + '#/study', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await ss(page, 'UX4-01-direct-study-navigation');

    const bodyText = await page.locator('body').textContent();
    console.log(`Content length after direct #/study: ${bodyText?.length}`);

    // Check if passage loaded
    const passageLoaded = await page.evaluate(() => {
      const selectors = ['.passage', '[class*="passage"]', 'article', '.reading', '[class*="reading"]'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && (el as HTMLElement).offsetParent !== null && (el.textContent?.trim().length ?? 0) > 50) {
          return { loaded: true, selector: sel, textLength: el.textContent?.trim().length };
        }
      }
      return { loaded: false };
    });

    if (passageLoaded.loaded) {
      console.log(`OK: Passage auto-loaded on direct #/study navigation (${passageLoaded.textLength} chars via ${passageLoaded.selector})`);
    } else {
      console.warn('ISSUE: Passage did NOT auto-load on direct #/study navigation');
    }

    if (consoleErrors.length > 0) {
      console.warn('Console errors:', JSON.stringify(consoleErrors));
    }
  });

  test('UX5: Visual issues — overlapping, overflow, font sizes', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const routes = ['#/', '#/study', '#/exam', '#/settings'];

    for (const route of routes) {
      await goTo(page, route, 1500);

      // Check for overflow
      const overflowInfo = await page.evaluate(() => {
        const overflowing: any[] = [];
        const els = document.querySelectorAll('*');
        const docWidth = document.documentElement.clientWidth;

        els.forEach(el => {
          const rect = (el as HTMLElement).getBoundingClientRect();
          if (rect.right > docWidth + 5) {
            overflowing.push({
              tag: el.tagName,
              class: el.className.substring(0, 40),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
              text: el.textContent?.trim().substring(0, 40),
            });
          }
        });
        return overflowing.slice(0, 5);
      });

      if (overflowInfo.length > 0) {
        console.warn(`OVERFLOW ISSUE at ${route}:`);
        overflowInfo.forEach(e =>
          console.warn(`  <${e.tag} class="${e.class}"> right=${e.right} width=${e.width} text="${e.text}"`));
      } else {
        console.log(`OK: No overflow at ${route}`);
      }

      // Check font sizes of body text
      const fontSizeInfo = await page.evaluate(() => {
        const textNodes = document.querySelectorAll('p, li, span, label, button, a, h1, h2, h3, h4');
        const sizes: { [key: string]: number } = {};
        textNodes.forEach(el => {
          if ((el as HTMLElement).offsetParent !== null) {
            const size = window.getComputedStyle(el).fontSize;
            sizes[size] = (sizes[size] || 0) + 1;
          }
        });
        return sizes;
      });
      const tinyFonts = Object.entries(fontSizeInfo).filter(([size]) => parseFloat(size) < 12);
      if (tinyFonts.length > 0) {
        console.warn(`FONT SIZE ISSUE at ${route}: Elements with font < 12px:`, tinyFonts);
      } else {
        console.log(`OK: Font sizes acceptable at ${route}:`, Object.keys(fontSizeInfo).sort().join(', '));
      }
    }

    await ss(page, 'UX5-visual-audit');
  });

  test('UX6: Spacing and alignment audit', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const routes = [
      { hash: '#/', label: 'dashboard' },
      { hash: '#/study', label: 'study' },
      { hash: '#/settings', label: 'settings' },
    ];

    for (const route of routes) {
      await goTo(page, route.hash, 1500);
      await ss(page, `UX6-${route.label}`);

      // Check for elements too close to viewport edges
      const edgeIssues = await page.evaluate(() => {
        const issues: any[] = [];
        const textEls = document.querySelectorAll('p, h1, h2, h3, button, input, label');
        textEls.forEach(el => {
          if ((el as HTMLElement).offsetParent !== null) {
            const rect = (el as HTMLElement).getBoundingClientRect();
            if (rect.left < 4 && rect.width > 50) {
              issues.push({
                tag: el.tagName,
                class: el.className.substring(0, 30),
                left: Math.round(rect.left),
                text: el.textContent?.trim().substring(0, 30),
              });
            }
          }
        });
        return issues.slice(0, 5);
      });

      if (edgeIssues.length > 0) {
        console.warn(`SPACING ISSUE at ${route.hash} — elements flush to left edge:`);
        edgeIssues.forEach(e =>
          console.warn(`  <${e.tag} class="${e.class}"> left=${e.left} text="${e.text}"`));
      } else {
        console.log(`OK: No edge-flush elements at ${route.hash}`);
      }

      // Check for CSS custom properties (design tokens)
      const cssVars = await page.evaluate(() => {
        const style = getComputedStyle(document.documentElement);
        return {
          primaryColor: style.getPropertyValue('--color-primary').trim(),
          bgColor: style.getPropertyValue('--color-background').trim(),
          textColor: style.getPropertyValue('--color-text').trim(),
          surfaceColor: style.getPropertyValue('--color-surface').trim(),
          spacing: style.getPropertyValue('--spacing-md').trim() || style.getPropertyValue('--spacing').trim(),
          borderRadius: style.getPropertyValue('--radius').trim() || style.getPropertyValue('--border-radius').trim(),
        };
      });
      if (route.hash === '#/') {
        console.log('CSS design tokens:', cssVars);
      }
    }
  });

  test('UX7: Accessibility — alt text, ARIA, labels, keyboard focus', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Collect issues across all routes
    const a11yIssues: string[] = [];

    const routes = ['#/', '#/study', '#/settings'];
    for (const route of routes) {
      await goTo(page, route, 1200);

      const issues = await page.evaluate(() => {
        const found: string[] = [];

        // Images without alt
        document.querySelectorAll('img').forEach(img => {
          if (!img.alt) found.push(`img[src="${img.src.substring(img.src.lastIndexOf('/') + 1)}"] missing alt`);
        });

        // Buttons without accessible name
        document.querySelectorAll('button').forEach(btn => {
          if (!(btn as HTMLElement).offsetParent) return;
          const hasText = btn.textContent?.trim();
          const hasLabel = btn.getAttribute('aria-label');
          const hasTitle = btn.getAttribute('title');
          if (!hasText && !hasLabel && !hasTitle) {
            found.push(`button.${btn.className.substring(0, 30)} has no accessible name`);
          }
        });

        // Inputs without labels
        document.querySelectorAll('input, select, textarea').forEach(inp => {
          const id = inp.id;
          const hasLabel = id && document.querySelector(`label[for="${id}"]`);
          const ariaLabel = inp.getAttribute('aria-label') || inp.getAttribute('aria-labelledby');
          const placeholder = (inp as HTMLInputElement).placeholder;
          if (!hasLabel && !ariaLabel && !placeholder) {
            found.push(`<${inp.tagName} id="${id}"> has no label/aria-label/placeholder`);
          }
        });

        // Labels that reference non-existent form field IDs
        document.querySelectorAll('label[for]').forEach(label => {
          const forValue = label.getAttribute('for');
          if (!forValue || !document.getElementById(forValue)) {
            found.push(`label[for="${forValue}"] has no matching element id`);
          }
        });

        // Labels that are not associated with any form field
        document.querySelectorAll('label:not([for])').forEach(label => {
          const hasNestedControl = !!label.querySelector('input, select, textarea');
          if (!hasNestedControl) {
            const text = (label.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
            found.push(`label "${text}" is not associated with a form field`);
          }
        });

        return found;
      });

      if (issues.length > 0) {
        console.warn(`A11Y issues at ${route}:`);
        issues.forEach(issue => {
          console.warn(`  - ${issue}`);
          a11yIssues.push(`[${route}] ${issue}`);
        });
      } else {
        console.log(`OK: No a11y issues at ${route}`);
      }
    }

    const orphanLabelIssues = a11yIssues.filter(issue => issue.includes('label[for="'));
    expect(
      orphanLabelIssues,
      `Orphan label references found:\n${orphanLabelIssues.join('\n')}`
    ).toEqual([]);

    // Keyboard focus test
    await goTo(page, '#/', 1000);
    await page.keyboard.press('Tab');
    const focusEl = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return 'no focus (body)';
      const rect = el.getBoundingClientRect();
      return `<${el.tagName} class="${el.className.substring(0, 30)}" id="${el.id}"> at (${Math.round(rect.x)}, ${Math.round(rect.y)})`;
    });
    console.log(`First Tab focus: ${focusEl}`);
    if (focusEl === 'no focus (body)') {
      console.warn('A11Y ISSUE: Tab key does not move focus to any element');
    }

    await ss(page, 'UX7-accessibility');

    console.log(`\nTotal a11y issues found: ${a11yIssues.length}`);
  });
});
