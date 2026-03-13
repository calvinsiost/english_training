# Extrator de Questões FUVEST

Scripts para extrair texto das provas de proficiência da FUVEST.

## 📁 Estrutura

```
scripts/
├── pdfs/           # Coloque os PDFs das provas aqui
├── output/         # Textos extraídos e análises
├── extract_fuvest_v2.py   # Script principal
└── README.md       # Este arquivo
```

## 🚀 Como Usar

### 1. Baixar os PDFs

Acesse: https://www.fuvest.br/acervo-do-candidato/

Baixe as provas de **Inglês** (grupo E):
- 2026 - 2ª edição
- 2026 - 1ª edição
- 2025 - 2ª edição
- 2025 - 1ª edição
- 2024 - Manhã
- 2024 - Tarde

Renomeie para:
```
2026-2ed.pdf
2026-1ed.pdf
2025-2ed.pdf
2025-1ed.pdf
2024-manha.pdf
2024-tarde.pdf
```

Coloque em `scripts/pdfs/`

### 2. Extrair Texto

```bash
cd scripts
python extract_fuvest_v2.py
```

### 3. Verificar Saída

O script gera:
- `{prova}.txt` - Texto completo extraído
- `{prova}_analysis.json` - Análise do conteúdo

### 4. Estruturar Questões

O formato final deve ser:

```json
{
  "schema_version": "3.3",
  "provas": [
    {
      "id": "2026-2ed",
      "ano": "2025/2026",
      "edicao": "2ª Edição",
      "passages": [
        {
          "id": "2026-2ed-p1",
          "text": "Texto em inglês...",
          "source": "The New York Times...",
          "topic": "technology_ai",
          "questions": [
            {
              "id": "2026-2ed-q01",
              "question_type": "main_idea",
              "question_text": "Conforme o texto...",
              "options": ["(A)...", "(B)...", "(C)...", "(D)...", "(E)..."],
              "correct_answer": "B",
              "correct_explanation": "..."
            }
          ]
        }
      ]
    }
  ]
}
```

## 📝 Notas

- As provas da FUVEST têm **6 passagens** com **5 questões cada** = 30 questões
- Textos são de fontes reais (NYT, Guardian, etc.) adaptados
- Questões estão em **português**, textos em **inglês**

## 🤖 Alternativa: Geração com IA

Se a extração manual for muito trabalhosa, você pode:

1. Ler o texto extraído (.txt)
2. Usar o modo "Nova Passagem" do app
3. Pedir para a IA gerar questões no estilo FUVEST baseadas no texto

O prompt few-shot já está configurado no app para gerar questões no formato correto.
