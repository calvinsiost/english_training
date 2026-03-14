import { test } from '@playwright/test';

const BASE = 'https://calvinsiost.github.io/english_training/';

test('inspect what happens after clicking btn-study', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  // Capture console errors
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') errors.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => errors.push(`[PAGEERROR] ${err.message}`));

  // Click btn-study
  await page.click('#btn-study');
  await page.waitForTimeout(5000);

  // Check what's active
  const activeView = await page.evaluate(() => {
    const active = document.querySelector('.view--active');
    return { id: active?.id, classes: active?.className };
  });
  console.log('Active view:', JSON.stringify(activeView));

  // Check study section state
  const studyState = await page.evaluate(() => {
    const study = document.getElementById('study') as HTMLElement | null;
    const passageText = document.getElementById('passage-text') as HTMLElement | null;
    const questionText = document.getElementById('question-text') as HTMLElement | null;
    const optionsList = document.getElementById('options-list') as HTMLElement | null;
    return {
      studyClasses: study?.className,
      studyDisplay: study ? window.getComputedStyle(study).display : 'N/A',
      passageTextContent: passageText?.innerText?.trim().slice(0, 200),
      questionTextContent: questionText?.innerText?.trim().slice(0, 200),
      optionsListContent: optionsList?.innerHTML?.trim().slice(0, 400),
      hash: window.location.hash,
    };
  });
  console.log('Study state:', JSON.stringify(studyState, null, 2));

  // Check localStorage for bank data
  const localStorageData = await page.evaluate(() => {
    const keys = Object.keys(localStorage);
    const result: Record<string, any> = {};
    keys.forEach(k => {
      const val = localStorage.getItem(k);
      try {
        const parsed = JSON.parse(val!);
        result[k] = typeof parsed === 'object' ? `[${Array.isArray(parsed) ? 'Array' : 'Object'} length=${Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length}]` : parsed;
      } catch {
        result[k] = val?.slice(0, 100);
      }
    });
    return result;
  });
  console.log('localStorage:', JSON.stringify(localStorageData, null, 2));

  console.log('Console errors:', errors.join('\n') || 'none');

  await page.screenshot({ path: 'test-results/validation/debug-after-btn-study.png' });
});
