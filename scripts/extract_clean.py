#!/usr/bin/env python3
"""
Extracao limpa de PDFs FUVEST - corrige (cid:172) e caracteres de encoding.
"""

import json
import re
from pathlib import Path
import pdfplumber
from dataclasses import dataclass, asdict

@dataclass
class Passage:
    id: str
    exam_id: str
    exam_name: str
    source: str
    text: str
    difficulty: str
    topic: str
    estimated_reading_time: int
    questions: list
    stats: dict = None
    
    def __post_init__(self):
        if self.stats is None:
            self.stats = {"total_attempts": 0, "correct_count": 0, "accuracy_rate": 0, "avg_time": 0, "last_attempt": None}

def clean_pdf_text(text):
    """Limpa texto extraido de PDF FUVEST."""
    if not text:
        return ""
    
    # Remove (cid:172) e substitui por espaco
    text = text.replace('(cid:172)', ' ')
    
    # Remove caracter NOT SIGN
    text = text.replace('\u00ac', ' ')
    
    # Corrige caracteres acentuados comuns de encoding ruim
    encoding_fixes = {
        '�': 'ç', '�': 'ã', '�': 'õ', '�': 'á', '�': 'é', '�': 'í', '�': 'ó', '�': 'ú',
        '�': 'â', '�': 'ê', '�': 'ô', '�': 'à', '�': 'ü',
        '�': 'Ç', '�': 'Ã', '�': 'Õ', '�': 'Á', '�': 'É', '�': 'Í', '�': 'Ó', '�': 'Ú',
        '�': 'Â', '�': 'Ê', '�': 'Ô', '�': 'À', '�': 'Ü',
    }
    
    for wrong, correct in encoding_fixes.items():
        text = text.replace(wrong, correct)
    
    # Normaliza espacos
    text = re.sub(r' +', ' ', text)
    text = re.sub(r'\n +', '\n', text)
    text = re.sub(r' +\n', '\n', text)
    text = re.sub(r'\n+', '\n', text)
    
    return text.strip()

def extract_text_clean(pdf_path):
    """Extrai texto limpo de PDF."""
    text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    return clean_pdf_text(text)

def detect_question_type(text):
    """Detecta tipo de questao."""
    text = text.lower()
    if any(x in text for x in ['tese principal', 'ideia central', 'tema principal']):
        return 'main_idea'
    if any(x in text for x in ['inferir', 'infere-se', 'indica que', 'sugere que']):
        return 'inference'
    if any(x in text for x in ['substituido', 'sinonimo', 'sem alteracao']):
        return 'vocab_synonym'
    if any(x in text for x in ['significa', 'contribui', 'escolha do termo']):
        return 'vocab_meaning'
    if any(x in text for x in ['expressao', 'frase', 'contexto']):
        return 'expression'
    return 'detail'

def detect_topic(text):
    """Detecta tema."""
    text = text.lower()
    keywords = {
        'technology_ai': ['artificial intelligence', 'algorithm', 'digital', 'internet', 'software', 'ai ', 'a.i.', 'chatgpt'],
        'medicine_health': ['health', 'disease', 'medicine', 'medical', 'patient', 'treatment', 'doctor'],
        'environment_climate': ['climate', 'environment', 'global warming', 'pollution', 'sustainability'],
        'culture_arts': ['art', 'artist', 'music', 'literature', 'fiction', 'writing'],
        'science_research': ['science', 'research', 'scientist', 'study', 'discovery'],
        'social_sciences': ['society', 'social', 'community', 'culture'],
        'economics_business': ['economy', 'economic', 'market', 'business'],
        'education': ['education', 'school', 'learning', 'student', 'university'],
        'politics_governance': ['politics', 'government', 'policy', 'democracy'],
    }
    scores = {topic: sum(1 for word in words if word in text) for topic, words in keywords.items()}
    return max(scores, key=scores.get) if scores else 'social_sciences'

def parse_exam(exam_id, exam_name, pdf_path):
    """Faz parse de um exame."""
    print(f"\nProcessando: {exam_name}")
    
    text = extract_text_clean(pdf_path)
    print(f"  Texto limpo: {len(text)} chars")
    
    passages = []
    
    # Encontra textos (padrao: "Texto para as questoes de 01 a 05")
    passage_matches = list(re.finditer(
        r'Texto para as quest[õo]es de (\d{2}) a (\d{2})\s*\n(.*?)(?=Texto para as quest[õo]es de|\Z)',
        text, re.DOTALL | re.IGNORECASE
    ))
    
    print(f"  Passagens encontradas: {len(passage_matches)}")
    
    for i, block in enumerate(passage_matches[:6]):
        passage_num = i + 1
        q_start = int(block.group(1))
        q_end = int(block.group(2))
        passage_text = block.group(3).strip()
        
        # Pega apenas o texto ate o primeiro {xx}
        if '{' in passage_text:
            passage_text = passage_text[:passage_text.find('{')].strip()
        
        # Extrai questoes
        questions = []
        for q_num in range(q_start, q_end + 1):
            q_str = f"{q_num:02d}"
            
            # Procura questao {xx}
            q_pattern = rf'\{{{q_str}\}}\s*(.*?)(?=\{{\d{{2}}\}}|Texto para as quest|\Z)'
            q_match = re.search(q_pattern, text, re.DOTALL)
            
            if q_match:
                q_content = q_match.group(1).strip()
                
                # Extrai opcoes (A)...(B)...(C)...(D)...(E)...
                opts_match = re.search(
                    r'\(A\)(.*?)\(B\)(.*?)\(C\)(.*?)\(D\)(.*?)\(E\)(.*?)(?=\n|$)',
                    q_content, re.DOTALL
                )
                
                if opts_match:
                    q_text = q_content[:q_content.find('(A)')].strip()
                    options = [
                        "(A) " + opts_match.group(1).strip()[:150],
                        "(B) " + opts_match.group(2).strip()[:150],
                        "(C) " + opts_match.group(3).strip()[:150],
                        "(D) " + opts_match.group(4).strip()[:150],
                        "(E) " + opts_match.group(5).strip()[:150],
                    ]
                else:
                    q_text = q_content[:400]
                    options = ["(A)", "(B)", "(C)", "(D)", "(E)"]
                
                questions.append({
                    "id": f"{exam_id}-q{q_str}",
                    "question_type": detect_question_type(q_text),
                    "question_text": q_text[:500],
                    "options": options,
                    "correct_answer": "A",
                    "correct_explanation": "Resposta: A",
                    "tested_concept": detect_question_type(q_text),
                    "difficulty": "medium"
                })
        
        if questions:
            passages.append(Passage(
                id=f"{exam_id}-p{passage_num}",
                exam_id=exam_id,
                exam_name=exam_name,
                source="FUVEST",
                text=passage_text[:2000],
                difficulty="medium",
                topic=detect_topic(passage_text),
                estimated_reading_time=5,
                questions=questions
            ))
    
    q_count = sum(len(p.questions) for p in passages)
    print(f"  >> {len(passages)} passagens, {q_count} questoes")
    
    return passages

def main():
    pdf_dir = Path("fuvest_pdfs")
    
    exams = [
        ("2026-2ed", "FUVEST 2025/2026 - 2 Edicao", "2026-2ed-prova.pdf"),
        ("2026-1ed", "FUVEST 2025/2026 - 1 Edicao", "2026-1ed-prova.pdf"),
        ("2025-2ed", "FUVEST 2024/2025 - 2 Edicao", "2025-2ed-prova.pdf"),
        ("2025-1ed-manha", "FUVEST 2024/2025 - 1 Edicao (Manha)", "2025-1ed-manha.pdf"),
        ("2025-1ed-tarde", "FUVEST 2024/2025 - 1 Edicao (Tarde)", "2025-1ed-tarde.pdf"),
        ("2024-manha", "FUVEST 2023/2024 (Manha)", "2024-manha.pdf"),
        ("2024-tarde", "FUVEST 2023/2024 (Tarde)", "2024-tarde.pdf"),
    ]
    
    all_passages = []
    
    for exam_id, exam_name, prova_file in exams:
        prova_path = pdf_dir / prova_file
        if prova_path.exists():
            passages = parse_exam(exam_id, exam_name, prova_path)
            all_passages.extend([asdict(p) for p in passages])
    
    # Gera JSON
    output = {
        "schema_version": "3.3",
        "description": "Banco de questoes FUVEST - Proficiencia em Lingua Inglesa",
        "last_updated": "2025-03-13",
        "total_passages": len(all_passages),
        "total_questions": sum(len(p["questions"]) for p in all_passages),
        "source": "FUVEST",
        "passages": all_passages
    }
    
    output_path = Path("../data/initial-bank.json")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"\n{'='*60}")
    print(f"Banco gerado: {output_path}")
    print(f"Total: {output['total_passages']} passagens ({output['total_questions']} questoes)")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()
