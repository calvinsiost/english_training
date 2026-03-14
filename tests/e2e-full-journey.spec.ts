import { test, expect, Page, ConsoleMessage } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const BASE_URL = 'https://calvinsiost.github.io/english_training/';
const SCREENSHOTS_DIR = '/c/Users/calvi/Github/english_training/test-screenshots';
const DESKTOP_VIEWPORT = { width: 1200, height: 800 };
const MOBILE_VIEWPORT = { width: 375, height: 812 };

// Ensure screenshots directory exists
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

async function ss(page: Page, name: string) {
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, `${name}.png`),
    fullPage: false,
  });
}

async function navigateTo(page: Page, hash: string) {
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await page.waitForTimeout(800);
}

type ConsoleEntry = { type: string; text: string };

test.describe('English Training App - Full User Journey', () => {
  let consoleErrors: ConsoleEntry[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') {
        consoleErrors.push({ type: msg.type(), text: msg.text() });
      }
    });
    page.on('pageerror', (err: Error) => {
      consoleErrors.push({ type: 'pageerror', text: err.message });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 1. INITIAL LOAD & DASHBOARD
  // ─────────────────────────────────────────────────────────────────────────
  test('1. Dashboard loads correctly', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    const t0 = Date.now();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    const loadTime = Date.now() - t0;
    console.log(`Initial load time: ${loadTime}ms`);

    await ss(page, '01-initial-load');

    // Check page title
    const title = await page.title();
    console.log(`Page title: "${title}"`);
    expect(title).toBeTruthy();

    // Check URL / hash routing
    const url = page.url();
    console.log(`URL after load: ${url}`);

    // Dashboard should show something meaningful
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(50);

    // Look for common dashboard elements
    const headings = page.locator('h1, h2, h3');
    const headingCount = await headings.count();
    console.log(`Headings found: ${headingCount}`);

    await ss(page, '01-dashboard-content');

    if (consoleErrors.length > 0) {
      console.warn('CONSOLE ERRORS on dashboard:', JSON.stringify(consoleErrors, null, 2));
    }

    // Load time warning
    if (loadTime > 3000) {
      console.warn(`SLOW LOAD: ${loadTime}ms (> 3s)`);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. NAVIGATION — all routes
  // ─────────────────────────────────────────────────────────────────────────
  test('2. Navigation to all routes works', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
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
      await navigateTo(page, route.hash);
      const currentHash = await page.evaluate(() => window.location.hash);
      console.log(`Navigated to ${route.hash} → current hash: ${currentHash}`);

      // Page should not be blank
      const bodyText = await page.locator('body').textContent();
      const bodyLen = bodyText?.trim().length ?? 0;
      if (bodyLen < 20) {
        console.warn(`BLANK/NEAR-BLANK page at ${route.hash} (${bodyLen} chars)`);
      }

      await ss(page, `02-route-${route.label}`);
      await page.waitForTimeout(300);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. NAV ELEMENTS — clicking nav links
  // ─────────────────────────────────────────────────────────────────────────
  test('3. Nav bar links work', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Common nav patterns
    const navSelectors = [
      'nav a',
      '[role="navigation"] a',
      '.nav-link',
      '.nav-item',
      'header a',
      '[data-route]',
      '[href*="#"]',
    ];

    let navLinks: any = null;
    for (const sel of navSelectors) {
      const count = await page.locator(sel).count();
      if (count > 0) {
        console.log(`Nav selector "${sel}" found ${count} elements`);
        navLinks = page.locator(sel);
        break;
      }
    }

    if (!navLinks) {
      console.warn('NO NAV LINKS FOUND — navigation may be broken or unconventional');
    } else {
      const count = await navLinks.count();
      for (let i = 0; i < count; i++) {
        const el = navLinks.nth(i);
        const text = await el.textContent();
        const href = await el.getAttribute('href');
        console.log(`Nav item [${i}]: text="${text?.trim()}" href="${href}"`);
      }
    }

    await ss(page, '03-nav-elements');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. STUDY VIEW — two-column layout at 1200px+
  // ─────────────────────────────────────────────────────────────────────────
  test('4. Study view - two-column desktop layout', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await navigateTo(page, '#/study');

    await ss(page, '04-study-desktop');

    // Check for two-column layout indicators
    const studyContent = await page.locator('body').innerHTML();

    // Look for passage/reading area
    const passageSelectors = [
      '.passage',
      '.reading',
      '.text-content',
      '[class*="passage"]',
      '[class*="reading"]',
      '[class*="text"]',
      'article',
    ];
    for (const sel of passageSelectors) {
      const count = await page.locator(sel).count();
      if (count > 0) {
        console.log(`Passage element found: "${sel}" (${count} elements)`);
        const box = await page.locator(sel).first().boundingBox();
        if (box) {
          console.log(`  Passage box: x=${box.x.toFixed(0)}, y=${box.y.toFixed(0)}, w=${box.width.toFixed(0)}, h=${box.height.toFixed(0)}`);
          // On 1200px desktop, passage should NOT be full width (two-column)
          if (box.width > 1000) {
            console.warn(`LAYOUT ISSUE: Passage element is near full width (${box.width.toFixed(0)}px) — expected narrower in two-column layout`);
          }
        }
        break;
      }
    }

    // Look for questions area
    const questionSelectors = [
      '.questions',
      '.question-panel',
      '[class*="question"]',
      '.quiz',
      '.exercise',
    ];
    for (const sel of questionSelectors) {
      const count = await page.locator(sel).count();
      if (count > 0) {
        console.log(`Questions element found: "${sel}" (${count} elements)`);
        const box = await page.locator(sel).first().boundingBox();
        if (box) {
          console.log(`  Questions box: x=${box.x.toFixed(0)}, y=${box.y.toFixed(0)}, w=${box.width.toFixed(0)}, h=${box.height.toFixed(0)}`);
        }
        break;
      }
    }

    // Check content rendered
    const textContent = await page.locator('body').textContent();
    console.log(`Study page content length: ${textContent?.length ?? 0} chars`);

    // Look for actual question content
    const options = await page.locator('input[type="radio"], .option, .answer-choice, [class*="option"]').count();
    console.log(`Answer options/radio buttons found: ${options}`);

    // Introspect columns using CSS grid/flex info
    const columnInfo = await page.evaluate(() => {
      const els = document.querySelectorAll('*');
      const cols: any[] = [];
      els.forEach((el: Element) => {
        const style = window.getComputedStyle(el);
        const display = style.display;
        if (display === 'grid' || display === 'flex') {
          const rect = (el as HTMLElement).getBoundingClientRect();
          if (rect.width > 500 && rect.height > 100) {
            cols.push({
              tag: el.tagName,
              class: el.className,
              display,
              gridCols: style.gridTemplateColumns,
              flexDir: style.flexDirection,
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              childCount: el.children.length,
            });
          }
        }
      });
      return cols.slice(0, 10);
    });

    console.log('Significant layout containers:');
    columnInfo.forEach((c) => {
      console.log(`  <${c.tag} class="${c.class}"> display=${c.display} gridCols="${c.gridCols}" flex="${c.flexDir}" ${c.width}x${c.height} children=${c.childCount}`);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 5. STUDY VIEW — interactions
  // ─────────────────────────────────────────────────────────────────────────
  test('5. Study view - answer interactions', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await navigateTo(page, '#/study');
    await page.waitForTimeout(1000);

    await ss(page, '05-study-before-interaction');

    // Try clicking a radio or option
    const radioButtons = page.locator('input[type="radio"]');
    const radioCount = await radioButtons.count();
    console.log(`Radio buttons found: ${radioCount}`);

    if (radioCount > 0) {
      await radioButtons.first().click();
      await page.waitForTimeout(400);
      await ss(page, '05-study-after-radio-click');
      console.log('Clicked first radio button');
    }

    // Try .option or button-style choices
    const optionBtns = page.locator('.option, .answer-option, [class*="option"]:not(input), .choice');
    const optCount = await optionBtns.count();
    console.log(`Option buttons found: ${optCount}`);
    if (optCount > 0) {
      await optionBtns.first().click();
      await page.waitForTimeout(400);
      await ss(page, '05-study-after-option-click');
    }

    // Look for submit/check/next buttons
    const actionBtns = page.locator('button, [role="button"]');
    const btnCount = await actionBtns.count();
    console.log(`Buttons on study page: ${btnCount}`);
    for (let i = 0; i < Math.min(btnCount, 10); i++) {
      const btn = actionBtns.nth(i);
      const text = await btn.textContent();
      const visible = await btn.isVisible();
      console.log(`  Button [${i}]: "${text?.trim()}" visible=${visible}`);
    }

    // Try clicking "Check" or "Submit" or "Next"
    const checkBtn = page.locator('button').filter({ hasText: /check|submit|next|confirm|answer|ver|próximo|confirmar/i });
    const checkCount = await checkBtn.count();
    if (checkCount > 0) {
      await checkBtn.first().click();
      await page.waitForTimeout(500);
      await ss(page, '05-study-after-check');
      console.log('Clicked check/submit/next button');
    }

    if (consoleErrors.length > 0) {
      console.warn('CONSOLE ERRORS in study interactions:', JSON.stringify(consoleErrors));
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 6. EXAM VIEW
  // ─────────────────────────────────────────────────────────────────────────
  test('6. Exam view - start and answer questions', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await navigateTo(page, '#/exam');
    await page.waitForTimeout(1000);

    await ss(page, '06-exam-initial');

    const bodyText = await page.locator('body').textContent();
    console.log(`Exam page content length: ${bodyText?.length ?? 0}`);

    // Look for start button
    const startBtn = page.locator('button').filter({ hasText: /start|begin|iniciar|começar|novo|new exam/i });
    const startCount = await startBtn.count();
    console.log(`Start exam buttons: ${startCount}`);

    if (startCount > 0) {
      const btnText = await startBtn.first().textContent();
      console.log(`Clicking start button: "${btnText?.trim()}"`);
      await startBtn.first().click();
      await page.waitForTimeout(1000);
      await ss(page, '06-exam-after-start');
    }

    // Look for exam configuration (number of questions, topic select, etc.)
    const selects = page.locator('select');
    const selectCount = await selects.count();
    console.log(`Select dropdowns: ${selectCount}`);
    for (let i = 0; i < selectCount; i++) {
      const sel = selects.nth(i);
      const label = await sel.getAttribute('aria-label') || await sel.getAttribute('name') || await sel.getAttribute('id') || 'unnamed';
      console.log(`  Select [${i}]: "${label}"`);
    }

    // Answer first question if visible
    const radios = page.locator('input[type="radio"]');
    const radioCount = await radios.count();
    if (radioCount > 0) {
      await radios.first().click();
      await page.waitForTimeout(300);
      await ss(page, '06-exam-answered');
      console.log(`Clicked first radio in exam (${radioCount} total)`);
    }

    // Check for timer/progress
    const timerEl = page.locator('[class*="timer"], [class*="time"], [class*="progress"], [class*="counter"]');
    const timerCount = await timerEl.count();
    console.log(`Timer/progress elements: ${timerCount}`);

    if (consoleErrors.length > 0) {
      console.warn('CONSOLE ERRORS in exam:', JSON.stringify(consoleErrors));
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 7. SETTINGS VIEW
  // ─────────────────────────────────────────────────────────────────────────
  test('7. Settings - AI provider and theme toggle', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await navigateTo(page, '#/settings');
    await page.waitForTimeout(1000);

    await ss(page, '07-settings-initial');

    const bodyText = await page.locator('body').textContent();
    console.log(`Settings page content: ${bodyText?.length ?? 0} chars`);

    // Theme toggle
    const themeToggle = page.locator(
      'button, input[type="checkbox"], [role="switch"]'
    ).filter({ hasText: /theme|dark|light|modo|tema/i });
    const themeCount = await themeToggle.count();
    console.log(`Theme toggle elements: ${themeCount}`);

    const themeCheckbox = page.locator('input[type="checkbox"]').filter({});
    const checkboxCount = await themeCheckbox.count();
    console.log(`Checkboxes on settings: ${checkboxCount}`);

    // Try clicking theme-related checkboxes or buttons
    if (themeCount > 0) {
      await themeToggle.first().click();
      await page.waitForTimeout(500);
      await ss(page, '07-settings-after-theme-toggle');
      console.log('Clicked theme toggle');
    }

    // AI provider settings
    const aiSelectors = [
      '[class*="ai"]',
      '[class*="provider"]',
      '[class*="model"]',
      'input[type="text"]',
      'input[type="password"]',
      'select',
    ];

    for (const sel of aiSelectors) {
      const count = await page.locator(sel).count();
      if (count > 0) {
        console.log(`AI/provider selector "${sel}": ${count} elements`);
        if (sel === 'select') {
          for (let i = 0; i < Math.min(count, 5); i++) {
            const s = page.locator(sel).nth(i);
            const id = await s.getAttribute('id') || await s.getAttribute('name') || 'unnamed';
            const options = await s.locator('option').count();
            console.log(`  Select [${i}] id="${id}" options=${options}`);
          }
        }
        if (sel === 'input[type="text"]' || sel === 'input[type="password"]') {
          for (let i = 0; i < Math.min(count, 5); i++) {
            const inp = page.locator(sel).nth(i);
            const placeholder = await inp.getAttribute('placeholder') || '';
            const id = await inp.getAttribute('id') || '';
            console.log(`  Input [${i}] id="${id}" placeholder="${placeholder}"`);
          }
        }
      }
    }

    // Try filling an API key field
    const apiKeyInput = page.locator('input[type="text"], input[type="password"]').filter({});
    const apiKeyCount = await apiKeyInput.count();
    if (apiKeyCount > 0) {
      // Just check it's editable
      const firstInput = apiKeyInput.first();
      const isEditable = await firstInput.isEditable();
      console.log(`First text input editable: ${isEditable}`);
    }

    // All buttons in settings
    const allBtns = page.locator('button');
    const btnCount = await allBtns.count();
    console.log(`Buttons in settings: ${btnCount}`);
    for (let i = 0; i < Math.min(btnCount, 10); i++) {
      const text = await allBtns.nth(i).textContent();
      const visible = await allBtns.nth(i).isVisible();
      console.log(`  Button [${i}]: "${text?.trim()}" visible=${visible}`);
    }

    await ss(page, '07-settings-final');

    if (consoleErrors.length > 0) {
      console.warn('CONSOLE ERRORS in settings:', JSON.stringify(consoleErrors));
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 8. ANALYTICS VIEW
  // ─────────────────────────────────────────────────────────────────────────
  test('8. Analytics - charts and stats render', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await navigateTo(page, '#/analytics');
    await page.waitForTimeout(1500); // wait for chart rendering

    await ss(page, '08-analytics');

    const bodyText = await page.locator('body').textContent();
    console.log(`Analytics content: ${bodyText?.length ?? 0} chars`);

    // Check for canvas elements (charts)
    const canvases = await page.locator('canvas').count();
    console.log(`Canvas elements (charts): ${canvases}`);

    // Check for SVG charts
    const svgs = await page.locator('svg').count();
    console.log(`SVG elements (charts): ${svgs}`);

    // Check for stat numbers
    const statEls = page.locator('[class*="stat"], [class*="metric"], [class*="score"], [class*="count"]');
    const statCount = await statEls.count();
    console.log(`Stat elements: ${statCount}`);

    // Check for empty state
    const emptyState = page.locator('[class*="empty"], [class*="no-data"], [class*="placeholder"]');
    const emptyCount = await emptyState.count();
    if (emptyCount > 0) {
      console.log('Empty state shown in analytics (expected for new user)');
      const emptyText = await emptyState.first().textContent();
      console.log(`  Empty state text: "${emptyText?.trim()}"`);
    }

    // Look for any numbers displayed
    const numbers = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const texts: string[] = [];
      let node;
      while ((node = walker.nextNode())) {
        const t = node.textContent?.trim();
        if (t && /\d/.test(t) && t.length < 50) texts.push(t);
      }
      return texts.slice(0, 20);
    });
    console.log('Numbers/stats on analytics page:', numbers);

    if (consoleErrors.length > 0) {
      console.warn('CONSOLE ERRORS in analytics:', JSON.stringify(consoleErrors));
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 9. REVIEW VIEW
  // ─────────────────────────────────────────────────────────────────────────
  test('9. Review view functionality', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await navigateTo(page, '#/review');
    await page.waitForTimeout(1000);

    await ss(page, '09-review-initial');

    const bodyText = await page.locator('body').textContent();
    console.log(`Review content: ${bodyText?.length ?? 0} chars`);

    // Check for review cards, questions, flashcards
    const reviewSelectors = [
      '.review-card',
      '.flashcard',
      '[class*="review"]',
      '[class*="card"]',
      '.question',
    ];

    for (const sel of reviewSelectors) {
      const count = await page.locator(sel).count();
      if (count > 0) {
        console.log(`Review element "${sel}": ${count} found`);
        break;
      }
    }

    // Buttons in review
    const btns = page.locator('button');
    const btnCount = await btns.count();
    console.log(`Buttons in review: ${btnCount}`);
    for (let i = 0; i < Math.min(btnCount, 8); i++) {
      const text = await btns.nth(i).textContent();
      const visible = await btns.nth(i).isVisible();
      console.log(`  Button [${i}]: "${text?.trim()}" visible=${visible}`);
    }

    // Check for empty state
    const emptySelectors = ['[class*="empty"]', '[class*="no-data"]'];
    for (const sel of emptySelectors) {
      const count = await page.locator(sel).count();
      if (count > 0) {
        const text = await page.locator(sel).first().textContent();
        console.log(`Empty state in review: "${text?.trim()}"`);
      }
    }

    if (consoleErrors.length > 0) {
      console.warn('CONSOLE ERRORS in review:', JSON.stringify(consoleErrors));
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 10. MOBILE RESPONSIVENESS
  // ─────────────────────────────────────────────────────────────────────────
  test('10. Mobile responsiveness (375px)', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    await ss(page, '10-mobile-dashboard');

    // Check for horizontal scroll (a common mobile issue)
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    if (hasHorizontalScroll) {
      console.warn(`MOBILE ISSUE: Horizontal overflow detected (scrollWidth=${document.documentElement?.scrollWidth ?? '?'}, clientWidth=${MOBILE_VIEWPORT.width})`);
      // Get exact values
      const scrollInfo = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }));
      console.warn('Scroll info:', scrollInfo);
    } else {
      console.log('No horizontal overflow on mobile dashboard');
    }

    // Navigate to study on mobile
    await navigateTo(page, '#/study');
    await page.waitForTimeout(600);
    await ss(page, '10-mobile-study');

    const studyScrollInfo = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (studyScrollInfo.scrollWidth > studyScrollInfo.clientWidth) {
      console.warn(`MOBILE STUDY OVERFLOW: scrollWidth=${studyScrollInfo.scrollWidth}, clientWidth=${studyScrollInfo.clientWidth}`);
    }

    // Check hamburger/mobile nav
    const mobileNav = page.locator('[class*="hamburger"], [class*="mobile-menu"], [class*="menu-toggle"], button[aria-label*="menu"]');
    const mobileNavCount = await mobileNav.count();
    console.log(`Mobile nav toggle elements: ${mobileNavCount}`);

    if (mobileNavCount > 0) {
      await mobileNav.first().click();
      await page.waitForTimeout(400);
      await ss(page, '10-mobile-nav-open');
    }

    // Navigate each route on mobile
    const mobileRoutes = [
      { hash: '#/exam', label: 'exam' },
      { hash: '#/settings', label: 'settings' },
      { hash: '#/analytics', label: 'analytics' },
    ];

    for (const route of mobileRoutes) {
      await navigateTo(page, route.hash);
      await page.waitForTimeout(500);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      if (overflow.scrollWidth > overflow.clientWidth) {
        console.warn(`MOBILE OVERFLOW at ${route.hash}: scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth}`);
      }

      await ss(page, `10-mobile-${route.label}`);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 11. ACCESSIBILITY BASICS
  // ─────────────────────────────────────────────────────────────────────────
  test('11. Accessibility basics', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Images without alt
    const imgsNoAlt = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs
        .filter(img => !img.getAttribute('alt'))
        .map(img => img.src);
    });
    if (imgsNoAlt.length > 0) {
      console.warn(`ACCESSIBILITY: ${imgsNoAlt.length} image(s) missing alt text:`, imgsNoAlt);
    } else {
      console.log('All images have alt text (or no images found)');
    }

    // Buttons without accessible text
    const btnsNoText = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns
        .filter(btn => !btn.textContent?.trim() && !btn.getAttribute('aria-label') && !btn.getAttribute('title'))
        .map(btn => btn.outerHTML.substring(0, 100));
    });
    if (btnsNoText.length > 0) {
      console.warn(`ACCESSIBILITY: ${btnsNoText.length} button(s) without accessible text:`, btnsNoText);
    }

    // Form inputs without labels
    const inputsNoLabel = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
      return inputs
        .filter(inp => {
          const id = inp.id;
          const hasLabel = id && document.querySelector(`label[for="${id}"]`);
          const hasAriaLabel = inp.getAttribute('aria-label') || inp.getAttribute('aria-labelledby');
          return !hasLabel && !hasAriaLabel;
        })
        .map(inp => `<${inp.tagName} id="${inp.id}" type="${(inp as HTMLInputElement).type}" placeholder="${(inp as HTMLInputElement).placeholder}">`);
    });
    if (inputsNoLabel.length > 0) {
      console.warn(`ACCESSIBILITY: ${inputsNoLabel.length} input(s) without labels:`, inputsNoLabel);
    }

    // Focus management - tab through elements
    await page.keyboard.press('Tab');
    const focusedEl = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? `${el.tagName}#${el.id}.${el.className}` : 'none';
    });
    console.log(`First Tab focus: ${focusedEl}`);

    // Check color contrast by checking CSS custom properties
    const cssVars = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        colorBg: style.getPropertyValue('--color-background').trim() || style.getPropertyValue('--bg').trim(),
        colorText: style.getPropertyValue('--color-text').trim() || style.getPropertyValue('--text').trim(),
        colorPrimary: style.getPropertyValue('--color-primary').trim() || style.getPropertyValue('--primary').trim(),
      };
    });
    console.log('CSS color variables:', cssVars);

    await ss(page, '11-accessibility-check');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 12. CONSOLE ERRORS SUMMARY (cross all views)
  // ─────────────────────────────────────────────────────────────────────────
  test('12. Full cross-route console error audit', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    const allErrors: { route: string; error: ConsoleEntry }[] = [];

    page.on('console', (msg: ConsoleMessage) => {
      if (msg.type() === 'error') {
        allErrors.push({ route: 'current', error: { type: msg.type(), text: msg.text() } });
      }
    });
    page.on('pageerror', (err: Error) => {
      allErrors.push({ route: 'current', error: { type: 'pageerror', text: err.message } });
    });

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    const routes = ['#/', '#/study', '#/exam', '#/review', '#/analytics', '#/settings'];
    for (const hash of routes) {
      await navigateTo(page, hash);
      await page.waitForTimeout(1200);
    }

    if (allErrors.length === 0) {
      console.log('No console errors across all routes');
    } else {
      console.warn(`TOTAL CONSOLE ERRORS: ${allErrors.length}`);
      allErrors.forEach((e, i) => console.warn(`  [${i}] ${e.error.type}: ${e.error.text}`));
    }

    await ss(page, '12-final-state');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 13. DEEP STUDY INTERACTION — passage + questions flow
  // ─────────────────────────────────────────────────────────────────────────
  test('13. Study view - deep content inspection', async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await navigateTo(page, '#/study');
    await page.waitForTimeout(1500);

    // Dump the visible text to understand structure
    const visibleText = await page.evaluate(() => {
      function getVisibleText(el: Element): string {
        if ((el as HTMLElement).offsetParent === null) return '';
        if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) return '';
        return Array.from(el.childNodes)
          .map(n => n.nodeType === 3 ? n.textContent?.trim() || '' : getVisibleText(n as Element))
          .join(' ')
          .replace(/\s+/g, ' ');
      }
      return getVisibleText(document.body).substring(0, 2000);
    });
    console.log('Study page visible text (first 2000 chars):\n', visibleText);

    // Check if passage text exists and is readable
    const passageLength = visibleText.length;
    if (passageLength < 100) {
      console.warn('STUDY VIEW ISSUE: Very little text on study page — may not be loading content');
    }

    // Get all interactive elements
    const interactives = await page.evaluate(() => {
      const els = document.querySelectorAll('button, input, select, a, [tabindex], [onclick], [class*="btn"], [role="button"]');
      return Array.from(els).map(el => ({
        tag: el.tagName,
        text: el.textContent?.trim().substring(0, 50),
        class: el.className,
        type: (el as HTMLInputElement).type || '',
        visible: (el as HTMLElement).offsetParent !== null,
      })).filter(e => e.visible).slice(0, 30);
    });

    console.log('Interactive elements on study page:');
    interactives.forEach((el, i) => {
      console.log(`  [${i}] <${el.tag} class="${el.class}" type="${el.type}"> "${el.text}"`);
    });

    await ss(page, '13-study-deep');

    // Try to navigate to next question if possible
    const nextBtn = page.locator('button').filter({ hasText: /next|próxim|advance|→|>/i });
    const nextCount = await nextBtn.count();
    if (nextCount > 0) {
      await nextBtn.first().click();
      await page.waitForTimeout(500);
      await ss(page, '13-study-next-question');
      console.log('Clicked next question button');
    }

    // Check previous question
    const prevBtn = page.locator('button').filter({ hasText: /prev|anterior|←|</i });
    if (await prevBtn.count() > 0) {
      await prevBtn.first().click();
      await page.waitForTimeout(400);
      console.log('Clicked previous button');
    }
  });
});
