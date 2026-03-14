import { test } from '@playwright/test';

const BASE = 'https://calvinsiost.github.io/english_training/';

test('inspect study page DOM', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto(BASE + '#/study');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3500);

  const html = await page.evaluate(() => document.body.innerHTML);
  console.log('=== STUDY BODY (5000) ===\n' + html.slice(0, 5000));

  const classes = await page.evaluate(() => {
    const s = new Set<string>();
    document.querySelectorAll('*').forEach(el => el.classList.forEach(c => s.add(c)));
    return [...s].sort().join(', ');
  });
  console.log('\n=== CLASSES ===\n' + classes);

  const btns = await page.evaluate(() =>
    [...document.querySelectorAll('button')].map(b => ({
      text: (b as HTMLElement).innerText.trim().slice(0, 60),
      cls: b.className,
      id: b.id,
    }))
  );
  console.log('\n=== BUTTONS ===\n' + JSON.stringify(btns, null, 2));
});

test('inspect settings page DOM', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto(BASE + '#/settings');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  const html = await page.evaluate(() => document.body.innerHTML);
  console.log('=== SETTINGS BODY (4000) ===\n' + html.slice(0, 4000));

  const btns = await page.evaluate(() =>
    [...document.querySelectorAll('button')].map(b => ({
      text: (b as HTMLElement).innerText.trim().slice(0, 60),
      cls: b.className,
      id: b.id,
    }))
  );
  console.log('\n=== SETTINGS BUTTONS ===\n' + JSON.stringify(btns, null, 2));

  const htmlAttrs = await page.evaluate(() => {
    const attrs: Record<string, string> = {};
    document.documentElement.getAttributeNames().forEach(a => {
      attrs[a] = document.documentElement.getAttribute(a) || '';
    });
    return attrs;
  });
  console.log('\n=== HTML ELEMENT ATTRS ===\n' + JSON.stringify(htmlAttrs));
});

test('inspect mobile study DOM', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(BASE + '#/study');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3500);

  const html = await page.evaluate(() => document.body.innerHTML);
  console.log('=== MOBILE STUDY BODY (4000) ===\n' + html.slice(0, 4000));

  const btns = await page.evaluate(() =>
    [...document.querySelectorAll('button')].map(b => ({
      text: (b as HTMLElement).innerText.trim().slice(0, 60),
      cls: b.className,
      visible: (b as HTMLElement).offsetParent !== null,
    }))
  );
  console.log('\n=== MOBILE BUTTONS ===\n' + JSON.stringify(btns, null, 2));
});
