# English Training

Preparação para o Exame de Proficiência em Inglês da FUVEST (Universidade de São Paulo).

## 🎯 Objetivo

Aplicativo de treinamento focado em reading comprehension para o exame de proficiência da FUVEST, com:
- **180+ questões reais** das provas 2024-2026
- Geração de questões via IA (few-shot com exemplos reais)
- Sistema SRS (Spaced Repetition) para vocabulário
- Analytics de desempenho e calibração de confiança
- Funcionamento 100% offline após carregamento inicial

## 🚀 Como usar

1. Acesse: `https://calvinsiost.github.io/english_training/`
2. Configure sua API key (OpenAI/Anthropic) em Configurações
3. Comece a estudar!

## 🏗️ Estrutura do Projeto

```
english_training/
├── index.html              # SPA principal
├── manifest.json           # PWA manifest
├── sw.js                   # Service Worker (offline)
├── css/
│   ├── variables.css       # Design tokens
│   ├── base.css           # Reset e tipografia
│   └── components.css     # Componentes UI
├── js/
│   ├── app.js             # Entry point
│   ├── config/
│   │   ├── constants.js   # Enums e constantes
│   │   └── ai-providers.js # Configuração de APIs
│   └── ...
├── data/
│   └── initial-bank.json  # Banco inicial de questões
└── .github/workflows/
    └── deploy.yml         # GitHub Pages deploy
```

## 📋 Roadmap

- [x] Estrutura base (HTML/CSS/JS)
- [x] IndexedDB + question bank
- [x] Service Worker (offline)
- [ ] Transcrição das 6 provas FUVEST (180 questões)
- [ ] FSRS integration
- [ ] Analytics completo
- [ ] Flashcards com enrichment

## 📝 Licença

Questões FUVEST © Fundação Universitária para o Vestibular - disponibilizadas para fins educacionais.
Código: ver LICENSE.

---

**Spec:** v3.3 | GitHub Pages | PWA Enabled