# Análise da Jornada do Usuário - Problemas Encontrados

## 🚨 Problemas Críticos

### 1. Service Worker Falhando
**Erro:** `[SW] Registration failed: TypeError: Cannot read properties of undefined (reading 'scope')`

**Impacto:** Cache não funciona, app fica lento (4s de load)

**Causa:** O SW pode estar cacheando versões antigas ou há um erro no registro

---

### 2. View #/review Confusa
**Problema:** A view `#/review` está mostrando botões SRS ("De Novo < 1 min") em vez de uma lista de revisões

**Impacto:** Usuário clica em "Revisões" no dashboard e vê cartões SRS em vez da lista de questões para revisar

**Expectativa:** 
- Lista de questões marcadas para revisão
- Filtros por data/instituição
- Opção de iniciar revisão

**Realidade:**
- Cards SRS diretos (again/hard/good/easy)
- Sem contexto da questão
- Fluxo confuso

---

### 3. Study View Vazia às Vezes
**Problema:** "Very little text on study page — may not be loading content"

**Impacto:** Usuário clica "Nova Passagem" e não vê o texto da passagem

**Possíveis causas:**
- Race condition no carregamento do IndexedDB
- startStudySession() falhando silenciosamente

---

### 4. Múltiplas Views Visíveis
**Problema:** Teste encontrou elementos de diferentes views ao mesmo tempo
- Botão "Começar Simulado" (exam) aparecendo na view de study
- Conteúdo de review misturado com study

**Impacto:** Interface confusa, elementos sobrepostos

---

### 5. Loading Lento
**Problema:** 4 segundos para carregar o dashboard

**Causas:**
- Service Worker falhando
- Muitos scripts carregando
- IndexedDB sendo inicializado na blocking thread

---

### 6. Acessibilidade
**Problema:** 14 inputs sem labels

---

## 💡 Soluções Propostas

### Fix 1: Corrigir Service Worker
- Adicionar verificação de erro mais robusta
- Aumentar versão do cache
- Adicionar timeout no registro

### Fix 2: Separar Views Corretamente
- Garantir que apenas uma view tenha `view--active`
- Adicionar CSS mais específico
- Verificar ordem de elementos no DOM

### Fix 3: Fluxo de Review
- Criar tela intermediária listando questões pendentes
- Botão "Iniciar Revisão" que leva aos cards SRS
- Mostrar estatísticas de revisão

### Fix 4: Loading State no Study
- Adicionar spinner/skeleton enquanto carrega passagem
- Retry automático se falhar
- Mensagem de erro clara se não houver passagens

### Fix 5: Performance
- Lazy loading de módulos
- Carregar IndexedDB de forma não-bloqueante
- Inline CSS crítico

---

## 🎯 Prioridade de Fixes

1. **Alta:** Fix Service Worker (performance)
2. **Alta:** Fix Review view (usabilidade)
3. **Média:** Fix Study view loading (funcionalidade)
4. **Média:** Separar views (UI/UX)
5. **Baixa:** Labels de acessibilidade
