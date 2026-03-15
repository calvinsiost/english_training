# Plano de Implementação - English Training App

## Módulos Implementados ✅

| Módulo | Status | Descrição |
|--------|--------|-----------|
| Core PWA | ✅ | Service Worker, IndexedDB, Offline support |
| Question Bank | ✅ | 41 passagens, 184 questões, filtros por fonte/ano |
| AI Providers | ✅ | OpenRouter, Anthropic, Gemini, etc. com CORS handling |
| Help Features | ✅ | Tradução, aula rápida, explicação de alternativas, TTS |
| Study Session | ✅ | Interface de estudo com navegação questão a questão |

---

## Módulos Pendentes 🚧

### **FASE 1: Fundamentos de Aprendizado (Prioridade Alta)**

#### 1.1 Sistema SRS (Spaced Repetition) 📚
**Objetivo**: Revisão espaçada de questões erradas

**Features**:
- Algoritmo SM-2 (SuperMemo 2) simplificado
- Review diário com cards devidos
- Categorias: Novo, Aprendendo, Revisar, Dominated
- Notificação push para reviews pendentes
- Estatística de retenção

**Implementação**:
```javascript
// Novo store: srs_schedule
{
  question_id: "...",
  interval: 1,        // dias até próxima revisão
  repetitions: 0,     // vezes respondida corretamente
  ease_factor: 2.5,   // fácil = intervalo maior
  next_review: Date,
  history: []
}
```

**Arquivos**:
- `js/srs-engine.js` - Algoritmo SM-2
- `js/srs-review.js` - UI de review
- `js/srs-notifications.js` - Push notifications

**Estimativa**: 3-4 dias

---

#### 1.2 Sistema de Estatísticas 📊
**Objetivo**: Analytics de desempenho do usuário

**Features**:
- Dashboard com gráficos de progresso
- Taxa de acerto por: fonte, ano, tópico gramatical
- Streak diário (dias consecutivos de estudo)
- Tempo médio por questão
- Previsão de nota na FUVEST

**Gráficos**:
- Linha: progresso ao longo do tempo
- Pizza: distribuição de acertos/erros
- Barras: desempenho por instituição
- Heatmap: calendário de atividade

**Implementação**:
```javascript
// Novo store: analytics
{
  date: "2026-03-14",
  questions_attempted: 10,
  questions_correct: 7,
  time_spent: 1800,  // segundos
  passages_read: 2,
  srs_reviews: 15
}
```

**Arquivos**:
- `js/analytics.js` - Cálculos e agregações
- `js/stats-dashboard.js` - Visualização
- CSS para gráficos simples (sem biblioteca externa)

**Estimativa**: 2-3 dias

---

#### 1.3 Histórico de Sessões 📝
**Objetivo**: Registro completo das sessões de estudo

**Features**:
- Lista de sessões anteriores
- Resumo por sessão: questões, acertos, tempo
- Detalhamento questão a questão
- Filtro por data/fonte

**Implementação**:
```javascript
// Novo store: study_sessions
{
  id: "uuid",
  date: Date,
  passage_ids: [],
  questions: [{
    question_id: "...",
    correct: boolean,
    confidence: 1-4,
    time_spent: 45,
    help_used: ['translation', 'lesson']
  }],
  total_time: 1200
}
```

**Arquivos**:
- `js/session-history.js` - CRUD de sessões

**Estimativa**: 1-2 dias

---

### **FASE 2: Aprimoramento de Estudo (Prioridade Média-Alta)**

#### 2.1 Modo Simulado (Timer) ⏱️
**Objetivo**: Simular condições reais da prova

**Features**:
- Timer regressivo configurável (padrão: 4 horas FUVEST)
- Pausa limitada (2x por simulado)
- Navegação bloqueada entre questões até responder
- Resumo final com nota estimada
- Comparação com notas de corte históricas

**UI**:
- Barra de tempo visível
- Alerta quando faltam 30/10/5 minutos
- Tela de resultado com gráfico de desempenho

**Arquivos**:
- `js/exam-mode.js` - Lógica do timer
- `js/exam-results.js` - Resultados e comparação

**Estimativa**: 2-3 dias

---

#### 2.2 Sistema de Anotações 📌
**Objetivo**: Notas pessoais por questão

**Features**:
- Botão "Adicionar Nota" em cada questão
- Rich text simples (negrito, itálico, listas)
- Tags para organização (ex: "gramática", "vocabulário")
- Busca nas anotações
- Exportar anotações

**Implementação**:
```javascript
// Novo store: notes
{
  question_id: "...",
  content: "...",
  tags: ["gramática", "verbo"],
  created_at: Date,
  updated_at: Date
}
```

**Arquivos**:
- `js/notes-system.js` - CRUD de notas

**Estimativa**: 2 dias

---

#### 2.3 Modo Escuro/Claro 🌙☀️
**Objetivo**: Temas visuais

**Features**:
- Toggle no header
- Persistência em localStorage
- Detecção de preferência do sistema
- Transição suave entre temas

**Cores Dark**:
```css
--bg-primary: #0f172a;
--bg-secondary: #1e293b;
--text-primary: #f1f5f9;
--accent: #4eadea;
```

**Arquivos**:
- CSS variáveis atualizadas
- `js/theme-switcher.js`

**Estimativa**: 1 dia

---

### **FASE 3: Ferramentas de Vocabulario (Prioridade Média)**

#### 3.1 Flashcards de Vocabulário 🎴
**Objetivo**: Cartões de memória das palavras traduzidas

**Features**:
- Auto-geração de flashcards ao traduzir
- Deck "Palavras da FUVEST"
- Sistema SRS próprio para flashcards
- Modo revisão: frente/verso
- Importar/exportar decks

**Implementação**:
```javascript
// Novo store: flashcards
{
  id: "uuid",
  word: "unprecedented",
  translation: "sem precedentes",
  context: "The situation was unprecedented...",
  deck: "FUVEST-2026",
  srs: { interval, repetitions, ease_factor, next_review }
}
```

**Arquivos**:
- `js/flashcards.js` - Lógica dos cards
- `js/flashcard-ui.js` - Interface de review

**Estimativa**: 3-4 dias

---

#### 3.2 Glossário Pessoal 📖
**Objetivo**: Dicionário das palavras pesquisadas

**Features**:
- Lista alfabética das traduções
- Busca rápida
- Ordenação por frequência/recência
- Exportar para CSV/Anki

**Arquivos**:
- `js/glossary.js`

**Estimativa**: 1-2 dias

---

### **FASE 4: Gamificação e Social (Prioridade Média-Baixa)**

#### 4.1 Sistema de Conquistas 🏆
**Objetivo**: Motivação através de achievements

**Conquistas sugeridas**:
- 🎯 "Primeira Questão" - Responder 1 questão
- 📚 "Maratonista" - 7 dias de streak
- 🧠 "Expert FUVEST" - 80% de acerto em 50 questões FUVEST
- 🌍 "Poliglota" - Traduzir 100 palavras
- ⚡ "Velocista" - Responder questão em < 30s
- 🎓 "Mestre do Inglês" - Completar todas as questões

**Implementação**:
```javascript
// Novo store: achievements
{
  id: "first_question",
  name: "Primeira Questão",
  description: "Responda sua primeira questão",
  icon: "target",
  unlocked_at: Date,
  hidden: false
}
```

**Arquivos**:
- `js/achievements.js` - Lógica de desbloqueio
- `js/achievements-ui.js` - Showcase

**Estimativa**: 2-3 dias

---

#### 4.2 Comparativo FUVEST 📈
**Objetivo**: Contextualizar performance com notas reais

**Features**:
- Notas de corte históricas FUVEST (importar dados)
- Simulador: "Qual minha chance de passar?"
- Meta personalizada baseada no curso desejado
- Progresso em relação à meta

**Dados necessários**:
- Notas de corte 2020-2026 por curso
- Pesos das provas (depende do curso)

**Arquivos**:
- `data/fuvest-cutoffs.json`
- `js/fuvest-simulator.js`

**Estimativa**: 2 dias

---

### **FASE 5: Import/Export e Sync (Prioridade Baixa)**

#### 5.1 Backup e Restauração 💾
**Objetivo**: Portabilidade de dados

**Features**:
- Exportar todos os dados (JSON)
- Importar de arquivo
- Auto-backup local periódico
- Sincronização opcional (future: cloud)

**Arquivos**:
- `js/backup-manager.js`

**Estimativa**: 1-2 dias

---

## Priorização Sugerida

```
Semana 1: SRS + Estatísticas básicas
Semana 2: Modo Simulado + Anotações
Semana 3: Flashcards + Glossário
Semana 4: Gamificação + Polish
```

## Arquitetura de Stores (IndexedDB)

```
meta              → configurações gerais
question_bank     → passagens e questões
srs_schedule      → agendamento de revisão
study_sessions    → histórico de sessões
analytics         → dados estatísticos diários
notes             → anotações do usuário
flashcards        → cartões de vocabulário
achievements      → conquistas desbloqueadas
```

## Custos de API (estimativa)

| Feature | Chamadas/dia | Tokens/mês | Custo (OpenRouter) |
|---------|--------------|------------|-------------------|
| Tradução | 20 | ~30K | ~$0.05 |
| Aula Rápida | 10 | ~50K | ~$0.08 |
| Alternativas | 5 | ~40K | ~$0.06 |
| **Total** | **35** | **~120K** | **~$0.20/mês** |

---

## Checklist de Melhoria e Padronizacao (UI/UX/Bugs)

### Fase 1 - Fixes Criticos de Estrutura HTML

- [x] Remover `<section id="exam">` duplicada em `index.html`
- [x] Remover `<section id="analytics">` duplicada em `index.html`
- [x] Confirmar que `window.appReady = true` esta presente em `js/app.js` apos init completa
- [x] Fix do syntax error em `js/app.js` (passageTab.classList.add fora do bloco if, `}` extra fechando funcao prematuramente)
- [x] Fix do IDB transaction auto-abort no loop de idbPut (bankStore.put sem await individual)

### Fase 2 - Padronizar Botao Voltar em Todas as Views

- [x] **exam**: Adicionado botao Voltar + `.view-header`
- [x] **analytics**: Trocado `onclick` inline por `data-back` attribute
- [x] **sessions**: Trocado `onclick` inline por `data-back` attribute
- [x] **review**: Trocado `onclick="router.navigate('#/')"` inline por `data-back` attribute
- [x] **settings**: Adicionado `data-back` ao botao existente, classe `.view-header`
- [x] **study / srs-review**: Mantidos event listeners especificos (tem logica de encerrar sessao)
- [x] Event listener delegado unico em `js/app.js` para `[data-back]`
- [x] Padronizada estrutura `.view-header` em analytics, sessions, review, exam, settings

### Fase 3 - Corrigir Barras de Rolagem Indesejadas

- [x] `css/components.css`: Removido `max-height: 50vh` do `.passage-container`
- [x] `css/exam-mode.css`: Aumentado `max-height` de `.exam-passage` de 300px para 60vh
- [x] `css/review.css`: Removido `max-height: 60vh` do `.review-list`
- [x] `css/review.css`: Aumentado `max-height` de `.srs-passage-text` de 200px para 40vh
- [ ] `css/study-layout.css`: Revisar layout do study mobile (overflow hidden + filhos absolute)

### Fase 4 - Unificar Variaveis CSS (3 convencoes conflitantes)

- [x] Aliases ja existiam em `css/variables.css` (linhas 106-130) -- verificado e completo

### Fase 5 - Substituir Valores Hardcoded

- [x] `css/review.css`: Trocados `padding: 16px/20px` por `var(--space-4)/var(--space-5)`
- [x] `css/review.css`: Trocados `border-radius: 8px/12px` por `var(--radius-xl)`
- [x] `css/review.css`: Trocadas cores hardcoded dos botoes SRS por `var(--color-error/warning/info/success)`
- [x] `css/components.css`: Removidos `!important` do padding-bottom de `.main-content`
- [x] Removida `.review-header` CSS (usa `.view-header` padronizada agora)

### Fase 6 - Padronizar Overlays e Modais

- [ ] `js/review.js`: Padronizar overlay SRS (usa `document.body.appendChild` com `onclick` inline)
- [ ] `js/flashcards.js`: Padronizar modal flashcard (mesmo padrao de body append)
- [ ] Criar classe `.overlay` consistente e fechar com `data-close-overlay` attribute

### Fase 7 - Botao Flashcards Sem Rota

- [x] Verificado: `FlashcardReviewUI.startReview()` abre modal de revisao
- [x] Adicionado event listener em `#btn-deck` que cria `FlashcardReviewUI` e inicia revisao
- [x] Fallback com toast informativo se nao ha flashcards

### Fase 8 - Bottom Nav: Highlight em Sub-views

- [x] `switchView()`: Mapeamento `review/srs-review/sessions` -> "Inicio", `exam` -> "Estudar"

### Fase 9 - Null Checks em Acessos DOM

- [x] `loadPassageIntoUI`: Null checks em confidence-section, feedback-section, next-container
- [x] `handleOptionSelect`: Null check em confidence-section
- [x] `handleConfidenceSelect`: Null checks em feedback-section e confidence-section

### Fase 10 - Tema Claro: Cores Faltando

- [x] `css/variables.css`: Adicionadas `--color-success/warning/error/info` no `[data-theme="light"]`

### Fase 11 - Daily Goal Nao Persiste

- [x] Handler do input salva em `localStorage.setItem('dailyGoal', value)`
- [x] Init do app carrega valor salvo e atualiza input + display

### Fase 12 - Emojis em Vez de Icones Lucide

- [x] `index.html` exam start: Trocado emoji por `<i data-lucide="file-edit">`
- [x] `index.html` help features: Trocados 5 emojis por icones Lucide equivalentes

### Fase 13 - Breakpoints Responsivos

- [ ] Documentar breakpoints padrao
- [ ] Verificar conflitos entre breakpoints de diferentes CSS files

### Fase 14 - Limpeza Geral

- [ ] Remover CSS nao utilizado (classes orfas)
- [ ] Remover `console.log` de debug desnecessarios
- [ ] `sw.js`: Verificar que STATIC_ASSETS lista CSS files com versao correta
- [ ] Verificar temas light/dark aplicam corretamente com aliases

### Verificacao Final

- [x] Rodar `npx playwright test tests/quick-validation-2026.spec.ts` -- 7/7 passando
- [ ] Desktop 1200px: Navegar todas as views, verificar botao Voltar, sem scrollbars indesejadas
- [ ] Mobile 375px: Verificar scroll, tabs, layout responsivo
- [ ] Tema claro: Cores de success/warning/error/info corretas
- [ ] Tema escuro: Tudo funcional
- [ ] Flashcards: Botao abre corretamente
- [ ] Bottom nav: Highlight correto em todas as views e sub-views
- [ ] Daily goal: Persiste apos reload
