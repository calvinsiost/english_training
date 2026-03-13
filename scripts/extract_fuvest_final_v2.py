#!/usr/bin/env python3
"""
Extrator de questoes FUVEST dos PDFs - Versao Final.
Suporta multiplos formatos de PDF FUVEST.
"""

import json
import re
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import List, Dict, Optional
import PyPDF2

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
    questions: List[Dict]
    stats: Dict = None
    
    def __post_init__(self):
        if self.stats is None:
            self.stats = {
                "total_attempts": 0,
                "correct_count": 0,
                "accuracy_rate": 0,
                "avg_time": 0,
                "last_attempt": None
            }

def extract_text_from_pdf(pdf_path: Path) -> str:
    """Extrai texto de um PDF."""
    text = ""
    with open(pdf_path, 'rb') as f:
        reader = PyPDF2.PdfReader(f)
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    return text

def extract_answers_from_gabarito(gabarito_path: Path) -> Dict[str, str]:
    """Extrai respostas do gabarito PDF."""
    answers = {}
    text = extract_text_from_pdf(gabarito_path)
    
    # Padroes de gabarito
    patterns = [
        r'(\d{1,2})\s*[\.\)]\s*([A-E])',
        r'Questao\s*(\d{1,2})\s*[:\.]?\s*([A-E])',
        r'(\d{1,2})\s*-\s*([A-E])',
    ]
    
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            q_num = match.group(1).zfill(2)
            answers[q_num] = match.group(2).upper()
    
    return answers

def detect_question_type(question_text: str) -> str:
    """Detecta o tipo de questao."""
    question_lower = question_text.lower()
    
    patterns = {
        "main_idea": [r'tese principal', r'ideia central', r'tema principal', r'assunto principal'],
        "inference": [r'pode-se inferir', r'infere-se', r'indica que', r'sugere que', r'implica'],
        "vocab_synonym": [r'substitu[ií]do', r'sin[ôo]nimo', r'sem altera[çc][ãa]o', r'sem preju[íi]zo'],
        "vocab_meaning": [r'significa', r'contribui', r'escolha do termo', r'efeito de sentido'],
        "expression": [r'express[ãa]o', r'frase', r'proposi[çc][ãa]o', r'no contexto'],
        "detail": [r'segundo o texto', r'conforme o texto', r'de acordo com'],
        "purpose": [r'finalidade', r'objetivo', r'inten[çc][ãa]o'],
        "tone": [r'tom', r'atitude', r'posi[çc][ãa]o'],
        "reference": [r'refere-se', r'se refere', r'pronome'],
    }
    
    for qtype, patterns_list in patterns.items():
        if any(re.search(pattern, question_lower) for pattern in patterns_list):
            return qtype
    return "detail"

def detect_topic(passage_text: str) -> str:
    """Detecta o tema da passagem."""
    text_lower = passage_text.lower()
    
    keywords = {
        "technology_ai": ['artificial intelligence', 'algorithm', 'digital', 'internet', 'software', 'technology', 'ai ', 'a.i.', 'chatgpt'],
        "medicine_health": ['health', 'disease', 'medicine', 'medical', 'patient', 'treatment', 'doctor', 'physician'],
        "environment_climate": ['climate', 'environment', 'global warming', 'pollution', 'sustainability'],
        "social_sciences": ['society', 'social', 'community', 'culture', 'inequality'],
        "culture_arts": ['art', 'artist', 'music', 'literature', 'culture', 'fiction', 'writing'],
        "education": ['education', 'school', 'learning', 'student', 'university'],
        "politics_governance": ['politics', 'government', 'policy', 'democracy'],
        "economics_business": ['economy', 'economic', 'market', 'business', 'finance'],
        "science_research": ['science', 'research', 'scientist', 'study', 'discovery'],
        "psychology": ['psychology', 'mental', 'behavior', 'cognitive'],
        "history": ['history', 'historical', 'past', 'century', 'era'],
    }
    
    scores = {}
    for topic, words in keywords.items():
        score = sum(1 for word in words if word in text_lower)
        if score > 0:
            scores[topic] = score
    
    if scores:
        return max(scores, key=scores.get)
    return "social_sciences"

def clean_text(text: str) -> str:
    """Limpa o texto extraido."""
    # Remove espacos excessivos
    text = re.sub(r' +', ' ', text)
    # Normaliza quebras de linha
    text = re.sub(r'\n+', '\n', text)
    return text.strip()

def parse_exam_format_2026(text: str, exam_id: str, exam_name: str, answers: Dict[str, str]) -> List[Passage]:
    """Parse para formato 2026: {01} questao... (A)... (B)..."""
    passages = []
    
    # Encontra todos os textos (6 passagens)
    # Padrao: "Texto para as questoes de 01 a 05"
    passage_blocks = list(re.finditer(
        r'Texto para as quest[õo]es de (\d{2}) a (\d{2})\s*\n(.*?)(?=Texto para as quest[õo]es de|\Z)',
        text, re.DOTALL | re.IGNORECASE
    ))
    
    if len(passage_blocks) < 6:
        # Tenta padrao alternativo
        passage_blocks = list(re.finditer(
            r'Texto para as quest[õo]es (\d{2}) a (\d{2})\s*\n(.*?)(?=Texto para as quest[õo]es|\Z)',
            text, re.DOTALL | re.IGNORECASE
        ))
    
    for i, block in enumerate(passage_blocks[:6]):
        passage_num = i + 1
        q_start = int(block.group(1))
        q_end = int(block.group(2))
        passage_text = clean_text(block.group(3))
        
        # Extrai questoes para esta passagem
        questions = []
        for q_num in range(q_start, q_end + 1):
            q_str = f"{q_num:02d}"
            
            # Procura questao no formato {01}
            q_pattern = rf'\{{{q_str}\}}\s*(.*?)(?=\{{\d{{2}}\}}|Texto para as quest|\Z)'
            q_match = re.search(q_pattern, text, re.DOTALL)
            
            if q_match:
                q_content = clean_text(q_match.group(1))
                
                # Extrai opcoes (A)...(B)...(C)...(D)...(E)...
                opts_match = re.search(
                    r'\(A\)(.*?)\(B\)(.*?)\(C\)(.*?)\(D\)(.*?)\(E\)(.*?)(?=\n|$)',
                    q_content, re.DOTALL
                )
                
                if opts_match:
                    q_text = q_content[:q_content.find('(A)')].strip()
                    options = [
                        "(A) " + clean_text(opts_match.group(1))[:120],
                        "(B) " + clean_text(opts_match.group(2))[:120],
                        "(C) " + clean_text(opts_match.group(3))[:120],
                        "(D) " + clean_text(opts_match.group(4))[:120],
                        "(E) " + clean_text(opts_match.group(5))[:120],
                    ]
                else:
                    q_text = q_content[:300]
                    options = ["(A)", "(B)", "(C)", "(D)", "(E)"]
                
                correct = answers.get(q_str, "A")
                
                questions.append({
                    "id": f"{exam_id}-q{q_str}",
                    "question_type": detect_question_type(q_text),
                    "question_text": q_text[:400],
                    "options": options,
                    "correct_answer": correct,
                    "correct_explanation": f"Resposta correta: {correct}",
                    "tested_concept": detect_question_type(q_text),
                    "difficulty": "medium"
                })
        
        if questions:
            passages.append(Passage(
                id=f"{exam_id}-p{passage_num}",
                exam_id=exam_id,
                exam_name=exam_name,
                source="FUVEST",
                text=passage_text[:1500] if len(passage_text) > 1500 else passage_text,
                difficulty="medium",
                topic=detect_topic(passage_text),
                estimated_reading_time=5,
                questions=questions
            ))
    
    return passages

def parse_exam_format_standard(text: str, exam_id: str, exam_name: str, answers: Dict[str, str]) -> List[Passage]:
    """Parse para formato padrao: 01. questao... a)... b)..."""
    passages = []
    
    # Encontra todos os textos
    passage_blocks = list(re.finditer(
        r'Texto para as quest[õo]es\s+(?:de\s+)?(\d{2})\s+a\s+(\d{2})\s*\n(.*?)(?=\n\s*\n\s*(?:\d{2}\.|Texto para as quest))',
        text, re.DOTALL | re.IGNORECASE
    ))
    
    # Se nao encontrou, tenta padrao mais flexivel
    if len(passage_blocks) < 6:
        passage_blocks = list(re.finditer(
            r'Texto para as quest[õo]es\s+(?:de\s+)?(\d{2})\s+a\s+(\d{2})\s*\n(.*?)(?=Quest[ãa]o|\d{2}\.|$)',
            text, re.DOTALL | re.IGNORECASE
        ))
    
    for i, block in enumerate(passage_blocks[:6]):
        passage_num = i + 1
        q_start = int(block.group(1))
        q_end = int(block.group(2))
        passage_text = clean_text(block.group(3))
        
        # Extrai questoes para esta passagem
        questions = []
        for q_num in range(q_start, q_end + 1):
            q_str = f"{q_num:02d}"
            
            # Procura questao no formato "01." ou "01)"
            q_pattern = rf'(?:^|\n)\s*{q_str}\s*[\.\)]\s*(.*?)(?=\n\s*\d{{2}}\s*[\.\)]|Texto para as quest|$)'
            q_match = re.search(q_pattern, text, re.DOTALL)
            
            if q_match:
                q_content = clean_text(q_match.group(1))
                
                # Extrai opcoes a)... b)... c)... d)... e)...
                opts_match = re.search(
                    r'([a-e]\).*?[\.\?])(?:\s*[a-e]\)|\Z)',
                    q_content, re.DOTALL | re.IGNORECASE
                )
                
                # Tenta padrao alternativo: a) opcao b) opcao
                opts_match = re.search(
                    r'([aA]\).*?)([bB]\).*?)([cC]\).*?)([dD]\).*?)([eE]\).*?)(?:\n|$)',
                    q_content, re.DOTALL
                )
                
                if opts_match:
                    q_text = q_content[:q_content.find('a)')].strip()
                    options = [
                        "(A) " + clean_text(opts_match.group(1))[2:][:120],
                        "(B) " + clean_text(opts_match.group(2))[2:][:120],
                        "(C) " + clean_text(opts_match.group(3))[2:][:120],
                        "(D) " + clean_text(opts_match.group(4))[2:][:120],
                        "(E) " + clean_text(opts_match.group(5))[2:][:120],
                    ]
                else:
                    q_text = q_content[:400]
                    options = ["(A)", "(B)", "(C)", "(D)", "(E)"]
                
                correct = answers.get(q_str, "A")
                
                questions.append({
                    "id": f"{exam_id}-q{q_str}",
                    "question_type": detect_question_type(q_text),
                    "question_text": q_text[:400],
                    "options": options,
                    "correct_answer": correct,
                    "correct_explanation": f"Resposta correta: {correct}",
                    "tested_concept": detect_question_type(q_text),
                    "difficulty": "medium"
                })
        
        if questions:
            passages.append(Passage(
                id=f"{exam_id}-p{passage_num}",
                exam_id=exam_id,
                exam_name=exam_name,
                source="FUVEST",
                text=passage_text[:1500] if len(passage_text) > 1500 else passage_text,
                difficulty="medium",
                topic=detect_topic(passage_text),
                estimated_reading_time=5,
                questions=questions
            ))
    
    return passages

def parse_exam(text: str, exam_id: str, exam_name: str, answers: Dict[str, str]) -> List[Passage]:
    """Detecta o formato e faz o parse adequado."""
    
    # Verifica se eh formato 2026 (usando {01})
    if re.search(r'\{01\}', text):
        print("  Detectado formato 2026 (com chaves)")
        return parse_exam_format_2026(text, exam_id, exam_name, answers)
    else:
        print("  Detectado formato padrao (com numeros)")
        return parse_exam_format_standard(text, exam_id, exam_name, answers)

def main():
    pdf_dir = Path("fuvest_pdfs")
    
    exams = [
        ("2026-2ed", "FUVEST 2025/2026 - 2 Edicao", "2026-2ed-prova.pdf", "2026-2ed-gabarito.pdf"),
        ("2026-1ed", "FUVEST 2025/2026 - 1 Edicao", "2026-1ed-prova.pdf", "2026-1ed-gabarito.pdf"),
        ("2025-2ed", "FUVEST 2024/2025 - 2 Edicao", "2025-2ed-prova.pdf", "2025-2ed-gabarito.pdf"),
        ("2025-1ed-manha", "FUVEST 2024/2025 - 1 Edicao (Manha)", "2025-1ed-manha.pdf", None),
        ("2025-1ed-tarde", "FUVEST 2024/2025 - 1 Edicao (Tarde)", "2025-1ed-tarde.pdf", None),
        ("2024-manha", "FUVEST 2023/2024 (Manha)", "2024-manha.pdf", None),
        ("2024-tarde", "FUVEST 2023/2024 (Tarde)", "2024-tarde.pdf", None),
    ]
    
    all_passages = []
    total_questions = 0
    
    for exam_id, exam_name, prova_file, gabarito_file in exams:
        prova_path = pdf_dir / prova_file
        gabarito_path = pdf_dir / gabarito_file if gabarito_file else None
        
        print(f"\nProcessando: {exam_name}")
        
        if not prova_path.exists():
            print(f"  ERRO: Arquivo nao encontrado")
            continue
        
        text = extract_text_from_pdf(prova_path)
        print(f"  Texto: {len(text)} chars")
        
        answers = {}
        if gabarito_path and gabarito_path.exists():
            answers = extract_answers_from_gabarito(gabarito_path)
            print(f"  Gabarito: {len(answers)} respostas")
        
        passages = parse_exam(text, exam_id, exam_name, answers)
        
        q_count = sum(len(p.questions) for p in passages)
        print(f"  >> {len(passages)} passagens, {q_count} questoes")
        
        total_questions += q_count
        all_passages.extend([asdict(p) for p in passages])
    
    # Gera JSON
    output = {
        "schema_version": "3.3",
        "description": "Banco de questoes FUVEST - Proficiencia em Lingua Inglesa",
        "last_updated": "2025-03-13",
        "total_passages": len(all_passages),
        "total_questions": total_questions,
        "source": "FUVEST",
        "passages": all_passages
    }
    
    output_path = Path("../data/initial-bank.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"\n{'='*60}")
    print(f"Banco gerado: {output_path}")
    print(f"Total: {output['total_passages']} passagens ({output['total_questions']} questoes)")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()
