#!/usr/bin/env python3
"""
Reextracao usando pdfplumber - mais robusto para espacos.
"""

import json
import re
from pathlib import Path
import pdfplumber

def extract_with_pdfplumber(pdf_path):
    """Extrai texto preservando espacos."""
    text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    return text

def main():
    pdf_dir = Path("fuvest_pdfs")
    
    # Testa com um PDF
    pdf_path = pdf_dir / "2026-2ed-prova.pdf"
    print(f"Extraindo: {pdf_path}")
    
    text = extract_with_pdfplumber(pdf_path)
    print(f"Caracteres extraidos: {len(text)}")
    print("\nPrimeiros 800 caracteres:")
    print(text[:800])
    
    # Verifica se tem espacos
    has_spaces = ' ' in text[:100]
    print(f"\nTem espacos: {has_spaces}")
    
    # Conta palavras
    words = text.split()
    print(f"Total de palavras: {len(words)}")

if __name__ == "__main__":
    main()
