import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';
const SHOTS = 'test-results/validation/help-prompt';

async function shot(page: any, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

async function openApp(page: any, viewport = { width: 1280, height: 720 }) {
  await page.setViewportSize(viewport);
  await page.goto(BASE + '#/', { waitUntil: 'commit' });
  await page.evaluate(async () => {
    const databases = await (window as any).indexedDB?.databases?.() || [];
    await Promise.all(databases.filter((db: any) => db.name).map((db: any) =>
      new Promise<void>(r => { const req = indexedDB.deleteDatabase(db.name); req.onsuccess = req.onerror = req.onblocked = () => r(); })
    ));
    localStorage.clear(); sessionStorage.clear();
  }).catch(() => {});
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => (window as any).appReady === true, { timeout: 15000 });
}

async function startStudy(page: any) {
  await page.click('#btn-study');
  await page.waitForFunction(
    () => document.getElementById('study')?.classList.contains('view--active'),
    { timeout: 10000 }
  );
  await page.waitForFunction(
    () => {
      const el = document.getElementById('passage-text') as HTMLElement | null;
      return el && el.innerText.trim().length > 20;
    },
    { timeout: 10000 }
  );
  await page.waitForTimeout(500);
}

function setupConsoleCapture(page: any) {
  const errors: string[] = [];
  page.on('console', (msg: any) => {
    if (msg.type() === 'error' && !msg.text().includes('third-party')) {
      errors.push(msg.text());
    }
  });
  return errors;
}

test.describe('FIX-002: Help Features Prompt Data', () => {

  test('1 - Prompt includes question data (unit-level check)', async ({ page }) => {
    await openApp(page);
    const errors = setupConsoleCapture(page);
    await startStudy(page);
    await shot(page, '01-study-loaded');

    const promptData = await page.evaluate(() => {
      return new Promise<{ prompt: string; question: any; passage: any }>((resolve) => {
        const hf = (window as any).helpFeatures;
        if (!hf) { resolve({ prompt: '', question: null, passage: null }); return; }
        hf.callLLM = async (prompt: string) => {
          resolve({
            prompt,
            question: hf.currentQuestion,
            passage: { text: hf.currentPassage?.text?.substring(0, 100) }
          });
          throw new Error('INTERCEPTED');
        };
        hf.getGrammarLesson();
      });
    });

    console.log('Prompt length:', promptData.prompt.length);
    console.log('Question object keys:', Object.keys(promptData.question || {}));
    console.log('Prompt preview:', promptData.prompt.substring(0, 300));

    expect(promptData.prompt.length, 'Prompt should not be empty').toBeGreaterThan(50);

    const questionSection = promptData.prompt.split('**Questão:**')[1]?.split('**')[0]?.trim() || '';
    expect(questionSection.length, 'Question section should contain actual text').toBeGreaterThan(5);

    const correctSection = promptData.prompt.split('**Resposta correta:**')[1]?.split('\n\n')[0]?.trim() || '';
    expect(correctSection.length, 'Correct answer section should contain actual text').toBeGreaterThan(1);

    const projectErrors = errors.filter(e => !e.includes('INTERCEPTED'));
    expect(projectErrors.length, `Console errors: ${projectErrors.join('; ')}`).toBe(0);

    await shot(page, '01-prompt-validated');
  });

  test('2 - Alternatives prompt includes question_text and correct_answer', async ({ page }) => {
    await openApp(page);
    await startStudy(page);

    const promptData = await page.evaluate(() => {
      return new Promise<{ prompt: string }>((resolve) => {
        const hf = (window as any).helpFeatures;
        if (!hf) { resolve({ prompt: '' }); return; }
        hf.callLLM = async (prompt: string) => {
          resolve({ prompt });
          throw new Error('INTERCEPTED');
        };
        hf.getAlternativeExplanations();
      });
    });

    const questionSection = promptData.prompt.split('**Questão:**')[1]?.split('**')[0]?.trim() || '';
    expect(questionSection.length, 'Alternatives prompt question section should have text').toBeGreaterThan(5);

    const correctSection = promptData.prompt.split('**Resposta correta:**')[1]?.trim() || '';
    expect(correctSection, 'Should contain a letter A-E').toMatch(/[A-E]/);

    expect(promptData.prompt, 'Should contain alternatives A) B) C)').toMatch(/[A-E]\)/);

    await shot(page, '02-alternatives-prompt');
  });

  test('3 - Hints prompt includes question_text', async ({ page }) => {
    await openApp(page);
    await startStudy(page);

    const promptData = await page.evaluate(() => {
      return new Promise<{ prompt: string }>((resolve) => {
        const hf = (window as any).helpFeatures;
        if (!hf) { resolve({ prompt: '' }); return; }
        hf.callLLM = async (prompt: string) => {
          resolve({ prompt });
          throw new Error('INTERCEPTED');
        };
        hf.getHints();
      });
    });

    const questionSection = promptData.prompt.split('**Questão:**')[1]?.split('\n\n')[0]?.trim() || '';
    expect(questionSection.length, 'Hints prompt question should have text').toBeGreaterThan(5);

    await shot(page, '03-hints-prompt');
  });

  test('4 - Error: shows "Chave de API não configurada" without key', async ({ page }) => {
    await openApp(page);
    await startStudy(page);

    await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('api_key_'));
      keys.forEach(k => localStorage.removeItem(k));
    });

    const aulaBtn = page.locator('button, [role="button"]').filter({ hasText: /Aula/i });
    if (await aulaBtn.count() > 0) {
      await aulaBtn.first().click();
      await page.waitForTimeout(2000);

      const errorText = await page.evaluate(() => {
        const modals = document.querySelectorAll('.help-modal, .modal, [class*="modal"]');
        let text = '';
        modals.forEach(m => { text += (m as HTMLElement).innerText; });
        return text;
      });

      await shot(page, '04-no-api-key-error');

      if (!errorText.includes('Ollama') && !errorText.includes('local')) {
        expect(errorText).toContain('Chave de API');
      }
    }
  });

  test('5 - Tablet viewport: help button renders correctly', async ({ page }) => {
    await openApp(page, { width: 768, height: 1024 });
    await startStudy(page);
    await shot(page, '05-tablet-study');

    const helpBar = page.locator('[class*="help-bar"], [class*="help-actions"]');
    if (await helpBar.count() > 0) {
      const box = await helpBar.first().boundingBox();
      expect(box, 'Help bar should be visible on tablet').not.toBeNull();
      if (box) {
        expect(box.x, 'Help bar should not overflow left').toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, 'Help bar should not overflow right').toBeLessThanOrEqual(768 + 2);
      }
    }
    await shot(page, '05-tablet-help-bar');
  });

  test('6 - Mobile viewport: help button renders correctly', async ({ page }) => {
    await openApp(page, { width: 375, height: 812 });
    await startStudy(page);
    await shot(page, '06-mobile-study');

    const helpBar = page.locator('[class*="help-bar"], [class*="help-actions"]');
    if (await helpBar.count() > 0) {
      const box = await helpBar.first().boundingBox();
      expect(box, 'Help bar should be visible on mobile').not.toBeNull();
      if (box) {
        expect(box.x + box.width, 'Help bar should not overflow on mobile').toBeLessThanOrEqual(375 + 2);
      }
    }
    await shot(page, '06-mobile-help-bar');
  });
});
