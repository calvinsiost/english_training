import { test } from '@playwright/test';

const BASE = 'https://calvinsiost.github.io/english_training/';

test('inspect IndexedDB bank state and network', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });

  const networkLogs: string[] = [];
  page.on('response', resp => {
    networkLogs.push(`${resp.status()} ${resp.url()}`);
  });

  const consoleLogs: string[] = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  // Check IndexedDB
  const idbData = await page.evaluate(async () => {
    return new Promise<any>((resolve) => {
      const req = indexedDB.open('english-training-db');
      req.onsuccess = () => {
        const db = req.result;
        const storeNames = [...db.objectStoreNames];
        if (!storeNames.includes('question_bank')) {
          resolve({ storeNames, error: 'no question_bank store' });
          return;
        }
        const tx = db.transaction('question_bank', 'readonly');
        const store = tx.objectStore('question_bank');
        const getAllReq = store.getAll();
        getAllReq.onsuccess = () => {
          const passages = getAllReq.result;
          resolve({
            storeNames,
            passageCount: passages.length,
            firstPassageKeys: passages.length > 0 ? Object.keys(passages[0]) : [],
            firstPassageText: passages.length > 0 ? JSON.stringify(passages[0]).slice(0, 300) : null,
          });
        };
        getAllReq.onerror = () => resolve({ error: 'getAllReq failed' });
      };
      req.onerror = () => resolve({ error: 'IDB open failed', msg: req.error?.message });
      req.onupgradeneeded = () => resolve({ msg: 'upgrade needed - fresh DB' });
    });
  });
  console.log('IndexedDB state:', JSON.stringify(idbData, null, 2));

  // Also check meta store
  const metaData = await page.evaluate(async () => {
    return new Promise<any>((resolve) => {
      const req = indexedDB.open('english-training-db');
      req.onsuccess = () => {
        const db = req.result;
        if (![...db.objectStoreNames].includes('meta')) {
          resolve({ error: 'no meta store' });
          return;
        }
        const tx = db.transaction('meta', 'readonly');
        const store = tx.objectStore('meta');
        const getAllReq = store.getAll();
        getAllReq.onsuccess = () => resolve({ meta: getAllReq.result });
        getAllReq.onerror = () => resolve({ error: 'meta getAll failed' });
      };
    });
  });
  console.log('Meta store:', JSON.stringify(metaData, null, 2));

  console.log('\nNetwork responses (initial-bank):');
  networkLogs.filter(l => l.includes('bank') || l.includes('json')).forEach(l => console.log(' ', l));

  console.log('\nConsole logs:');
  consoleLogs.forEach(l => console.log(' ', l));
});
