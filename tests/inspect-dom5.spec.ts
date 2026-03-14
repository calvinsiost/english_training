import { test } from '@playwright/test';

const BASE = 'https://calvinsiost.github.io/english_training/';

test('find 404 and seed bank, then study', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });

  const failed404: string[] = [];
  page.on('response', resp => {
    if (resp.status() >= 400) failed404.push(`${resp.status()} ${resp.url()}`);
  });

  const consoleLogs: string[] = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  console.log('404 responses:', JSON.stringify(failed404, null, 2));
  console.log('Console logs:', consoleLogs.join('\n'));

  // Manually seed IndexedDB with a sample passage so we can test the study flow
  await page.evaluate(async () => {
    const samplePassage = {
      id: 'test-passage-1',
      passage_title: 'Test Passage',
      passage_text: "English is a fascinating language. It has evolved over centuries, absorbing words from many other languages. Today it doesn't belong to any single country or culture. Many people around the world can't imagine life without it. It won't disappear anytime soon. Linguists study how it continues to change and grow in the modern world.",
      source_type: 'official',
      questions: [
        {
          id: 'q1',
          question_text: 'What is the main idea of the passage?',
          options: {
            A: 'English is difficult to learn.',
            B: 'English has evolved and spread globally.',
            C: 'English belongs only to Britain.',
            D: 'Linguists dislike the English language.',
            E: 'English will disappear in the future.',
          },
          correct_answer: 'B',
          explanation: 'The passage describes how English has evolved and spread worldwide.',
        },
      ],
      times_served: 0,
      last_served_at: null,
    };

    return new Promise<void>((resolve, reject) => {
      const openReq = indexedDB.open('english-training-db', 1);
      openReq.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('question_bank')) {
          db.createObjectStore('question_bank', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress', { keyPath: 'id' });
        }
      };
      openReq.onsuccess = () => {
        const db = openReq.result;
        const tx = db.transaction(['question_bank', 'meta'], 'readwrite');
        tx.objectStore('question_bank').put(samplePassage);
        tx.objectStore('meta').put({ key: 'bank_initialized', value: true });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      openReq.onerror = () => reject(openReq.error);
    });
  });

  console.log('Bank seeded. Reloading...');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  // Verify bank count shown in UI
  const bankCount = await page.locator('#bank-count').innerText();
  console.log('Bank count in UI:', bankCount);

  // Now try btn-study
  await page.click('#btn-study');
  await page.waitForTimeout(3000);

  const studyState = await page.evaluate(() => {
    const study = document.getElementById('study') as HTMLElement | null;
    const passageText = document.getElementById('passage-text') as HTMLElement | null;
    const questionText = document.getElementById('question-text') as HTMLElement | null;
    const optionsList = document.getElementById('options-list') as HTMLElement | null;
    return {
      studyActive: study?.classList.contains('view--active'),
      passageContent: passageText?.innerText?.trim().slice(0, 200),
      questionContent: questionText?.innerText?.trim().slice(0, 200),
      optionsHTML: optionsList?.innerHTML?.trim().slice(0, 500),
      hash: window.location.hash,
    };
  });
  console.log('Study state after seeding:', JSON.stringify(studyState, null, 2));

  const consoleLogs2: string[] = [];
  page.on('console', msg => consoleLogs2.push(`[${msg.type()}] ${msg.text()}`));
  await page.screenshot({ path: 'test-results/validation/debug-seeded-study.png' });
});
