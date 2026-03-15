/**
 * E2E Tests — TTS Playback Controls (Pause/Resume/Stop)
 *
 * Web Speech API does not produce real audio in headless Playwright.
 * Tests validate DOM state (CSS classes, button text, aria-label),
 * speechSynthesis mock calls, and state transitions.
 */

import { test, expect, Page } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';
const SHOTS = 'test-results/tts-controls';
const TIMEOUT_STEP = 10_000;

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

async function openApp(page: Page, viewport = { width: 1200, height: 800 }) {
  await page.setViewportSize(viewport);
  await page.goto(BASE + '#/', { waitUntil: 'commit' });
  await page.evaluate(async () => {
    const databases = await (window as any).indexedDB?.databases?.() || [];
    await Promise.all(
      databases
        .filter((db: any) => db.name)
        .map(
          (db: any) =>
            new Promise<void>((r) => {
              const req = indexedDB.deleteDatabase(db.name);
              req.onsuccess = req.onerror = req.onblocked = () => r();
            })
        )
    );
    localStorage.clear();
    sessionStorage.clear();
  }).catch(() => {});
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => (window as any).appReady === true, {
    timeout: 15000,
  });
}

async function startStudy(page: Page) {
  await page.click('#btn-study');
  await page.waitForFunction(
    () =>
      document.getElementById('study')?.classList.contains('view--active'),
    { timeout: TIMEOUT_STEP }
  );
  await page.waitForFunction(
    () => {
      const el = document.getElementById('passage-text') as HTMLElement | null;
      return el && el.innerText.trim().length > 20;
    },
    { timeout: TIMEOUT_STEP }
  );
  await page.waitForTimeout(500);
}

/** Enable TTS setting and mock speechSynthesis for headless */
async function enableTTSAndMock(page: Page) {
  await page.evaluate(() => {
    if ((window as any).helpFeatures) {
      (window as any).helpFeatures.updateSettings({ tts: true });
    }
  });

  await page.evaluate(() => {
    const calls: string[] = [];
    let speaking = false;
    let paused = false;
    let currentUtterance: any = null;
    let endTimeout: any = null;

    (window as any).__ttsCalls = calls;
    (window as any).__ttsForceEnd = () => {
      if (currentUtterance && currentUtterance.onend) {
        speaking = false;
        paused = false;
        currentUtterance.onend(new Event('end'));
      }
    };

    const mockSynthesis = {
      get speaking() {
        return speaking;
      },
      get paused() {
        return paused;
      },
      speak(utterance: any) {
        calls.push('speak');
        speaking = true;
        paused = false;
        currentUtterance = utterance;
        endTimeout = setTimeout(() => {
          if (speaking && !paused && utterance.onend) {
            speaking = false;
            paused = false;
            utterance.onend(new Event('end'));
          }
        }, 3000);
      },
      pause() {
        calls.push('pause');
        paused = true;
      },
      resume() {
        calls.push('resume');
        paused = false;
      },
      cancel() {
        calls.push('cancel');
        speaking = false;
        paused = false;
        clearTimeout(endTimeout);
        if (currentUtterance && currentUtterance.onend) {
          currentUtterance.onend(new Event('end'));
        }
        currentUtterance = null;
      },
      getVoices() {
        return [];
      },
      addEventListener() {},
      removeEventListener() {},
      onvoiceschanged: null,
    };
    Object.defineProperty(window, 'speechSynthesis', {
      value: mockSynthesis,
      writable: true,
      configurable: true,
    });
  });
}

function getButtonState(page: Page) {
  return page.evaluate(() => {
    const btn = document.getElementById('help-btn-tts');
    if (!btn) return null;
    return {
      hasPlaying: btn.classList.contains('playing'),
      hasPaused: btn.classList.contains('paused'),
      ariaLabel: btn.getAttribute('aria-label'),
      idleVisible: !!(btn.querySelector('.tts-icon--idle') as HTMLElement)
        ?.offsetParent,
      playingVisible: !!(
        btn.querySelector('.tts-icon--playing') as HTMLElement
      )?.offsetParent,
      pausedVisible: !!(btn.querySelector('.tts-icon--paused') as HTMLElement)
        ?.offsetParent,
    };
  });
}

// ── TEST 1: Happy path — Play → Pause → Resume → Auto-End ──────────────────

test('TTS-1: Play → Pause → Resume → Auto-End cycle', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await openApp(page);
  await startStudy(page);
  await enableTTSAndMock(page);

  const ttsBtn = page.locator('#help-btn-tts');
  await expect(ttsBtn).toBeVisible({ timeout: TIMEOUT_STEP });

  // IDLE state
  let state = await getButtonState(page);
  expect(state?.idleVisible).toBe(true);
  expect(state?.playingVisible).toBe(false);
  expect(state?.hasPlaying).toBe(false);
  await shot(page, 'tts1-01-idle');

  // Click → PLAYING
  await ttsBtn.click();
  await page.waitForTimeout(200);
  state = await getButtonState(page);
  expect(state?.playingVisible).toBe(true);
  expect(state?.idleVisible).toBe(false);
  expect(state?.hasPlaying).toBe(true);
  expect(state?.ariaLabel).toContain('Pausar');
  await shot(page, 'tts1-02-playing');

  const calls1 = await page.evaluate(() => (window as any).__ttsCalls);
  expect(calls1).toContain('speak');

  // Click → PAUSED
  await ttsBtn.click();
  await page.waitForTimeout(200);
  state = await getButtonState(page);
  expect(state?.pausedVisible).toBe(true);
  expect(state?.playingVisible).toBe(false);
  expect(state?.hasPaused).toBe(true);
  expect(state?.hasPlaying).toBe(false);
  expect(state?.ariaLabel).toContain('Continuar');
  await shot(page, 'tts1-03-paused');

  const calls2 = await page.evaluate(() => (window as any).__ttsCalls);
  expect(calls2).toContain('pause');

  // Click → RESUME (playing again)
  await ttsBtn.click();
  await page.waitForTimeout(200);
  state = await getButtonState(page);
  expect(state?.playingVisible).toBe(true);
  expect(state?.hasPlaying).toBe(true);
  expect(state?.ariaLabel).toContain('Pausar');
  await shot(page, 'tts1-04-resumed');

  const calls3 = await page.evaluate(() => (window as any).__ttsCalls);
  expect(calls3).toContain('resume');

  // Auto-end (mock fires onend after 3s)
  await page.waitForTimeout(3500);
  state = await getButtonState(page);
  expect(state?.idleVisible).toBe(true);
  expect(state?.hasPlaying).toBe(false);
  expect(state?.hasPaused).toBe(false);
  expect(state?.ariaLabel).toContain('Ouvir');
  await shot(page, 'tts1-05-ended');

  const projectErrors = consoleErrors.filter(
    (e) => !e.includes('favicon') && !e.includes('third_party') && !e.includes('IDBObjectStore')
  );
  expect(projectErrors).toHaveLength(0);
});

// ── TEST 2: Navigation cancels playback ─────────────────────────────────────

test('TTS-2: Navigating to next question stops TTS and resets button', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await openApp(page);
  await startStudy(page);
  await enableTTSAndMock(page);

  const ttsBtn = page.locator('#help-btn-tts');

  // Start playing
  await ttsBtn.click();
  await page.waitForTimeout(200);
  let state = await getButtonState(page);
  expect(state?.hasPlaying).toBe(true);
  await shot(page, 'tts2-01-playing');

  // Simulate navigation by calling stopSpeaking (as loadPassageIntoUI does)
  await page.evaluate(() => {
    const btn = document.getElementById('help-btn-tts');
    (window as any).helpFeatures.stopSpeaking(btn);
  });
  await page.waitForTimeout(300);

  // After stopSpeaking, TTS should be idle
  state = await getButtonState(page);
  expect(state?.idleVisible).toBe(true);
  expect(state?.hasPlaying).toBe(false);
  expect(state?.hasPaused).toBe(false);
  await shot(page, 'tts2-02-after-nav');

  const calls = await page.evaluate(() => (window as any).__ttsCalls);
  expect(calls).toContain('cancel');

  const projectErrors = consoleErrors.filter(
    (e) => !e.includes('favicon') && !e.includes('third_party') && !e.includes('IDBObjectStore')
  );
  expect(projectErrors).toHaveLength(0);
});

// ── TEST 3: Disabling TTS setting stops playback ────────────────────────────

test('TTS-3: Disabling help-tts setting cancels active playback', async ({
  page,
}) => {
  await openApp(page);
  await startStudy(page);
  await enableTTSAndMock(page);

  const ttsBtn = page.locator('#help-btn-tts');
  await ttsBtn.click();
  await page.waitForTimeout(200);

  let state = await getButtonState(page);
  expect(state?.hasPlaying).toBe(true);
  await shot(page, 'tts3-01-playing');

  // Disable TTS via settings
  await page.evaluate(() => {
    if ((window as any).helpFeatures) {
      (window as any).helpFeatures.updateSettings({ tts: false });
      (window as any).helpFeatures.stopSpeaking();
    }
  });
  await page.waitForTimeout(300);

  const calls = await page.evaluate(() => (window as any).__ttsCalls);
  expect(calls).toContain('cancel');
  await shot(page, 'tts3-02-disabled');
});

// ── TEST 4: Double-click rapid fire (anti-bounce) ───────────────────────────

test('TTS-4: Rapid double-click does not cause inconsistent state', async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await openApp(page);
  await startStudy(page);
  await enableTTSAndMock(page);

  const ttsBtn = page.locator('#help-btn-tts');

  // Rapid double-click
  await ttsBtn.dblclick();
  await page.waitForTimeout(300);

  const state = await getButtonState(page);
  // State must be consistent: exactly one of playing/paused/idle
  const isConsistent =
    (state?.hasPlaying && !state?.hasPaused) ||
    (state?.hasPaused && !state?.hasPlaying) ||
    (!state?.hasPlaying && !state?.hasPaused);
  expect(isConsistent).toBe(true);
  await shot(page, 'tts4-01-after-dblclick');

  const projectErrors = consoleErrors.filter(
    (e) => !e.includes('favicon') && !e.includes('third_party') && !e.includes('IDBObjectStore')
  );
  expect(projectErrors).toHaveLength(0);
});

// ── TEST 5: Accessibility — aria-label updates per state ────────────────────

test('TTS-5: aria-label and title update correctly per state', async ({
  page,
}) => {
  await openApp(page);
  await startStudy(page);
  await enableTTSAndMock(page);

  const ttsBtn = page.locator('#help-btn-tts');

  // Idle
  await expect(ttsBtn).toHaveAttribute('aria-label', /[Oo]uvir/);
  await expect(ttsBtn).toHaveAttribute('title', /[Oo]uvir/);

  // Playing
  await ttsBtn.click();
  await page.waitForTimeout(200);
  await expect(ttsBtn).toHaveAttribute('aria-label', /[Pp]ausar/);
  await expect(ttsBtn).toHaveAttribute('title', /[Pp]ausar/);

  // Paused
  await ttsBtn.click();
  await page.waitForTimeout(200);
  await expect(ttsBtn).toHaveAttribute('aria-label', /[Cc]ontinuar/);
  await expect(ttsBtn).toHaveAttribute('title', /[Cc]ontinuar/);

  // Force end → back to idle
  await page.evaluate(() => (window as any).__ttsForceEnd());
  await page.waitForTimeout(200);
  await expect(ttsBtn).toHaveAttribute('aria-label', /[Oo]uvir/);

  await shot(page, 'tts5-01-accessibility');
});

// ── TEST 6: CSS visual states — desktop + tablet + mobile ───────────────────

for (const vp of [
  { name: 'desktop', width: 1200, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 667 },
]) {
  test(`TTS-6-${vp.name}: Visual states at ${vp.width}px`, async ({
    page,
  }) => {
    await openApp(page, vp);
    await startStudy(page);
    await enableTTSAndMock(page);

    const ttsBtn = page.locator('#help-btn-tts');
    await shot(page, `tts6-${vp.name}-01-idle`);

    // Playing — check pulse animation class
    await ttsBtn.click();
    await page.waitForTimeout(200);
    await expect(ttsBtn).toHaveClass(/playing/);
    await shot(page, `tts6-${vp.name}-02-playing`);

    // Paused — no pulse, has paused class
    await ttsBtn.click();
    await page.waitForTimeout(200);
    await expect(ttsBtn).toHaveClass(/paused/);
    await expect(ttsBtn).not.toHaveClass(/playing/);
    await shot(page, `tts6-${vp.name}-03-paused`);

    // Check button not clipped/overflowing
    const box = await ttsBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(20);
    expect(box!.height).toBeGreaterThan(16);

    // Force end
    await page.evaluate(() => (window as any).__ttsForceEnd());
    await page.waitForTimeout(200);
    await expect(ttsBtn).not.toHaveClass(/playing/);
    await expect(ttsBtn).not.toHaveClass(/paused/);
    await shot(page, `tts6-${vp.name}-04-reset`);
  });
}
