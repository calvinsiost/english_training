import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BASE_URL = 'https://calvinsiost.github.io/english_training/';
const OUT = 'c:/Users/calvi/Github/english_training/test-screenshots';
fs.mkdirSync(OUT, { recursive: true });

const ss = async (page: Page, name: string) =>
  page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });

const go = async (page: Page, hash: string) => {
  // Navigate via full URL reload to avoid SPA state leaking
  await page.goto(BASE_URL + hash, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
};

test.describe('Deep Investigation', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // A. PASSAGE TEXT RENDERING (the blank passage panel)
  // ─────────────────────────────────────────────────────────────────────────
  test('A. Study view - passage text content investigation', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await go(page, '#/study');

    // Check the passage-text element directly
    const passageEl = page.locator('#passage-text');
    const passageCount = await passageEl.count();
    console.log(`#passage-text elements: ${passageCount}`);

    if (passageCount > 0) {
      const innerHTML = await passageEl.first().innerHTML();
      const textContent = await passageEl.first().textContent();
      console.log(`#passage-text innerHTML length: ${innerHTML.length}`);
      console.log(`#passage-text textContent: "${textContent?.trim().substring(0, 300)}"`);

      // Check if it's inside a collapsed container
      const panelEl = page.locator('#passage-panel');
      const panelClass = await panelEl.getAttribute('class');
      console.log(`#passage-panel class: "${panelClass}"`);

      // Check CSS computed visibility
      const visInfo = await passageEl.first().evaluate((el: HTMLElement) => {
        const style = window.getComputedStyle(el);
        return {
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          height: style.height,
          overflow: style.overflow,
          maxHeight: style.maxHeight,
          offsetHeight: el.offsetHeight,
          scrollHeight: el.scrollHeight,
        };
      });
      console.log('passage-text computed styles:', visInfo);

      // Check panel visibility
      const panelVisInfo = await panelEl.evaluate((el: HTMLElement) => {
        const style = window.getComputedStyle(el);
        return {
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          height: style.height,
          maxHeight: style.maxHeight,
          overflow: style.overflow,
          offsetHeight: el.offsetHeight,
        };
      });
      console.log('#passage-panel computed styles:', panelVisInfo);
    }

    // Check passage header clickability
    const passageHeader = page.locator('#passage-header');
    const headerCount = await passageHeader.count();
    console.log(`#passage-header count: ${headerCount}`);

    if (headerCount > 0) {
      const headerText = await passageHeader.textContent();
      console.log(`Passage header text: "${headerText?.trim()}"`);
      // Click it to expand
      await passageHeader.click();
      await page.waitForTimeout(500);
      await ss(page, 'A-passage-after-header-click');
      const panelClassAfter = await page.locator('#passage-panel').getAttribute('class');
      console.log(`#passage-panel class after click: "${panelClassAfter}"`);
      const passageTextAfter = await passageEl.first().textContent();
      console.log(`Passage text after click: "${passageTextAfter?.trim().substring(0, 300)}"`);
    }

    await ss(page, 'A-passage-initial');

    // Check the state object for passages
    const appState = await page.evaluate(() => {
      return (window as any).state ? JSON.stringify((window as any).state, null, 2).substring(0, 1000) : 'state not accessible';
    });
    console.log('App state:', appState);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // B. ROUTING — does hash-based nav actually switch views?
  // ─────────────────────────────────────────────────────────────────────────
  test('B. Hash routing - which view is actually active', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });

    const routes = [
      { url: BASE_URL, label: 'root', expected: 'dashboard' },
      { url: BASE_URL + '#/', label: 'hash-root', expected: 'dashboard' },
      { url: BASE_URL + '#/study', label: 'study', expected: 'study' },
      { url: BASE_URL + '#/exam', label: 'exam', expected: 'exam' },
      { url: BASE_URL + '#/analytics', label: 'analytics', expected: 'analytics' },
      { url: BASE_URL + '#/settings', label: 'settings', expected: 'settings' },
      { url: BASE_URL + '#/review', label: 'review', expected: 'review' },
    ];

    for (const route of routes) {
      await page.goto(route.url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);

      // Check which view has view--active
      const activeViews = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.view--active')).map(el => ({
          id: el.id,
          class: el.className,
        }));
      });

      const activeIds = activeViews.map(v => v.id).join(', ');
      const correct = activeIds.includes(route.expected);
      console.log(`Route "${route.label}" → active views: [${activeIds}] — expected "${route.expected}" — ${correct ? 'PASS' : 'FAIL'}`);

      if (!correct) {
        console.warn(`ROUTING BUG: Navigating to ${route.url} shows "${activeIds}" instead of "${route.expected}"`);
      }

      await ss(page, `B-route-${route.label}`);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // C. DASHBOARD BUTTON NAVIGATION — clicking cards
  // ─────────────────────────────────────────────────────────────────────────
  test('C. Dashboard buttons navigate correctly', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    await ss(page, 'C-dashboard');

    // Get all buttons
    const btns = page.locator('button');
    const count = await btns.count();
    console.log(`Dashboard buttons total: ${count}`);

    const visibleBtns: {text: string, index: number}[] = [];
    for (let i = 0; i < count; i++) {
      const btn = btns.nth(i);
      const visible = await btn.isVisible();
      const text = (await btn.textContent())?.trim() || '';
      if (visible) {
        visibleBtns.push({ text, index: i });
        console.log(`  Visible button [${i}]: "${text.substring(0, 60)}"`);
      }
    }

    // Click "Nova Passagem"
    const novaPassagem = page.locator('button').filter({ hasText: /Nova Passagem/i });
    if (await novaPassagem.count() > 0) {
      await novaPassagem.click();
      await page.waitForTimeout(1000);
      const hash = await page.evaluate(() => window.location.hash);
      const activeView = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.view--active')).map(e => e.id).join(',')
      );
      console.log(`After "Nova Passagem" click: hash="${hash}", active="${activeView}"`);
      await ss(page, 'C-after-nova-passagem');

      // Go back
      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
    }

    // Click "Prova Real"
    const provaReal = page.locator('button').filter({ hasText: /Prova Real/i });
    if (await provaReal.count() > 0) {
      await provaReal.click();
      await page.waitForTimeout(1000);
      const hash = await page.evaluate(() => window.location.hash);
      const activeView = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.view--active')).map(e => e.id).join(',')
      );
      console.log(`After "Prova Real" click: hash="${hash}", active="${activeView}"`);
      await ss(page, 'C-after-prova-real');

      await page.goto(BASE_URL, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
    }

    // Click "Análise"
    const analise = page.locator('button').filter({ hasText: /^Análise$/i });
    if (await analise.count() > 0) {
      await analise.click();
      await page.waitForTimeout(1000);
      const hash = await page.evaluate(() => window.location.hash);
      const activeView = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.view--active')).map(e => e.id).join(',')
      );
      console.log(`After "Análise" click: hash="${hash}", active="${activeView}"`);
      await ss(page, 'C-after-analise');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // D. STUDY FLOW — full flow with passage header expanded
  // ─────────────────────────────────────────────────────────────────────────
  test('D. Study flow - complete answer and submit', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto(BASE_URL + '#/study', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    await ss(page, 'D-study-start');

    // DOM structure dump
    const structure = await page.evaluate(() => {
      const study = document.getElementById('study');
      if (!study) return 'NO STUDY VIEW';
      function dump(el: Element, depth = 0): string {
        if (depth > 3) return '';
        const rect = (el as HTMLElement).getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const line = `${'  '.repeat(depth)}<${el.tagName}#${el.id}.${el.className.split(' ').slice(0,2).join('.')} display=${style.display} ${Math.round(rect.width)}x${Math.round(rect.height)}>`;
        return line + '\n' + Array.from(el.children).map(c => dump(c, depth+1)).join('');
      }
      return dump(study);
    });
    console.log('Study view DOM structure:\n', structure.substring(0, 3000));

    // Check if passage panel is collapsed initially
    const panelEl = page.locator('#passage-panel');
    const isCollapsed = await panelEl.evaluate((el: HTMLElement) => el.classList.contains('collapsed'));
    console.log(`Passage panel is collapsed: ${isCollapsed}`);

    if (isCollapsed) {
      // Click header to expand
      await page.locator('#passage-header').click();
      await page.waitForTimeout(500);
      console.log('Expanded passage panel');
      await ss(page, 'D-passage-expanded');
    }

    // Get passage text content
    const passageText = await page.locator('#passage-text').textContent();
    console.log(`Passage text (first 300 chars): "${passageText?.trim().substring(0, 300)}"`);

    // Try clicking option-btn
    const optionBtns = page.locator('.option-btn');
    const optCount = await optionBtns.count();
    console.log(`Option buttons (.option-btn): ${optCount}`);

    if (optCount > 0) {
      // Get all option texts
      for (let i = 0; i < optCount; i++) {
        const text = await optionBtns.nth(i).textContent();
        const disabled = await optionBtns.nth(i).isDisabled();
        const visible = await optionBtns.nth(i).isVisible();
        console.log(`  option-btn [${i}]: "${text?.trim().substring(0, 50)}" disabled=${disabled} visible=${visible}`);
      }

      // Click first visible option
      for (let i = 0; i < optCount; i++) {
        const btn = optionBtns.nth(i);
        if (await btn.isVisible() && !(await btn.isDisabled())) {
          await btn.click();
          console.log(`Clicked option-btn [${i}]`);
          await page.waitForTimeout(600);
          await ss(page, 'D-after-option-click');
          break;
        }
      }
    }

    // Check feedback section
    const feedbackEl = page.locator('#feedback-section, .feedback, [class*="feedback"]');
    const feedbackCount = await feedbackEl.count();
    console.log(`Feedback elements: ${feedbackCount}`);
    if (feedbackCount > 0) {
      const feedbackText = await feedbackEl.first().textContent();
      const feedbackVisible = await feedbackEl.first().isVisible();
      console.log(`Feedback: visible=${feedbackVisible}, text="${feedbackText?.trim().substring(0, 200)}"`);
    }

    // Check btn-next visibility
    const btnNext = page.locator('#btn-next');
    if (await btnNext.count() > 0) {
      const visible = await btnNext.isVisible();
      const disabled = await btnNext.isDisabled();
      console.log(`#btn-next: visible=${visible}, disabled=${disabled}`);

      if (visible && !disabled) {
        await btnNext.click();
        await page.waitForTimeout(500);
        await ss(page, 'D-after-next');
        console.log('Clicked next button');
      }
    }

    // Check question text
    const questionEl = page.locator('#question-text, .question-text, [id*="question"]');
    const questionCount = await questionEl.count();
    console.log(`Question text elements: ${questionCount}`);
    for (let i = 0; i < Math.min(questionCount, 3); i++) {
      const text = await questionEl.nth(i).textContent();
      const visible = await questionEl.nth(i).isVisible();
      console.log(`  Question [${i}]: visible=${visible}, text="${text?.trim().substring(0, 100)}"`);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // E. SETTINGS — check all sections visible
  // ─────────────────────────────────────────────────────────────────────────
  test('E. Settings view - complete structure', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto(BASE_URL + '#/settings', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    await ss(page, 'E-settings');

    const settingsView = page.locator('#settings');
    const settingsHTML = await settingsView.innerHTML();
    console.log(`Settings HTML length: ${settingsHTML.length}`);

    const isActive = await settingsView.evaluate((el: HTMLElement) => el.classList.contains('view--active'));
    console.log(`Settings view is active: ${isActive}`);

    // Dump all visible text in settings
    const settingsText = await settingsView.evaluate((el: HTMLElement) => {
      function getText(node: Element): string {
        if (['SCRIPT', 'STYLE'].includes(node.tagName)) return '';
        if ((node as HTMLElement).offsetParent === null) return '';
        const children = Array.from(node.children).map(getText).join(' ');
        const own = Array.from(node.childNodes)
          .filter(n => n.nodeType === 3)
          .map(n => n.textContent?.trim())
          .filter(Boolean)
          .join(' ');
        return (own + ' ' + children).replace(/\s+/g, ' ').trim();
      }
      return getText(el).substring(0, 3000);
    });
    console.log('Settings visible text:\n', settingsText);

    // Theme toggle specific
    const themeSection = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('*')).filter(el => {
        const text = el.textContent?.toLowerCase() || '';
        const cls = el.className?.toLowerCase() || '';
        return (text.includes('tema') || text.includes('dark') || text.includes('theme') || cls.includes('theme') || cls.includes('dark'))
          && el.children.length < 5;
      });
      return els.slice(0, 10).map(el => ({
        tag: el.tagName,
        id: el.id,
        class: el.className,
        text: el.textContent?.trim().substring(0, 80),
        visible: (el as HTMLElement).offsetParent !== null,
      }));
    });
    console.log('Theme-related elements:', JSON.stringify(themeSection, null, 2));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // F. EXAM VIEW — what it actually shows
  // ─────────────────────────────────────────────────────────────────────────
  test('F. Exam view - detailed structure', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto(BASE_URL + '#/exam', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    await ss(page, 'F-exam');

    const examView = page.locator('#exam');
    const isActive = await examView.evaluate((el: HTMLElement) => el.classList.contains('view--active'));
    console.log(`Exam view is active: ${isActive}`);

    const examText = await examView.evaluate((el: HTMLElement) => {
      function getText(node: Element): string {
        if (['SCRIPT', 'STYLE'].includes(node.tagName)) return '';
        if ((node as HTMLElement).offsetParent === null) return '';
        return Array.from(node.childNodes)
          .map(n => n.nodeType === 3 ? n.textContent?.trim() : getText(n as Element))
          .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
      }
      return getText(el).substring(0, 2000);
    });
    console.log('Exam visible text:', examText);

    // Check for start button by examining all elements
    const allBtns = await page.evaluate(() => {
      const examEl = document.getElementById('exam');
      if (!examEl) return [];
      return Array.from(examEl.querySelectorAll('button')).map(btn => ({
        text: btn.textContent?.trim().substring(0, 80),
        id: btn.id,
        class: btn.className,
        visible: btn.offsetParent !== null,
        disabled: btn.disabled,
      }));
    });
    console.log('Exam buttons:', JSON.stringify(allBtns, null, 2));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // G. ANALYTICS VIEW — check which view is shown
  // ─────────────────────────────────────────────────────────────────────────
  test('G. Analytics view - detailed content', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto(BASE_URL + '#/analytics', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    await ss(page, 'G-analytics');

    const analyticsView = page.locator('#analytics');
    const isActive = await analyticsView.evaluate((el: HTMLElement) => el.classList.contains('view--active'));
    console.log(`Analytics view is active: ${isActive}`);

    // Full text dump
    const analyticsText = await analyticsView.evaluate((el: HTMLElement) => {
      function getText(node: Element): string {
        if (['SCRIPT', 'STYLE'].includes(node.tagName)) return '';
        if ((node as HTMLElement).offsetParent === null) return '';
        return Array.from(node.childNodes)
          .map(n => n.nodeType === 3 ? n.textContent?.trim() : getText(n as Element))
          .filter(t => t && (t as string).trim())
          .join(' | ')
          .replace(/\s+/g, ' ').trim();
      }
      return getText(el).substring(0, 3000);
    });
    console.log('Analytics visible text:', analyticsText);

    const svgs = await analyticsView.locator('svg').count();
    const canvases = await analyticsView.locator('canvas').count();
    console.log(`SVGs: ${svgs}, Canvases: ${canvases}`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // H. REVIEW VIEW — complete structure
  // ─────────────────────────────────────────────────────────────────────────
  test('H. Review view - detailed content', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto(BASE_URL + '#/review', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    await ss(page, 'H-review');

    const reviewView = page.locator('#review');
    const isActive = await reviewView.evaluate((el: HTMLElement) => el.classList.contains('view--active'));
    console.log(`Review view is active: ${isActive}`);

    const reviewText = await reviewView.evaluate((el: HTMLElement) => {
      function getText(node: Element): string {
        if (['SCRIPT', 'STYLE'].includes(node.tagName)) return '';
        if ((node as HTMLElement).offsetParent === null) return '';
        return Array.from(node.childNodes)
          .map(n => n.nodeType === 3 ? n.textContent?.trim() : getText(n as Element))
          .filter(t => t && (t as string).trim())
          .join(' | ')
          .replace(/\s+/g, ' ').trim();
      }
      return getText(el).substring(0, 2000);
    });
    console.log('Review visible text:', reviewText);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // I. MOBILE STUDY — tab switching
  // ─────────────────────────────────────────────────────────────────────────
  test('I. Mobile study - tab switching between text and question', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(BASE_URL + '#/study', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    await ss(page, 'I-mobile-study-text-tab');

    // Find the tab buttons
    const tabs = page.locator('.tab-btn, [class*="tab"]');
    const tabCount = await tabs.count();
    console.log(`Tab elements: ${tabCount}`);

    for (let i = 0; i < Math.min(tabCount, 5); i++) {
      const tab = tabs.nth(i);
      const text = await tab.textContent();
      const visible = await tab.isVisible();
      const active = await tab.evaluate((el: HTMLElement) => el.classList.contains('active') || el.classList.contains('tab-btn--active'));
      console.log(`  Tab [${i}]: "${text?.trim()}" visible=${visible} active=${active}`);
    }

    // Click "Questão" tab
    const questionTab = page.locator('.tab-btn, [class*="tab"]').filter({ hasText: /questão|question/i });
    const questionTabCount = await questionTab.count();
    if (questionTabCount > 0) {
      await questionTab.first().click();
      await page.waitForTimeout(400);
      await ss(page, 'I-mobile-study-question-tab');
      console.log('Clicked question tab');

      // Check if question is visible
      const studyContent = page.locator('.study-content, #study-content, [class*="study-content"]');
      const studyClass = await studyContent.first().evaluate((el: HTMLElement) => el.className).catch(() => 'not found');
      console.log(`study-content class after tab switch: "${studyClass}"`);
    }

    // Check overflow on mobile
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (overflow.scrollWidth > overflow.clientWidth) {
      console.warn(`MOBILE OVERFLOW: scrollWidth=${overflow.scrollWidth} > clientWidth=${overflow.clientWidth}`);
    } else {
      console.log('No horizontal overflow on mobile study');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // J. CONSOLE ERRORS — full page load audit
  // ─────────────────────────────────────────────────────────────────────────
  test('J. Console error audit across all views', async ({ page }) => {
    const errors: { route: string; message: string; type: string }[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push({ route: page.url(), message: msg.text(), type: 'console.error' });
      }
    });
    page.on('pageerror', err => {
      errors.push({ route: page.url(), message: err.message, type: 'pageerror' });
    });

    const urls = [
      BASE_URL,
      BASE_URL + '#/study',
      BASE_URL + '#/exam',
      BASE_URL + '#/review',
      BASE_URL + '#/analytics',
      BASE_URL + '#/settings',
    ];

    for (const url of urls) {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
    }

    if (errors.length === 0) {
      console.log('NO CONSOLE ERRORS — clean across all routes');
    } else {
      console.error(`FOUND ${errors.length} CONSOLE ERROR(S):`);
      errors.forEach((e, i) => {
        console.error(`  [${i}] [${e.type}] @ ${e.route}\n      ${e.message}`);
      });
    }
  });
});
