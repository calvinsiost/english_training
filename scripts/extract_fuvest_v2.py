#!/usr/bin/env python3
"""
Extrator de questões FUVEST de PDFs
Versão 2: Suporta PDFs locais + download
"""

import pdfplumber
import json
import re
from pathlib import Path
from typing import List, Dict

def extract_text_from_pdf(pdf_path: Path) -> str:
    """Extrai texto completo do PDF usando pdfplumber"""
    text_parts = []
    
    try:
        with pdfplumber.open(pdf_path) as pdf:
            print(f"  PDF tem {len(pdf.pages)} páginas")
            for i, page in enumerate(pdf.pages, 1):
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(f"=== PÁGINA {i} ===\n{page_text}")
                if i % 5 == 0:
                    print(f"    Processadas {i} páginas...")
    except Exception as e:
        print(f"  ERRO: {e}")
        return ""
    
    return "\n\n".join(text_parts)

def clean_text(text: str) -> str:
    """Limpa e normaliza o texto extraído"""
    # Remove múltiplos espaços
    text = re.sub(r' +', ' ', text)
    # Remove linhas vazias excessivas
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def process_pdf(pdf_path: Path, output_dir: Path):
    """Processa um único PDF"""
    print(f"\n{'='*60}")
    print(f"Processando: {pdf_path.name}")
    print(f"{'='*60}")
    
    if not pdf_path.exists():
        print(f"ERRO: Arquivo não encontrado: {pdf_path}")
        return None
    
    # Extrair texto
    print("Extraindo texto...")
    raw_text = extract_text_from_pdf(pdf_path)
    
    if not raw_text:
        print("ERRO: Não foi possível extrair texto")
        return None
    
    print(f"  Texto extraído: {len(raw_text)} caracteres")
    
    # Limpar texto
    cleaned_text = clean_text(raw_text)
    
    # Salvar texto bruto
    txt_path = output_dir / f"{pdf_path.stem}.txt"
    txt_path.write_text(cleaned_text, encoding='utf-8')
    print(f"  ✓ Texto salvo: {txt_path}")
    
    # Análise inicial
    analysis = {
        "filename": pdf_path.name,
        "pages": len(raw_text.split("=== PÁGINA")),
        "char_count": len(cleaned_text),
        "has_questions": "questão" in cleaned_text.lower() or "Questão" in cleaned_text,
        "has_passages": "texto" in cleaned_text.lower() or "passage" in cleaned_text.lower(),
        "preview": cleaned_text[:2000] if len(cleaned_text) > 2000 else cleaned_text
    }
    
    # Salvar análise
    json_path = output_dir / f"{pdf_path.stem}_analysis.json"
    json_path.write_text(json.dumps(analysis, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"  ✓ Análise salva: {json_path}")
    
    return analysis

def main():
    """Script principal"""
    # Diretórios
    base_dir = Path(__file__).parent
    pdf_dir = base_dir / "pdfs"
    output_dir = base_dir / "output"
    
    pdf_dir.mkdir(exist_ok=True)
    output_dir.mkdir(exist_ok=True)
    
    print("="*60)
    print("EXTRATOR DE PROVAS FUVEST - v2")
    print("="*60)
    print(f"\nDiretório de PDFs: {pdf_dir}")
    print(f"Diretório de saída: {output_dir}\n")
    
    # Verificar PDFs no diretório
    pdfs = list(pdf_dir.glob("*.pdf"))
    
    if not pdfs:
        print("Nenhum PDF encontrado!")
        print(f"\nColoque os PDFs das provas em: {pdf_dir}")
        print("Nomes sugeridos:")
        print("  - 2026-2ed.pdf (prova mais recente)")
        print("  - 2026-1ed.pdf")
        print("  - 2025-2ed.pdf")
        print("  - 2025-1ed.pdf")
        print("  - 2024-manha.pdf")
        print("  - 2024-tarde.pdf")
        return
    
    print(f"Encontrados {len(pdfs)} PDF(s):\n")
    
    results = []
    for pdf in pdfs:
        result = process_pdf(pdf, output_dir)
        if result:
            results.append(result)
    
    # Resumo
    print("\n" + "="*60)
    print("RESUMO")
    print("="*60)
    for r in results:
        print(f"\n{r['filename']}:")
        print(f"  - {r['pages']} páginas")
        print(f"  - {r['char_count']:,} caracteres")
        print(f"  - Detectou questões: {'Sim' if r['has_questions'] else 'Não'}")
        print(f"  - Detectou textos: {'Sim' if r['has_passages'] else 'Não'}")
    
    print(f"\n\nArquivos gerados em: {output_dir}")
    print("\nPróximos passos:")
    print("1. Abra os arquivos .txt e verifique a qualidade da extração")
    print("2. Estruture manualmente as questões no formato JSON do app")
    print("3. Ou use o modo 'Nova Passagem' com IA para gerar questões similares")

if __name__ == "__main__":
    main()
