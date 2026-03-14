import { test } from '@playwright/test';

const BASE = 'https://calvinsiost.github.io/english_training/';

test('check app init, router, and btn-study behavior', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });

  const all404: string[] = [];
  const allConsole: string[] = [];
  page.on('response', r => { if (r.status() >= 400) all404.push(`${r.status()} ${r.url()}`); });
  page.on('console', m => allConsole.push(`[${m.type()}] ${m.text()}`));

  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  console.log('=== 4xx/5xx responses ===');
  all404.forEach(l => console.log(l));

  console.log('\n=== ALL Console logs ===');
  allConsole.forEach(l => console.log(l));

  const appState = await page.evaluate(() => {
    const w = window as any;
    return {
      hasRouter: typeof w.router !== 'undefined',
      routerType: typeof w.router,
      dbInitialized: typeof w.state !== 'undefined' ? (w.state as any).db ? 'db present' : 'db null' : 'state undefined',
    };
  });
  console.log('\n=== App state ===');
  console.log(JSON.stringify(appState, null, 2));

  // Try btn-study click
  await page.click('#btn-study');
  await page.waitForTimeout(2000);

  const afterClick = await page.evaluate(() => ({
    hash: window.location.hash,
    studyActive: document.getElementById('study')?.classList.contains('view--active'),
  }));
  console.log('\n=== After btn-study click ===');
  console.log(JSON.stringify(afterClick));

  // Check for any toast messages (error toasts)
  const toastText = await page.evaluate(() => {
    const toasts = document.querySelectorAll('.toast-container');
    return [...toasts].map((t: any) => t.innerText).join(' | ');
  });
  console.log('Toast text:', toastText || 'none');
});
