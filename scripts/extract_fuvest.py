#!/usr/bin/env python3
"""
Extrator de questões FUVEST de PDFs
Baixa provas do site oficial e extrai texto estruturado
"""

import pdfplumber
import requests
import re
import json
from pathlib import Path
from typing import List, Dict, Optional

# URLs das provas FUVEST
PROVAS = {
    "2026-2ed": {
        "prova": "https://www.fuvest.br/wp-content/uploads/2025/10/profic2026-E-prova.pdf",
        "gabarito": "https://www.fuvest.br/wp-content/uploads/2025/10/profic2026-E-gabarito.pdf",
        "ano": "2025/2026",
        "edicao": "2ª Edição",
        "data": "12/10/2025"
    },
    "2026-1ed": {
        "prova": "https://www.fuvest.br/wp-content/uploads/2025/06/proficiencia-2026_ingles_grupo-E.pdf",
        "gabarito": "https://www.fuvest.br/wp-content/uploads/2025/06/proficiencia-2026_gabaritos.pdf",
        "ano": "2025/2026",
        "edicao": "1ª Edição",
        "data": "Junho/2025"
    },
    "2025-2ed": {
        "prova": "https://www.fuvest.br/wp-content/uploads/2024/10/proficiencia_2025-2_ingles_prova.pdf",
        "ano": "2024/2025",
        "edicao": "2ª Edição",
        "data": "Outubro/2024"
    },
    "2025-1ed": {
        "prova": "https://www.fuvest.br/wp-content/uploads/2024/06/proficiencia_2025_ingles.pdf",
        "ano": "2024/2025",
        "edicao": "1ª Edição",
        "data": "Junho/2024"
    },
    "2024-manha": {
        "prova": "https://www.fuvest.br/wp-content/uploads/2023/11/proficiencia_2024_ingles-manha.pdf",
        "ano": "2023/2024",
        "edicao": "Manhã",
        "data": "Novembro/2023"
    },
    "2024-tarde": {
        "prova": "https://www.fuvest.br/wp-content/uploads/2023/11/proficiencia_2024_ingles-tarde.pdf",
        "ano": "2023/2024",
        "edicao": "Tarde",
        "data": "Novembro/2023"
    }
}

def download_pdf(url: str, output_path: Path) -> bool:
    """Baixa PDF da URL"""
    print(f"Baixando: {url}")
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        output_path.write_bytes(response.content)
        print(f"✓ Salvo: {output_path}")
        return True
    except Exception as e:
        print(f"✗ Erro ao baixar {url}: {e}")
        return False

def extract_text_from_pdf(pdf_path: Path) -> str:
    """Extrai texto completo do PDF"""
    text = ""
    try:
        with pdfplumber.open(pdf_path) as pdf:
            for i, page in enumerate(pdf.pages):
                print(f"  Processando página {i+1}/{len(pdf.pages)}...")
                page_text = page.extract_text()
                if page_text:
                    text += f"\n--- Página {i+1} ---\n{page_text}"
    except Exception as e:
        print(f"✗ Erro ao extrair texto: {e}")
    return text

def parse_questions(text: str) -> List[Dict]:
    """
    Tenta parsear questões do texto extraído
    Retorna lista de dicts com passage, questions, etc.
    """
    passages = []
    
    # Padrões para identificar questões
    question_pattern = r'(\d{1,2})\s*[.\)]\s*([A-E][.\)]|[\(\[]?[A-E][\)\]]?)'
    
    for passage_num in range(1, 7):
        start_q = (passage_num - 1) * 5 + 1
        end_q = passage_num * 5
        
        print(f"  Procurando passagem {passage_num} (questões {start_q}-{end_q})...")
        
        passage_data = {
            "id": f"passage-{passage_num}",
            "questions": [],
            "text": "",
            "source": ""
        }
        
        passages.append(passage_data)
    
    return passages

def extract_prova(prova_id: str, info: Dict, download_dir: Path) -> Dict:
    """Extrai dados completos de uma prova"""
    print(f"\n{'='*60}")
    print(f"Processando: {prova_id} - {info['ano']} {info['edicao']}")
    print(f"{'='*60}")
    
    # Baixar PDF
    pdf_path = download_dir / f"{prova_id}.pdf"
    if not pdf_path.exists():
        if not download_pdf(info['prova'], pdf_path):
            return None
    else:
        print(f"✓ PDF já existe: {pdf_path}")
    
    # Extrair texto
    print("Extraindo texto...")
    raw_text = extract_text_from_pdf(pdf_path)
    
    # Salvar texto bruto para análise manual
    text_path = download_dir / f"{prova_id}.txt"
    text_path.write_text(raw_text, encoding='utf-8')
    print(f"✓ Texto salvo: {text_path}")
    
    # Tentar parsear estrutura
    print("Parseando estrutura das questões...")
    passages = parse_questions(raw_text)
    
    return {
        "id": prova_id,
        "ano": info['ano'],
        "edicao": info['edicao'],
        "data": info['data'],
        "passages": passages,
        "raw_text_preview": raw_text[:2000] + "..." if len(raw_text) > 2000 else raw_text
    }

def main():
    """Script principal"""
    download_dir = Path(__file__).parent / "downloads"
    download_dir.mkdir(exist_ok=True)
    
    output_dir = Path(__file__).parent / "output"
    output_dir.mkdir(exist_ok=True)
    
    print("="*60)
    print("EXTRATOR DE PROVAS FUVEST")
    print("="*60)
    
    all_provas = {}
    
    for prova_id, info in PROVAS.items():
        result = extract_prova(prova_id, info, download_dir)
        if result:
            all_provas[prova_id] = result
            
            # Salvar resultado individual
            output_file = output_dir / f"{prova_id}.json"
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
            print(f"✓ Resultado salvo: {output_file}")
    
    # Resumo
    print("\n" + "="*60)
    print("RESUMO")
    print("="*60)
    for prova_id, data in all_provas.items():
        print(f"{prova_id}: {len(data['passages'])} passagens encontradas")
    
    print(f"\nArquivos salvos em: {output_dir}")
    print("\nPróximos passos:")
    print("1. Verifique os arquivos .txt gerados")
    print("2. Ajuste o parse_questions() conforme necessário")
    print("3. Converta para o formato final do app")

if __name__ == "__main__":
    main()
