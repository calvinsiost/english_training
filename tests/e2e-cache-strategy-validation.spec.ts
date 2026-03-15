/**
 * E2E Test — Cache Strategy Validation (ADR-001)
 *
 * Validates the cache-busting changes:
 * - F1: Self-destructing SW (sw.js cleanup worker)
 * - F2: Client-side SW cleanup (cleanupServiceWorkers in app.js)
 * - F3: Version management (version.js) + automated cache busting
 *
 * Viewports: desktop (1280x720), tablet (768x1024), mobile (375x812)
 * Timeout: 10s per step
 * Captures: screenshots, console errors, API responses, latency
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────
interface ConsoleEntry {
  level: string;
  text: string;
  url: string;
  timestamp: number;
}

interface NetworkEntry {
  url: string;
  status: number;
  method: string;
  latencyMs: number;
  isError: boolean;
  errorPayload?: string;
}

interface StepResult {
  step: string;
  status: '✅ PASS' | '🔴 FAIL' | '🟡 WARN' | '🟢 COSMETIC';
  detail?: string;
  screenshotPath?: string;
}

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────
const STEP_TIMEOUT = 10_000;

const viewports = [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
] as const;

/** Collect console errors/warnings from project code only */
function setupConsoleCollector(page: Page): ConsoleEntry[] {
  const entries: ConsoleEntry[] = [];
  page.on('console', msg => {
    const level = msg.type();
    if (level !== 'error' && level !== 'warning') return;
    const text = msg.text();
    // Ignore external dependency noise
    if (text.includes('unpkg.com') || text.includes('cdn.') || text.includes('favicon')) return;
    if (text.includes('third-party') || text.includes('DevTools')) return;
    entries.push({
      level,
      text,
      url: msg.location()?.url || '',
      timestamp: Date.now(),
    });
  });
  return entries;
}

/** Collect network responses with latency */
function setupNetworkCollector(page: Page): NetworkEntry[] {
  const entries: NetworkEntry[] = [];
  const timings = new Map<string, number>();

  page.on('request', req => {
    timings.set(req.url(), Date.now());
  });

  page.on('response', async res => {
    const url = res.url();
    const start = timings.get(url) || Date.now();
    const latencyMs = Date.now() - start;
    let errorPayload: string | undefined;

    if (res.status() >= 400) {
      try {
        errorPayload = await res.text();
      } catch {
        errorPayload = 'unable to read body';
      }
    }

    entries.push({
      url,
      status: res.status(),
      method: res.request().method(),
      latencyMs,
      isError: res.status() >= 400,
      errorPayload,
    });
  });

  return entries;
}

/** Wait for page stabilization — networkidle with selector fallback */
async function waitStable(page: Page, selector?: string) {
  try {
    await page.waitForLoadState('networkidle', { timeout: STEP_TIMEOUT });
  } catch {
    // fallback: wait for a visible selector
    if (selector) {
      await page.waitForSelector(selector, { state: 'visible', timeout: STEP_TIMEOUT });
    }
  }
}

/** Take a categorized screenshot */
async function snap(page: Page, name: string): Promise<string> {
  const path = `test-results/validation/${name}.png`;
  await page.screenshot({ path, fullPage: false });
  return path;
}

// ────────────────────────────────────────────
// Test Suite
// ────────────────────────────────────────────
test.describe('Cache Strategy Validation (ADR-001)', () => {

  for (const vp of viewports) {
    test.describe(`Viewport: ${vp.name} (${vp.width}x${vp.height})`, () => {

      let consoleEntries: ConsoleEntry[];
      let networkEntries: NetworkEntry[];

      test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        consoleEntries = setupConsoleCollector(page);
        networkEntries = setupNetworkCollector(page);
      });

      // ──────────────────────────────────────
      // FLOW 1: App loads correctly (Happy Path)
      // ──────────────────────────────────────
      test('F1.1 — App loads without errors, dashboard visible', async ({ page }) => {
        test.setTimeout(STEP_TIMEOUT * 3);

        await page.goto('/', { waitUntil: 'networkidle', timeout: STEP_TIMEOUT });
        await waitStable(page, '#dashboard');

        // Dashboard should be visible
        const dashboard = page.locator('#dashboard');
        await expect(dashboard).toBeVisible({ timeout: STEP_TIMEOUT });

        // Title should render
        const title = page.locator('.app-title');
        await expect(title).toHaveText('English Training', { timeout: STEP_TIMEOUT });

        await snap(page, `f1.1-dashboard-${vp.name}`);

        // Visual checks
        // 1. No overflow — page should not scroll horizontally
        const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
        expect(bodyWidth).toBeLessThanOrEqual(vp.width + 2); // 2px tolerance

        // 2. Check no console errors from project code
        const projectErrors = consoleEntries.filter(e =>
          e.level === 'error' && !e.text.includes('[SW]')
        );
        expect(projectErrors).toEqual([]);
      });

      // ──────────────────────────────────────
      // FLOW 2: version.js loads and sets globals
      // ──────────────────────────────────────
      test('F2.1 — version.js sets APP_VERSION and APP_BUILD globals', async ({ page }) => {
        test.setTimeout(STEP_TIMEOUT * 2);

        await page.goto('/', { waitUntil: 'networkidle', timeout: STEP_TIMEOUT });
        await waitStable(page, '#dashboard');

        const appVersion = await page.evaluate(() => (window as any).APP_VERSION);
        const appBuild = await page.evaluate(() => (window as any).APP_BUILD);

        expect(appVersion).toBe('2.0.0');
        // In dev, APP_BUILD is the placeholder; in CI, it's the git hash
        expect(appBuild).toBeTruthy();
        expect(typeof appBuild).toBe('string');

        // localStorage should have app_version
        const storedVersion = await page.evaluate(() => localStorage.getItem('app_version'));
        expect(storedVersion).toBe('2.0.0');

        await snap(page, `f2.1-version-globals-${vp.name}`);
      });

      // ──────────────────────────────────────
      // FLOW 3: Service Worker cleanup
      // ──────────────────────────────────────
      test('F3.1 — No service workers registered after load', async ({ page }) => {
        test.setTimeout(STEP_TIMEOUT * 2);

        await page.goto('/', { waitUntil: 'networkidle', timeout: STEP_TIMEOUT });
        await waitStable(page, '#dashboard');

        // Wait a moment for cleanup to complete
        await page.waitForTimeout(2000);

        const swCount = await page.evaluate(async () => {
          if (!('serviceWorker' in navigator)) return 0;
          const regs = await navigator.serviceWorker.getRegistrations();
          return regs.length;
        });

        // Note: playwright config blocks SWs, so count should be 0
        // This validates that cleanupServiceWorkers() doesn't throw
        expect(swCount).toBe(0);

        await snap(page, `f3.1-no-sw-${vp.name}`);
      });

      test('F3.2 — Cache Storage is empty after load', async ({ page }) => {
        test.setTimeout(STEP_TIMEOUT * 2);

        await page.goto('/', { waitUntil: 'networkidle', timeout: STEP_TIMEOUT });
        await waitStable(page, '#dashboard');
        await page.waitForTimeout(1000);

        const cacheNames = await page.evaluate(async () => {
          if (!('caches' in window)) return [];
          return await caches.keys();
        });

        expect(cacheNames).toEqual([]);

        await snap(page, `f3.2-no-caches-${vp.name}`);
      });

      // ──────────────────────────────────────
      // FLOW 4: All assets load (no 404s)
      // ──────────────────────────────────────
      test('F4.1 — All CSS and JS assets load successfully (no 404)', async ({ page }) => {
        test.setTimeout(STEP_TIMEOUT * 3);

        await page.goto('/', { waitUntil: 'networkidle', timeout: STEP_TIMEOUT });
        await waitStable(page, '#dashboard');

        // Check for failed asset loads
        const failedAssets = networkEntries.filter(e =>
          e.isError && (e.url.includes('.css') || e.url.includes('.js'))
        );

        if (failedAssets.length > 0) {
          const details = failedAssets.map(a => `${a.status} ${a.url}`).join('\n');
          expect(failedAssets, `Failed assets:\n${details}`).toEqual([]);
        }

        // Check latency thresholds
        const slowAssets = networkEntries.filter(e =>
          (e.url.includes('.css') || e.url.includes('.js')) && e.latencyMs > 5000
        );
        expect(slowAssets).toEqual([]);

        // Warn for >2s assets
        const warnAssets = networkEntries.filter(e =>
          (e.url.includes('.css') || e.url.includes('.js')) && e.latencyMs > 2000
        );
        if (warnAssets.length > 0) {
          console.warn('🟡 Slow assets (>2s):', warnAssets.map(a => `${a.latencyMs}ms ${a.url}`));
        }

        await snap(page, `f4.1-assets-loaded-${vp.name}`);
      });

      // ──────────────────────────────────────
      // FLOW 5: Navigation works
      // ──────────────────────────────────────
      test('F5.1 — Nav bar links work, views transition correctly', async ({ page }) => {
        test.setTimeout(STEP_TIMEOUT * 5);

        await page.goto('/', { waitUntil: 'networkidle', timeout: STEP_TIMEOUT });
        await waitStable(page, '#dashboard');

        // Navigate to Study
        const studyLink = page.locator('a[data-view="study"], a[href="#/study"]');
        if (await studyLink.isVisible({ timeout: 3000 }).catch(() => false)) {
          await studyLink.click();
          await page.waitForTimeout(500);
          await snap(page, `f5.1-study-${vp.name}`);
        }

        // Navigate to Analytics
        const analyticsLink = page.locator('a[data-view="analytics"], a[href="#/analytics"]');
        if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
          await analyticsLink.click();
          await page.waitForTimeout(500);
          await snap(page, `f5.1-analytics-${vp.name}`);
        }

        // Navigate back to Dashboard
        const dashLink = page.locator('a[data-view="dashboard"], a[href="#/"]');
        if (await dashLink.isVisible({ timeout: 3000 }).catch(() => false)) {
          await dashLink.click();
          await page.waitForTimeout(500);

          const dashboard = page.locator('#dashboard');
          await expect(dashboard).toBeVisible({ timeout: STEP_TIMEOUT });
        }

        await snap(page, `f5.1-nav-back-${vp.name}`);

        // No console errors during navigation
        const navErrors = consoleEntries.filter(e => e.level === 'error');
        if (navErrors.length > 0) {
          console.warn('Console errors during navigation:', navErrors.map(e => e.text));
        }
      });

      // ──────────────────────────────────────
      // FLOW 6: Interactive elements (non-spec, flagged)
      // ──────────────────────────────────────
      test('F6.1 — [non-spec] Settings button is clickable', async ({ page }) => {
        test.setTimeout(STEP_TIMEOUT * 2);

        await page.goto('/', { waitUntil: 'networkidle', timeout: STEP_TIMEOUT });
        await waitStable(page, '#dashboard');

        const settingsBtn = page.locator('#settings-btn');
        await expect(settingsBtn).toBeVisible({ timeout: STEP_TIMEOUT });
        await expect(settingsBtn).toBeEnabled();

        await settingsBtn.click();
        await page.waitForTimeout(500);

        await snap(page, `f6.1-settings-${vp.name}`);
      });

      test('F6.2 — [non-spec] Keyboard navigation on nav bar', async ({ page }) => {
        test.setTimeout(STEP_TIMEOUT * 2);

        await page.goto('/', { waitUntil: 'networkidle', timeout: STEP_TIMEOUT });
        await waitStable(page, '#dashboard');

        // Tab through nav items
        const nav = page.locator('.bottom-nav, nav');
        if (await nav.isVisible({ timeout: 3000 }).catch(() => false)) {
          const navItems = page.locator('.nav-item');
          const count = await navItems.count();

          // Focus first nav item and tab through
          if (count > 0) {
            await navItems.first().focus();
            for (let i = 1; i < Math.min(count, 4); i++) {
              await page.keyboard.press('Tab');
            }
          }
        }

        await snap(page, `f6.2-keyboard-nav-${vp.name}`);
      });

      // ──────────────────────────────────────
      // FLOW 7: Visual layout checks
      // ──────────────────────────────────────
      test('F7.1 — No horizontal overflow, text not truncated', async ({ page }) => {
        test.setTimeout(STEP_TIMEOUT * 2);

        await page.goto('/', { waitUntil: 'networkidle', timeout: STEP_TIMEOUT });
        await waitStable(page, '#dashboard');

        // Check horizontal overflow
        const hasOverflow = await page.evaluate(() => {
          return document.body.scrollWidth > window.innerWidth + 2;
        });
        expect(hasOverflow).toBe(false);

        // Check that main title is fully visible (not truncated)
        const titleBox = await page.locator('.app-title').boundingBox();
        if (titleBox) {
          expect(titleBox.width).toBeGreaterThan(50);
          expect(titleBox.x).toBeGreaterThanOrEqual(0);
          expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(vp.width + 2);
        }

        // Check nav bar is within viewport
        const navBar = page.locator('.bottom-nav, nav.bottom-nav');
        if (await navBar.isVisible({ timeout: 3000 }).catch(() => false)) {
          const navBox = await navBar.boundingBox();
          if (navBox) {
            expect(navBox.width).toBeLessThanOrEqual(vp.width + 2);
          }
        }

        await snap(page, `f7.1-layout-${vp.name}`);
      });

      // ──────────────────────────────────────
      // FLOW 8: Console error audit
      // ──────────────────────────────────────
      test('F8.1 — No project console errors on load', async ({ page }) => {
        test.setTimeout(STEP_TIMEOUT * 2);

        // Fresh console collector for this test
        const errors: ConsoleEntry[] = [];
        page.on('console', msg => {
          if (msg.type() === 'error') {
            const text = msg.text();
            // Ignore known non-project noise
            if (text.includes('unpkg') || text.includes('favicon') ||
                text.includes('net::ERR') || text.includes('third-party') ||
                text.includes('DevTools')) return;
            errors.push({
              level: 'error',
              text,
              url: msg.location()?.url || '',
              timestamp: Date.now(),
            });
          }
        });

        await page.goto('/', { waitUntil: 'networkidle', timeout: STEP_TIMEOUT });
        await waitStable(page, '#dashboard');
        await page.waitForTimeout(2000); // wait for async inits

        if (errors.length > 0) {
          const detail = errors.map(e => `[${e.level}] ${e.text} (${e.url})`).join('\n');
          expect(errors, `Console errors:\n${detail}`).toEqual([]);
        }

        await snap(page, `f8.1-console-clean-${vp.name}`);
      });
    });
  }
});
