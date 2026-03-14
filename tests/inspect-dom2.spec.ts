import { test } from '@playwright/test';

const BASE = 'https://calvinsiost.github.io/english_training/';

test('inspect study section after clicking Nova Passagem', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto(BASE);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // Load a passage via the button
  await page.click('#btn-study');
  await page.waitForTimeout(3000);

  // Get study section HTML
  const studySection = await page.evaluate(() => {
    const el = document.getElementById('study');
    return el ? el.innerHTML.slice(0, 6000) : 'NOT FOUND';
  });
  console.log('=== STUDY SECTION HTML ===\n' + studySection);

  // Check visibility of key containers
  const visibility = await page.evaluate(() => {
    const ids = ['study', 'dashboard'];
    const clses = ['.passage-container', '.passage-text', '.question-container', '.question-text', '.options-list', '.feedback-section', '.confidence-section'];
    const result: Record<string, any> = {};
    ids.forEach(id => {
      const el = document.getElementById(id);
      result[`#${id}.classes`] = el?.className;
      result[`#${id}.visible`] = el ? el.offsetParent !== null || el.classList.contains('view--active') : false;
    });
    clses.forEach(sel => {
      const el = document.querySelector(sel) as HTMLElement | null;
      result[`${sel}.exists`] = !!el;
      result[`${sel}.display`] = el ? window.getComputedStyle(el).display : 'N/A';
      result[`${sel}.visibility`] = el ? window.getComputedStyle(el).visibility : 'N/A';
      result[`${sel}.text`] = el ? el.innerText.slice(0, 100) : 'N/A';
    });
    return result;
  });
  console.log('\n=== VISIBILITY CHECKS ===\n' + JSON.stringify(visibility, null, 2));

  // All buttons
  const btns = await page.evaluate(() =>
    [...document.querySelectorAll('button')].map(b => ({
      text: (b as HTMLElement).innerText.trim().slice(0, 60),
      cls: b.className,
      id: b.id,
      visible: (b as HTMLElement).offsetParent !== null,
    }))
  );
  console.log('\n=== BUTTONS AFTER CLICKING NOVA PASSAGEM ===\n' + JSON.stringify(btns, null, 2));

  // Options
  const options = await page.evaluate(() => {
    const list = document.querySelector('.options-list');
    if (!list) return 'NOT FOUND';
    return list.innerHTML;
  });
  console.log('\n=== OPTIONS LIST HTML ===\n' + options);
});
