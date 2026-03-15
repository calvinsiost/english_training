/**
 * Smoke Test E2E - English Training App
 * Testes rápidos de verificação dos fluxos críticos
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';
const TIMEOUT = 10000;

// Viewports
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 }
];

for (const viewport of VIEWPORTS) {
  test.describe(`Smoke Tests - ${viewport.name}`, () => {
    
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
    });

    test(`Dashboard carrega corretamente @${viewport.name}`, async ({ page }) => {
      await page.goto(`${BASE_URL}/#/`, { waitUntil: 'networkidle', timeout: TIMEOUT });
      
      // Verificar elementos críticos
      await expect(page.locator('#dashboard')).toBeVisible({ timeout: TIMEOUT });
      await expect(page.locator('.app-title')).toContainText('English Training');
      await expect(page.locator('.stats-grid')).toBeVisible();
      
      // Verificar botões principais
      await expect(page.locator('#btn-study')).toBeVisible();
      await expect(page.locator('#btn-review')).toBeVisible();
      await expect(page.locator('#settings-btn')).toBeVisible();
    });

    test(`Navegação para Settings @${viewport.name}`, async ({ page }) => {
      await page.goto(`${BASE_URL}/#/`, { waitUntil: 'networkidle' });
      
      await page.click('#settings-btn');
      await expect(page.locator('#settings.view--active')).toBeVisible({ timeout: TIMEOUT });
      
      // Verificar seção de API
      await expect(page.locator('#provider-grid')).toBeVisible();
    });

    test(`Study Session - carregamento @${viewport.name}`, async ({ page }) => {
      await page.goto(`${BASE_URL}/#/`, { waitUntil: 'networkidle' });
      
      await page.click('#btn-study');
      await expect(page.locator('#study.view--active')).toBeVisible({ timeout: TIMEOUT });
      
      // Aguardar carregamento do texto
      await page.waitForFunction(() => {
        const el = document.getElementById('passage-text');
        return el && el.innerText.trim().length > 20;
      }, { timeout: TIMEOUT });
    });

    test(`Analytics carrega @${viewport.name}`, async ({ page }) => {
      await page.goto(`${BASE_URL}/#/analytics`, { waitUntil: 'networkidle', timeout: TIMEOUT });
      
      await expect(page.locator('#analytics.view--active')).toBeVisible();
      await expect(page.locator('#stats-view')).toBeVisible();
    });

    test(`Bottom navigation funciona @${viewport.name}`, async ({ page }) => {
      await page.goto(`${BASE_URL}/#/`, { waitUntil: 'networkidle' });
      
      // Clicar em Analytics via bottom nav
      await page.locator('.bottom-nav a[href="#/analytics"]').click();
      await expect(page.locator('#analytics.view--active')).toBeVisible({ timeout: TIMEOUT });
      
      // Clicar em Settings
      await page.locator('.bottom-nav a[href="#/settings"]').click();
      await expect(page.locator('#settings.view--active')).toBeVisible({ timeout: TIMEOUT });
      
      // Voltar para Home
      await page.locator('.bottom-nav a[href="#/"]').click();
      await expect(page.locator('#dashboard.view--active')).toBeVisible({ timeout: TIMEOUT });
    });

  });
}

// Teste de console errors
test('Sem erros de console críticos', async ({ page }) => {
  const errors: string[] = [];
  
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignorar erros de dependências externas
      if (!text.includes('lucide') && !text.includes('unpkg.com')) {
        errors.push(text);
      }
    }
  });
  
  await page.goto(`${BASE_URL}/#/`, { waitUntil: 'networkidle' });
  await page.click('#btn-study');
  await page.waitForTimeout(2000);
  await page.click('#settings-btn');
  await page.waitForTimeout(2000);
  
  // Não deve ter erros críticos
  expect(errors.filter(e => 
    e.includes('TypeError') || 
    e.includes('ReferenceError') ||
    e.includes('SyntaxError')
  )).toEqual([]);
});
