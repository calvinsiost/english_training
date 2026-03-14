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

## Próximos Passos Imediatos

Quer que eu implemente algum desses módulos agora? Recomendo começar pelo:

1. **Sistema SRS** - Maior impacto no aprendizado
2. **Estatísticas** - Feedback visual importante
3. **Modo Simulado** - Diferencial para vestibulandos

Qual você quer priorizar?
