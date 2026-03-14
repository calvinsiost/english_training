#!/usr/bin/env python3
"""
Extrator de questoes FUVEST dos PDFs baixados - Versao 3.
Gera JSON compativel com o app English Training.
"""

import json
import re
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import List, Dict, Optional, Tuple
import PyPDF2

@dataclass
class Question:
    id: str
    question_type: str
    question_text: str
    options: List[str]
    correct_answer: str
    correct_explanation: str
    tested_concept: str
    difficulty: str = "medium"

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
    
    # Procura por padroes como "01 A", "1. A", "Questao 1: A"
    patterns = [
        r'(\d{1,2})\s*[\.\)]\s*([A-E])',
        r'Questao\s*(\d{1,2})\s*[:\.]?\s*([A-E])',
    ]
    
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            q_num = match.group(1).zfill(2)
            answers[q_num] = match.group(2).upper()
    
    return answers

def detect_question_type(question_text: str) -> str:
    """Detecta o tipo de questao baseado no texto."""
    question_lower = question_text.lower()
    
    patterns = {
        "main_idea": [r'tese principal', r'ideia central', r'tema principal', r'assunto principal', r'principal ideia'],
        "inference": [r'pode-se inferir', r'infere-se', r'indica que', r'sugere que', r'implica', r'pode-se deduzir'],
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
        "technology_ai": ['artificial intelligence', 'algorithm', 'digital', 'internet', 'software', 'technology', 'ai ', 'a.i.'],
        "medicine_health": ['health', 'disease', 'medicine', 'medical', 'patient', 'treatment', 'doctor', 'physician'],
        "environment_climate": ['climate', 'environment', 'global warming', 'pollution', 'sustainability'],
        "social_sciences": ['society', 'social', 'community', 'culture', 'inequality'],
        "culture_arts": ['art', 'artist', 'music', 'literature', 'culture'],
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

def parse_fuvest_exam(text: str, exam_id: str, exam_name: str, answers: Dict[str, str]) -> List[Passage]:
    """
    Parse de um exame FUVEST completo.
    Formato: 6 textos com 5 questoes cada (30 questoes total)
    """
    passages = []
    
    # Limpa o texto
    text = re.sub(r'\n+', '\n', text)
    
    # Padrao FUVEST: "Texto para as questoes de 01 a 05"
    # ou "Texto para as questoes de 06 a 10", etc.
    passage_pattern = r'Texto para as quest[õo]es de (\d{2}) a (\d{2})\s*\n(.*?)(?=Texto para as quest[õo]es de|\{0?\d\d\}|\n\s*\n\s*\n|$)'
    
    # Encontra todos os textos
    passage_matches = list(re.finditer(passage_pattern, text, re.DOTALL | re.IGNORECASE))
    
    if len(passage_matches) == 0:
        # Tenta padrao alternativo
        passage_pattern = r'Texto\s+(\d|[IVX]+)\s*\n(.*?)(?=Texto\s+\d|Quest[ãa]o|\{0?\d\d\}|$)'
        passage_matches = list(re.finditer(passage_pattern, text, re.DOTALL | re.IGNORECASE))
    
    # Se ainda nao encontrou, tenta dividir manualmente
    if len(passage_matches) == 0:
        # Procura por padroes de questoes {01}, {02}, etc.
        all_questions = list(re.finditer(r'\{(\d{2})\}\s*(.*?)(?=\{\d{2}\}|$)', text, re.DOTALL))
        
        if len(all_questions) >= 30:
            # Divide em 6 grupos de 5 questoes
            for i in range(6):
                passage_num = i + 1
                start_idx = i * 5
                end_idx = start_idx + 5
                
                # Pega as questoes desta passagem
                passage_questions = all_questions[start_idx:end_idx]
                
                # Extrai as questoes formatadas
                questions = []
                passage_text = f"[Passagem sobre tema detectado - texto original no PDF]"
                
                for q_match in passage_questions:
                    q_num = q_match.group(1)
                    q_content = q_match.group(2).strip()
                    
                    # Extrai as opcoes A-E
                    options_match = re.search(r'\(A\)(.*?)\(B\)(.*?)\(C\)(.*?)\(D\)(.*?)\(E\)(.*?)(?=\n|$)', q_content, re.DOTALL)
                    
                    if options_match:
                        q_text = q_content[:q_content.find('(A)')].strip()
                        options = [
                            "(A) " + options_match.group(1).strip()[:100],
                            "(B) " + options_match.group(2).strip()[:100],
                            "(C) " + options_match.group(3).strip()[:100],
                            "(D) " + options_match.group(4).strip()[:100],
                            "(E) " + options_match.group(5).strip()[:100],
                        ]
                    else:
                        q_text = q_content[:200]
                        options = ["(A)", "(B)", "(C)", "(D)", "(E)"]
                    
                    correct = answers.get(q_num, "A")
                    
                    questions.append({
                        "id": f"{exam_id}-q{q_num}",
                        "question_type": detect_question_type(q_text),
                        "question_text": q_text[:300] if len(q_text) > 300 else q_text,
                        "options": options,
                        "correct_answer": correct,
                        "correct_explanation": f"Resposta correta: {correct}",
                        "tested_concept": detect_question_type(q_text),
                        "difficulty": "medium"
                    })
                
                passage = Passage(
                    id=f"{exam_id}-p{passage_num}",
                    exam_id=exam_id,
                    exam_name=exam_name,
                    source="FUVEST - Fundacao Universitaria para o Vestibular",
                    text=passage_text,
                    difficulty="medium",
                    topic=detect_topic(passage_text),
                    estimated_reading_time=5,
                    questions=questions
                )
                passages.append(passage)
    else:
        # Processa usando os matches de passagens encontrados
        for i, match in enumerate(passage_matches[:6]):  # Max 6 passagens
            passage_num = i + 1
            passage_text = match.group(2) if len(match.groups()) > 1 else match.group(1)
            passage_text = passage_text.strip()
            
            # Determina o range de questoes (01-05, 06-10, etc.)
            if len(match.groups()) >= 2:
                try:
                    q_start = int(match.group(1))
                    q_end = int(match.group(2))
                except:
                    q_start = (i * 5) + 1
                    q_end = q_start + 4
            else:
                q_start = (i * 5) + 1
                q_end = q_start + 4
            
            # Extrai questoes para esta passagem
            questions = []
            for q_num in range(q_start, q_end + 1):
                q_str = f"{q_num:02d}"
                
                # Procura a questao no texto
                q_pattern = rf'\{{{q_str}\}}\s*(.*?)(?=\{{\d{{2}}\}}|Texto|$)'
                q_match = re.search(q_pattern, text, re.DOTALL)
                
                if q_match:
                    q_content = q_match.group(1).strip()
                    
                    # Extrai opcoes
                    options_match = re.search(r'\(A\)(.*?)\(B\)(.*?)\(C\)(.*?)\(D\)(.*?)\(E\)(.*?)(?=\n|$)', q_content, re.DOTALL)
                    
                    if options_match:
                        q_text = q_content[:q_content.find('(A)')].strip()
                        options = [
                            "(A) " + options_match.group(1).strip()[:100],
                            "(B) " + options_match.group(2).strip()[:100],
                            "(C) " + options_match.group(3).strip()[:100],
                            "(D) " + options_match.group(4).strip()[:100],
                            "(E) " + options_match.group(5).strip()[:100],
                        ]
                    else:
                        q_text = q_content[:300]
                        options = ["(A)", "(B)", "(C)", "(D)", "(E)"]
                    
                    correct = answers.get(q_str, "A")
                    
                    questions.append({
                        "id": f"{exam_id}-q{q_str}",
                        "question_type": detect_question_type(q_text),
                        "question_text": q_text[:400] if len(q_text) > 400 else q_text,
                        "options": options,
                        "correct_answer": correct,
                        "correct_explanation": f"Resposta correta: {correct}",
                        "tested_concept": detect_question_type(q_text),
                        "difficulty": "medium"
                    })
            
            if questions:  # Só adiciona se tiver questoes
                passage = Passage(
                    id=f"{exam_id}-p{passage_num}",
                    exam_id=exam_id,
                    exam_name=exam_name,
                    source="FUVEST - Fundacao Universitaria para o Vestibular",
                    text=passage_text[:1000] + "..." if len(passage_text) > 1000 else passage_text,
                    difficulty="medium",
                    topic=detect_topic(passage_text),
                    estimated_reading_time=5,
                    questions=questions
                )
                passages.append(passage)
    
    return passages

def main():
    pdf_dir = Path("fuvest_pdfs")
    
    # Define os exames a processar
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
            print(f"  ERRO: Arquivo nao encontrado: {prova_path}")
            continue
        
        # Extrai texto do PDF
        text = extract_text_from_pdf(prova_path)
        print(f"  Texto extraido: {len(text)} caracteres")
        
        # Extrai gabarito se disponivel
        answers = {}
        if gabarito_path and gabarito_path.exists():
            answers = extract_answers_from_gabarito(gabarito_path)
            print(f"  Gabarito: {len(answers)} respostas extraidas")
        
        # Processa o exame
        passages = parse_fuvest_exam(text, exam_id, exam_name, answers)
        
        q_count = sum(len(p.questions) for p in passages)
        print(f"  >> {len(passages)} passagens, {q_count} questoes")
        
        total_questions += q_count
        all_passages.extend([asdict(p) for p in passages])
    
    # Gera o JSON final
    output = {
        "schema_version": "3.3",
        "description": "Banco de questoes FUVEST - Proficiencia em Lingua Inglesa",
        "last_updated": "2025-03-13",
        "total_passages": len(all_passages),
        "total_questions": total_questions,
        "source": "FUVEST - Fundacao Universitaria para o Vestibular",
        "passages": all_passages
    }
    
    output_path = Path("../data/initial-bank.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"\n{'='*60}")
    print(f"Banco de dados gerado: {output_path}")
    print(f"Total: {output['total_passages']} passagens ({output['total_questions']} questoes)")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()
