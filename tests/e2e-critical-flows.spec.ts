/**
 * Plano de Testes E2E - English Training App
 * Execução como usuário real em múltiplos viewports
 * 
 * Fluxos críticos cobertos:
 * 1. Onboarding e Configuração de API
 * 2. Sessão de Estudo (Study)
 * 3. Revisão SRS
 * 4. Modo Expedição (Roguelite)
 * 5. Modo Simulado (Exam)
 * 6. Analytics e Estatísticas
 * 7. Flashcards e Vocabulário
 * 8. Backup e Restauração
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// CONFIGURAÇÃO GLOBAL
// ============================================

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8080';
const REPORT_DIR = path.join(__dirname, '../test-results/e2e-critical-flows');
const STEP_TIMEOUT = 10000; // 10s por passo

// Viewports conforme especificação
const VIEWPORTS = {
  desktop: { width: 1280, height: 720, name: 'desktop' },
  tablet: { width: 768, height: 1024, name: 'tablet' },
  mobile: { width: 375, height: 812, name: 'mobile' }
};

// Thresholds de latência
const LATENCY_THRESHOLDS = {
  warning: 2000, // 2s = 🟡
  error: 5000    // 5s = 🔴
};

// Estrutura de relatório
interface TestReport {
  timestamp: string;
  viewport: string;
  flow: string;
  step: string;
  status: 'PASS' | 'FAIL';
  severity?: '🔴' | '🟡' | '🟢';
  screenshot?: string;
  consoleErrors: string[];
  apiCalls: APICall[];
  visualCheck?: VisualCheckResult;
  error?: string;
  duration: number;
}

interface APICall {
  url: string;
  status: number;
  latency: number;
  error?: string;
}

interface VisualCheckResult {
  alignment: boolean;
  overflow: boolean;
  truncation: boolean;
  contrast: boolean;
  states: boolean;
  overall: boolean;
  notes: string[];
}

// Resultados globais
const globalReport: TestReport[] = [];

// ============================================
// HELPERS
// ============================================

async function ensureReportDir() {
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
}

async function takeScreenshot(page: Page, name: string): Promise<string> {
  await ensureReportDir();
  const screenshotPath = path.join(REPORT_DIR, `${name}.png`);
  
  // Aguardar estabilização visual
  try {
    await page.waitForLoadState('networkidle', { timeout: 5000 });
  } catch {
    // Fallback: aguardar qualquer elemento visível
    await page.waitForSelector('body', { state: 'visible', timeout: 5000 });
  }
  
  await page.screenshot({ path: screenshotPath, fullPage: false });
  return screenshotPath;
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Filtrar apenas erros do projeto (ignorar dependências externas)
      if (!text.includes('lucide') && 
          !text.includes('unpkg.com') && 
          !text.includes('google-analytics')) {
        errors.push(text);
      }
    }
  });
  
  page.on('pageerror', (err) => {
    const message = err.message;
    if (!message.includes('lucide') && !message.includes('unpkg.com')) {
      errors.push(`PageError: ${message}`);
    }
  });
  
  return errors;
}

function trackAPICalls(page: Page): APICall[] {
  const calls: APICall[] = [];
  
  page.on('response', async (response) => {
    const request = response.request();
    const url = request.url();
    
    // Track apenas APIs do projeto (não recursos estáticos)
    if (url.includes('/api/') || url.includes('openrouter') || url.includes('openai')) {
      const startTime = Date.now();
      const status = response.status();
      const latency = Date.now() - startTime;
      
      calls.push({
        url: url.split('?')[0], // Remove query params
        status,
        latency,
        error: status >= 400 ? await response.text().catch(() => 'Unknown error') : undefined
      });
    }
  });
  
  return calls;
}

async function semanticVisualCheck(page: Page, viewport: string): Promise<VisualCheckResult> {
  // Simulação de check visual semântico (em produção usaria IA)
  const notes: string[] = [];
  
  // Verificações básicas via DOM
  const checks = await page.evaluate(() => {
    const results = {
      overflow: false,
      truncation: false,
      alignment: true,
      contrast: true,
      states: true,
      issues: [] as string[]
    };
    
    // Verificar overflow horizontal
    document.querySelectorAll('*').forEach((el) => {
      if (el.scrollWidth > el.clientWidth + 2) {
        results.overflow = true;
        results.issues.push(`Overflow: ${el.tagName}.${el.className}`);
      }
    });
    
    // Verificar textos truncados (elementos com altura fixa)
    document.querySelectorAll('p, span, div').forEach((el) => {
      const style = window.getComputedStyle(el);
      if (style.maxHeight && el.scrollHeight > parseInt(style.maxHeight)) {
        results.truncation = true;
        results.issues.push(`Truncation: ${el.textContent?.substring(0, 30)}...`);
      }
    });
    
    return results;
  });
  
  if (checks.issues.length > 0) {
    notes.push(...checks.issues.slice(0, 5)); // Limitar a 5 issues
  }
  
  return {
    alignment: checks.alignment,
    overflow: !checks.overflow,
    truncation: !checks.truncation,
    contrast: checks.contrast,
    states: checks.states,
    overall: !checks.overflow && !checks.truncation && checks.alignment,
    notes
  };
}

async function executeStep(
  page: Page,
  flow: string,
  stepName: string,
  viewport: string,
  action: () => Promise<void>
): Promise<TestReport> {
  const startTime = Date.now();
  const consoleErrors = collectConsoleErrors(page);
  const apiCalls = trackAPICalls(page);
  
  const report: TestReport = {
    timestamp: new Date().toISOString(),
    viewport,
    flow,
    step: stepName,
    status: 'PASS',
    consoleErrors: [],
    apiCalls: [],
    duration: 0
  };
  
  try {
    await action();
    
    // Capturar screenshot
    const screenshotName = `${flow}_${stepName}_${viewport}_${Date.now()}`;
    report.screenshot = await takeScreenshot(page, screenshotName);
    
    // Check visual
    report.visualCheck = await semanticVisualCheck(page, viewport);
    
    // Verificar erros de console
    report.consoleErrors = consoleErrors;
    if (consoleErrors.length > 0) {
      report.status = 'FAIL';
      report.severity = '🟡';
    }
    
    // Verificar APIs
    report.apiCalls = apiCalls;
    const failedApis = apiCalls.filter(c => c.status >= 400);
    if (failedApis.length > 0) {
      report.status = 'FAIL';
      report.severity = '🔴';
    }
    
    // Verificar latência
    const slowApis = apiCalls.filter(c => c.latency > LATENCY_THRESHOLDS.error);
    if (slowApis.length > 0) {
      report.status = 'FAIL';
      report.severity = '🔴';
    }
    
  } catch (error) {
    report.status = 'FAIL';
    report.severity = '🔴';
    report.error = error instanceof Error ? error.message : String(error);
    
    // Screenshot do erro
    const screenshotName = `ERROR_${flow}_${stepName}_${viewport}_${Date.now()}`;
    await takeScreenshot(page, screenshotName).catch(() => {});
  }
  
  report.duration = Date.now() - startTime;
  
  // Timeout check
  if (report.duration > STEP_TIMEOUT) {
    report.status = 'FAIL';
    report.severity = '🔴';
    report.error = `Timeout: ${report.duration}ms > ${STEP_TIMEOUT}ms`;
  }
  
  globalReport.push(report);
  return report;
}

function generateReport() {
  const summaryPath = path.join(REPORT_DIR, 'report-summary.json');
  const detailPath = path.join(REPORT_DIR, 'report-failures.json');
  
  // Sumário
  const summary = {
    total: globalReport.length,
    pass: globalReport.filter(r => r.status === 'PASS').length,
    fail: globalReport.filter(r => r.status === 'FAIL').length,
    byViewport: {
      desktop: globalReport.filter(r => r.viewport === 'desktop'),
      tablet: globalReport.filter(r => r.viewport === 'tablet'),
      mobile: globalReport.filter(r => r.viewport === 'mobile')
    },
    blockers: globalReport.filter(r => r.severity === '🔴'),
    degraded: globalReport.filter(r => r.severity === '🟡')
  };
  
  // Detalhes apenas dos FAILs
  const failures = globalReport.filter(r => r.status === 'FAIL');
  
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  fs.writeFileSync(detailPath, JSON.stringify(failures, null, 2));
  
  // Relatório texto
  const textReport = generateTextReport(summary, failures);
  fs.writeFileSync(path.join(REPORT_DIR, 'report.txt'), textReport);
  
  console.log(textReport);
}

function generateTextReport(summary: any, failures: TestReport[]): string {
  let report = `
╔══════════════════════════════════════════════════════════════════════════╗
║          RELATÓRIO DE TESTES E2E - ENGLISH TRAINING APP                  ║
║                    Execução: ${new Date().toLocaleString('pt-BR')}                    ║
╚══════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────────┐
│ SUMÁRIO EXECUTIVO                                                        │
├─────────────────────────────────────────────────────────────────────────┤
│ Total de passos executados:  ${summary.total.toString().padStart(3)}                                    │
│ ✅ PASS:                     ${summary.pass.toString().padStart(3)}                                    │
│ ❌ FAIL:                     ${summary.fail.toString().padStart(3)}                                    │
│                                                                          │
│ Severidade:                                                              │
│ 🔴 Blocker:                  ${summary.blockers.length.toString().padStart(3)}                                    │
│ 🟡 Degradado:                ${summary.degraded.length.toString().padStart(3)}                                    │
└─────────────────────────────────────────────────────────────────────────┘

`;

  // Tabela por viewport
  report += `┌─────────────────────────────────────────────────────────────────────────┐
│ RESULTADOS POR VIEWPORT                                                  │
├──────────────┬────────┬────────┬────────┬────────┬────────────────────────┤
│ Viewport     │ Total  │ Pass   │ Fail   │ Block  │ Degrad                 │
├──────────────┼────────┼────────┼────────┼────────┼────────────────────────┤
`;

  ['desktop', 'tablet', 'mobile'].forEach(vp => {
    const items = summary.byViewport[vp];
    const pass = items.filter((r: any) => r.status === 'PASS').length;
    const fail = items.filter((r: any) => r.status === 'FAIL').length;
    const block = items.filter((r: any) => r.severity === '🔴').length;
    const deg = items.filter((r: any) => r.severity === '🟡').length;
    
    report += `│ ${vp.padEnd(12)} │ ${items.length.toString().padStart(6)} │ ${pass.toString().padStart(6)} │ ${fail.toString().padStart(6)} │ ${block.toString().padStart(6)} │ ${deg.toString().padStart(6)}                 │\n`;
  });

  report += `└──────────────┴────────┴────────┴────────┴────────┴────────────────────────┘\n\n`;

  // Detalhes dos FAILs
  if (failures.length > 0) {
    report += `╔══════════════════════════════════════════════════════════════════════════╗
║ DETALHES DOS FALHAS (FAILS)                                              ║
╚══════════════════════════════════════════════════════════════════════════╝\n\n`;

    failures.forEach((fail, idx) => {
      report += `
───────────────────────────────────────────────────────────────────────────
FALHA #${idx + 1}: ${fail.flow} → ${fail.step}
───────────────────────────────────────────────────────────────────────────
Viewport:     ${fail.viewport}
Severidade:   ${fail.severity || 'N/A'}
Duração:      ${fail.duration}ms
Timestamp:    ${fail.timestamp}

`;

      if (fail.error) {
        report += `ERRO:\n${fail.error}\n\n`;
      }

      if (fail.consoleErrors.length > 0) {
        report += `Console Errors:\n${fail.consoleErrors.map(e => `  • ${e.substring(0, 100)}`).join('\n')}\n\n`;
      }

      if (fail.apiCalls.filter(c => c.status >= 400).length > 0) {
        report += `API Falhas:\n${fail.apiCalls
          .filter(c => c.status >= 400)
          .map(c => `  • ${c.url} → ${c.status} (${c.latency}ms)`)
          .join('\n')}\n\n`;
      }

      if (fail.visualCheck && !fail.visualCheck.overall) {
        report += `Problemas Visuais:\n${fail.visualCheck.notes.map(n => `  • ${n}`).join('\n')}\n\n`;
      }

      if (fail.screenshot) {
        report += `Screenshot: ${fail.screenshot}\n`;
      }
    });
  }

  return report;
}

// ============================================
// SETUP GLOBAL
// ============================================

test.beforeAll(async () => {
  await ensureReportDir();
});

test.afterAll(async () => {
  generateReport();
});

// ============================================
// FLUXOS DE TESTE
// ============================================

for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
  
  test.describe(`Fluxos Críticos - ${viewport.name}`, () => {
    
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      
      // Navegar primeiro, depois limpar estado
      await page.goto(`${BASE_URL}/#/`, { waitUntil: 'networkidle' });
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
    });

    // ============================================
    // FLUXO 1: ONBOARDING E CONFIGURAÇÃO
    // ============================================
    
    test('F1: Onboarding - Configuração de API Key', async ({ page }) => {
      const flow = 'Onboarding';
      
      // Passo 1: Acesso inicial
      await executeStep(page, flow, 'Acesso ao dashboard', viewport.name, async () => {
        await page.goto(`${BASE_URL}/#/`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#dashboard', { state: 'visible', timeout: STEP_TIMEOUT });
      });
      
      // Passo 2: Navegação para settings
      await executeStep(page, flow, 'Navegação para Settings', viewport.name, async () => {
        await page.click('#settings-btn');
        await page.waitForSelector('#settings', { state: 'visible', timeout: STEP_TIMEOUT });
      });
      
      // Passo 3: Seleção de provider
      await executeStep(page, flow, 'Seleção de Provider', viewport.name, async () => {
        await page.waitForSelector('#provider-grid', { state: 'visible', timeout: STEP_TIMEOUT });
        // Clicar em OpenRouter (CORS-friendly)
        await page.click('[data-provider="openrouter"]');
      });
      
      // Passo 4: Inserção de API key (fluxo de erro - key inválida)
      await executeStep(page, flow, 'Validação de API Key inválida', viewport.name, async () => {
        await page.fill('#api-key', 'invalid_key');
        await page.click('#btn-test-connection');
        // Aguardar mensagem de erro
        await page.waitForSelector('.connection-status.error, .toast', { 
          state: 'visible', 
          timeout: STEP_TIMEOUT 
        });
      });
      
      // Passo 5: Formato correto (mock - não testamos com key real)
      await executeStep(page, flow, 'Formatação correta de key', viewport.name, async () => {
        await page.fill('#api-key', 'sk-or-test-key-format');
        const value = await page.inputValue('#api-key');
        expect(value).toMatch(/^sk-or/);
      });
    });

    // ============================================
    // FLUXO 2: SESSÃO DE ESTUDO (STUDY)
    // ============================================
    
    test('F2: Study Session - Fluxo completo de estudo', async ({ page }) => {
      const flow = 'Study Session';
      
      // Passo 1: Iniciar sessão
      await executeStep(page, flow, 'Iniciar novo texto', viewport.name, async () => {
        await page.goto(`${BASE_URL}/#/`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#btn-study', { state: 'visible', timeout: STEP_TIMEOUT });
        await page.click('#btn-study');
        await page.waitForSelector('#study.view--active', { timeout: STEP_TIMEOUT });
      });
      
      // Passo 2: Verificar carregamento do texto
      await executeStep(page, flow, 'Carregamento de passagem', viewport.name, async () => {
        await page.waitForFunction(() => {
          const el = document.getElementById('passage-text');
          return el && el.innerText.trim().length > 50;
        }, { timeout: STEP_TIMEOUT });
      });
      
      // Passo 3: Seleção de resposta
      await executeStep(page, flow, 'Seleção de alternativa', viewport.name, async () => {
        await page.waitForSelector('[data-option]', { state: 'visible', timeout: STEP_TIMEOUT });
        await page.click('[data-option="A"]');
        await page.waitForSelector('#confidence-section', { state: 'visible', timeout: STEP_TIMEOUT });
      });
      
      // Passo 4: Seleção de confiança
      await executeStep(page, flow, 'Seleção de nível de confiança', viewport.name, async () => {
        await page.click('[data-confidence="2"]'); // Confiante
        await page.waitForSelector('#feedback-section', { state: 'visible', timeout: STEP_TIMEOUT });
      });
      
      // Passo 5: Feedback e próxima questão
      await executeStep(page, flow, 'Visualização de feedback', viewport.name, async () => {
        const feedback = await page.locator('#feedback-section').isVisible();
        expect(feedback).toBe(true);
      });
      
      // Passo 6: Navegação mobile (tabs)
      if (viewport.name === 'mobile') {
        await executeStep(page, flow, 'Navegação mobile - tabs', viewport.name, async () => {
          // Verificar tabs existem
          await page.waitForSelector('.study-tab', { state: 'visible', timeout: STEP_TIMEOUT });
          // Clicar na tab de questão
          await page.click('[data-tab="question"]');
          await page.waitForSelector('#question-panel', { state: 'visible', timeout: STEP_TIMEOUT });
        });
      }
    });

    // ============================================
    // FLUXO 3: REVISÃO SRS
    // ============================================
    
    test('F3: SRS Review - Fluxo de revisão espaçada', async ({ page, context }) => {
      const flow = 'SRS Review';
      
      // Setup: Seed card SRS devido
      await page.goto(`${BASE_URL}/#/`, { waitUntil: 'networkidle' });
      await page.evaluate(() => {
        // Criar card SRS devido
        const db = indexedDB.open('english_training', 7);
        db.onsuccess = (e: any) => {
          const database = e.target.result;
          const tx = database.transaction('srs_cards', 'readwrite');
          const store = tx.objectStore('srs_cards');
          store.put({
            id: 'test_srs_card',
            questionId: 'test_q_1',
            interval: 1,
            repetitions: 2,
            easeFactor: 2.5,
            nextReview: new Date().toISOString(), // Devido agora
            history: []
          });
        };
      });
      
      // Passo 1: Acessar lista de revisões
      await executeStep(page, flow, 'Acesso à lista de revisões', viewport.name, async () => {
        await page.goto(`${BASE_URL}/#/review`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#review-content', { state: 'visible', timeout: STEP_TIMEOUT });
      });
      
      // Passo 2: Iniciar revisão (se houver cards)
      const hasDueCards = await page.locator('#btn-start-srs-review').isVisible().catch(() => false);
      
      if (hasDueCards) {
        await executeStep(page, flow, 'Iniciar sessão SRS', viewport.name, async () => {
          await page.click('#btn-start-srs-review');
          await page.waitForSelector('#srs-review.view--active', { timeout: STEP_TIMEOUT });
        });
        
        // Passo 3: Rating do card
        await executeStep(page, flow, 'Rating do card SRS', viewport.name, async () => {
          await page.waitForSelector('[data-rating]', { state: 'visible', timeout: STEP_TIMEOUT });
          await page.click('[data-rating="3"]'); // Good
        });
      } else {
        // Marcar como não-spec (comportamento esperado sem dados)
        await executeStep(page, flow, 'Lista vazia - sem cards devidos', viewport.name, async () => {
          await page.waitForSelector('.empty-state, #review-list', { timeout: STEP_TIMEOUT });
        });
      }
    });

    // ============================================
    // FLUXO 4: EXPEDIÇÃO (ROGUELITE)
    // ============================================
    
    test('F4: Expedition - Fluxo de jogo completo', async ({ page }) => {
      const flow = 'Expedition';
      
      // Passo 1: Acessar expedição
      await executeStep(page, flow, 'Acesso ao modo Expedição', viewport.name, async () => {
        await page.goto(`${BASE_URL}/#/expedition`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#expedition-content', { state: 'visible', timeout: STEP_TIMEOUT });
      });
      
      // Passo 2: Selecionar andar e classe
      await executeStep(page, flow, 'Seleção de andar e classe', viewport.name, async () => {
        // Verificar se há run ativa ou iniciar nova
        const hasActiveRun = await page.locator('.expedition-map').isVisible().catch(() => false);
        
        if (!hasActiveRun) {
          await page.click('[data-floor="1"]');
          await page.click('[data-class="scholar"]');
          await page.click('#btn-start-expedition');
        }
        
        await page.waitForSelector('.expedition-map, .expedition-hub', { 
          state: 'visible', 
          timeout: STEP_TIMEOUT 
        });
      });
      
      // Passo 3: Entrar em uma sala
      await executeStep(page, flow, 'Entrada em sala', viewport.name, async () => {
        const roomVisible = await page.locator('.room-node, .expedition-room').isVisible().catch(() => false);
        if (roomVisible) {
          await page.click('.room-node:not(.completed)');
          await page.waitForSelector('.expedition-question, .combat-overlay', { 
            state: 'visible', 
            timeout: STEP_TIMEOUT 
          });
        }
      });
      
      // Passo 4: Responder questão da sala
      await executeStep(page, flow, 'Resposta em sala de combate', viewport.name, async () => {
        const questionVisible = await page.locator('[data-option]').isVisible().catch(() => false);
        if (questionVisible) {
          await page.click('[data-option="A"]');
          await page.click('#btn-submit-answer');
          await page.waitForSelector('.room-result, .combat-result', { 
            state: 'visible', 
            timeout: STEP_TIMEOUT 
          });
        }
      });
    });

    // ============================================
    // FLUXO 5: MODO SIMULADO (EXAM)
    // ============================================
    
    test('F5: Exam Mode - Simulado FUVEST', async ({ page }) => {
      const flow = 'Exam Mode';
      
      // Passo 1: Acessar modo simulado
      await executeStep(page, flow, 'Acesso ao modo Simulado', viewport.name, async () => {
        await page.goto(`${BASE_URL}/#/exam`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#exam.view--active', { state: 'visible', timeout: STEP_TIMEOUT });
      });
      
      // Passo 2: Iniciar simulado
      await executeStep(page, flow, 'Iniciar simulado', viewport.name, async () => {
        await page.waitForSelector('#btn-start-exam', { state: 'visible', timeout: STEP_TIMEOUT });
        await page.click('#btn-start-exam');
        await page.waitForSelector('.exam-question, .exam-timer', { 
          state: 'visible', 
          timeout: STEP_TIMEOUT 
        });
      });
      
      // Passo 3: Timer visível
      await executeStep(page, flow, 'Timer do simulado', viewport.name, async () => {
        const timerVisible = await page.locator('.exam-timer, #exam-timer').isVisible().catch(() => false);
        expect(timerVisible).toBe(true);
      });
      
      // Passo 4: Navegação entre questões
      await executeStep(page, flow, 'Navegação entre questões', viewport.name, async () => {
        const hasNav = await page.locator('.exam-nav, .question-nav').isVisible().catch(() => false);
        if (hasNav) {
          await page.click('.question-nav [data-question="2"]');
          await page.waitForTimeout(500);
        }
      });
    });

    // ============================================
    // FLUXO 6: ANALYTICS E ESTATÍSTICAS
    // ============================================
    
    test('F6: Analytics - Visualização de estatísticas', async ({ page }) => {
      const flow = 'Analytics';
      
      // Passo 1: Acessar analytics
      await executeStep(page, flow, 'Acesso à página de Analytics', viewport.name, async () => {
        await page.goto(`${BASE_URL}/#/analytics`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#analytics.view--active', { state: 'visible', timeout: STEP_TIMEOUT });
      });
      
      // Passo 2: Carregamento de estatísticas
      await executeStep(page, flow, 'Carregamento de estatísticas', viewport.name, async () => {
        await page.waitForSelector('#stats-view', { state: 'visible', timeout: STEP_TIMEOUT });
        // Aguardar carregamento (remover loading)
        await page.waitForFunction(() => {
          const el = document.querySelector('.stats-loading');
          return !el || el.getAttribute('style')?.includes('display: none');
        }, { timeout: STEP_TIMEOUT });
      });
      
      // Passo 3: Verificar elementos de stats
      await executeStep(page, flow, 'Verificação de elementos visuais', viewport.name, async () => {
        const hasStats = await page.locator('.stat-card, .stats-grid').isVisible().catch(() => false);
        expect(hasStats).toBe(true);
      });
    });

    // ============================================
    // FLUXO 7: FLASHCARDS E VOCABULÁRIO
    // ============================================
    
    test('F7: Flashcards - Gestão de vocabulário', async ({ page }) => {
      const flow = 'Flashcards';
      
      // Passo 1: Acessar flashcards
      await executeStep(page, flow, 'Acesso à lista de flashcards', viewport.name, async () => {
        await page.goto(`${BASE_URL}/#/flashcard-list`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#flashcard-list', { state: 'visible', timeout: STEP_TIMEOUT });
      });
      
      // Passo 2: Verificar lista (pode estar vazia)
      await executeStep(page, flow, 'Verificação da lista', viewport.name, async () => {
        const hasList = await page.locator('.flashcard-list, .fc-card-list, .empty-state').isVisible().catch(() => false);
        expect(hasList).toBe(true);
      });
      
      // Passo 3: Botão de deck
      await executeStep(page, flow, 'Acesso ao deck via dashboard', viewport.name, async () => {
        await page.goto(`${BASE_URL}/#/`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#btn-deck', { state: 'visible', timeout: STEP_TIMEOUT });
        await page.click('#btn-deck');
        // Pode abrir modal ou navegar
        await page.waitForTimeout(1000);
      });
    });

    // ============================================
    // FLUXO 8: BACKUP E RESTAURAÇÃO
    // ============================================
    
    test('F8: Backup - Export/Import de dados', async ({ page }) => {
      const flow = 'Backup';
      
      // Passo 1: Acessar settings
      await executeStep(page, flow, 'Acesso às configurações', viewport.name, async () => {
        await page.goto(`${BASE_URL}/#/settings`, { waitUntil: 'networkidle' });
        await page.waitForSelector('#settings', { state: 'visible', timeout: STEP_TIMEOUT });
      });
      
      // Passo 2: Verificar botão de export
      await executeStep(page, flow, 'Verificação de botão Exportar', viewport.name, async () => {
        await page.waitForSelector('#btn-export', { state: 'visible', timeout: STEP_TIMEOUT });
      });
      
      // Passo 3: Verificar input de import
      await executeStep(page, flow, 'Verificação de input Importar', viewport.name, async () => {
        await page.waitForSelector('#import-file', { state: 'attached', timeout: STEP_TIMEOUT });
      });
    });

    // ============================================
    // FLUXO 9: FLUXOS DE ERRO E EDGE CASES
    // ============================================
    
    test('F9: Error Flows - Estados de erro e recuperação', async ({ page }) => {
      const flow = 'Error Flows';
      
      // Passo 1: Rota inexistente
      await executeStep(page, flow, 'Rota 404/inválida', viewport.name, async () => {
        await page.goto(`${BASE_URL}/#/nonexistent-route`, { waitUntil: 'networkidle' });
        // Deve cair no dashboard ou mostrar 404
        await page.waitForSelector('#app', { state: 'visible', timeout: STEP_TIMEOUT });
      });
      
      // Passo 2: Ação sem dados (banco vazio)
      await executeStep(page, flow, 'Study sem dados disponíveis', viewport.name, async () => {
        // Limpar banco simulado
        await page.evaluate(() => {
          localStorage.setItem('bank_cleared', 'true');
        });
        await page.goto(`${BASE_URL}/#/study`, { waitUntil: 'networkidle' });
        // Deve mostrar mensagem de erro ou vazio
        await page.waitForTimeout(2000);
      });
      
      // Passo 3: Navegação por teclado
      await executeStep(page, flow, 'Navegação por teclado', viewport.name, async () => {
        await page.goto(`${BASE_URL}/#/`, { waitUntil: 'networkidle' });
        await page.keyboard.press('Tab');
        await page.keyboard.press('Enter');
        // Verificar foco visível
        const focused = await page.locator(':focus').isVisible().catch(() => false);
        expect(focused).toBe(true);
      });
    });

    // ============================================
    // FLUXO 10: NAVEGAÇÃO PRINCIPAL (Bottom Nav)
    // ============================================
    
    test('F10: Navigation - Navegação principal entre views', async ({ page }) => {
      const flow = 'Navigation';
      
      const routes = [
        { hash: '#/', selector: '#dashboard', name: 'Dashboard' },
        { hash: '#/study', selector: '#study', name: 'Study' },
        { hash: '#/analytics', selector: '#analytics', name: 'Analytics' },
        { hash: '#/settings', selector: '#settings', name: 'Settings' }
      ];
      
      for (const route of routes) {
        await executeStep(page, flow, `Navegação para ${route.name}`, viewport.name, async () => {
          await page.goto(`${BASE_URL}/${route.hash}`, { waitUntil: 'networkidle' });
          await page.waitForSelector(route.selector, { 
            state: 'visible', 
            timeout: STEP_TIMEOUT 
          });
          
          // Verificar classe ativa
          const isActive = await page.locator(route.selector).evaluate(el => 
            el.classList.contains('view--active')
          );
          expect(isActive).toBe(true);
        });
      }
    });

  });
}
