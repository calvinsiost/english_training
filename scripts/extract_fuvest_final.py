#!/usr/bin/env python3
"""
Extrator de questões FUVEST dos PDFs baixados.
Gera JSON compatível com o app English Training.
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
            text += page.extract_text() + "\n"
    return text

def detect_question_type(question_text: str) -> str:
    """Detecta o tipo de questão baseado no texto."""
    question_lower = question_text.lower()
    
    patterns = {
        "main_idea": [r'tese principal', r'ideia central', r'tema principal', r'assunto principal'],
        "inference": [r'pode-se inferir', r'infere-se', r'indica que', r'sugere que', r'implica'],
        "vocab_synonym": [r'substituído', r'sinônimo', r'sem alteração', r'sem prejuízo'],
        "vocab_meaning": [r'significa', r'contribui', r'escolha do termo', r'efeito de sentido'],
        "expression": [r'expressão', r'frase', r'proposição', r'contexto'],
        "detail": [r'segundo o texto', r'conforme o texto', r'de acordo com'],
        "purpose": [r'finalidade', r'objetivo', r'intenção'],
        "tone": [r'tom', r'atitude', r'posição'],
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
        "technology_ai": ['artificial intelligence', 'algorithm', 'digital', 'internet', 'software', 'technology'],
        "medicine_health": ['health', 'disease', 'medicine', 'medical', 'patient', 'treatment', 'saúde'],
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

def parse_questions(text: str) -> List[Tuple[str, str, str]]:
    """
    Extrai questões do texto.
    Retorna lista de (numero, texto_questao, resposta_correta)
    """
    questions = []
    
    # Padrão FUVEST: questões numeradas de 1-30 com opções A-E
    # Procura por padrões como "01." ou "1." seguido de texto
    question_pattern = r'(?:^|\n)\s*(\d{1,2})[\.\)]\s*(.*?)(?=\n\s*(?:\d{1,2}[\.\)]|[A-E][\.\)]|$))'
    
    matches = re.finditer(question_pattern, text, re.DOTALL)
    for match in matches:
        q_num = match.group(1)
        q_text = match.group(2).strip()
        
        # Limpa o texto
        q_text = re.sub(r'\s+', ' ', q_text)
        
        if len(q_text) > 20:  # Filtro de tamanho mínimo
            questions.append((q_num, q_text, "A"))  # Resposta padrão A
    
    return questions

def split_into_passages(text: str) -> List[Tuple[int, str, str]]:
    """
    Divide o texto em passagens.
    Retorna lista de (numero_passagem, texto_passagem, topico)
    """
    # FUVEST: 6 passagens com 5 questões cada
    # Tenta identificar divisões entre passagens
    
    passages = []
    
    # Procura por marcadores de passagem (Texto 1, Texto I, etc.)
    passage_markers = [
        r'Texto\s*(\d|[IVX]+)',
        r'Text\s*(\d|[IVX]+)',
        r'Passage\s*(\d|[IVX]+)',
    ]
    
    # Divide o texto em blocos
    lines = text.split('\n')
    current_passage = []
    passage_num = 0
    
    for line in lines:
        line = line.strip()
        
        # Verifica se é marcador de nova passagem
        is_marker = any(re.match(pattern, line, re.IGNORECASE) for pattern in passage_markers)
        
        if is_marker and current_passage:
            passage_num += 1
            passage_text = '\n'.join(current_passage).strip()
            topic = detect_topic(passage_text)
            passages.append((passage_num, passage_text, topic))
            current_passage = []
        
        if len(line) > 10:
            current_passage.append(line)
    
    # Adiciona última passagem
    if current_passage:
        passage_num += 1
        passage_text = '\n'.join(current_passage).strip()
        topic = detect_topic(passage_text)
        passages.append((passage_num, passage_text, topic))
    
    return passages

def process_exam(exam_id: str, exam_name: str, pdf_path: Path, gabarito_path: Path = None) -> List[Passage]:
    """Processa um exame completo."""
    
    print(f"\nProcessando: {exam_name}")
    print(f"  PDF: {pdf_path}")
    
    # Extrai texto do PDF
    text = extract_text_from_pdf(pdf_path)
    
    # Extrai gabarito se disponível
    answers = {}
    if gabarito_path and gabarito_path.exists():
        print(f"  Gabarito: {gabarito_path}")
        gabarito_text = extract_text_from_pdf(gabarito_path)
        # Padrão: "01 A" ou "1. A"
        answer_pattern = r'(\d{1,2})[\.\s]+([A-E])'
        for match in re.finditer(answer_pattern, gabarito_text):
            answers[match.group(1)] = match.group(2)
    
    # Divide em passagens (6 passagens com 5 questões cada)
    passages = []
    
    # Estratégia: divide o texto em 6 partes aproximadamente iguais
    # Cada parte deve ter ~5 questões
    
    # Primeiro, extrai todas as questões
    all_questions = parse_questions(text)
    
    if len(all_questions) >= 30:
        # Divide em 6 grupos de 5 questões
        for i in range(6):
            passage_num = i + 1
            start_q = i * 5
            end_q = start_q + 5
            
            passage_questions = all_questions[start_q:end_q]
            
            # Extrai texto da passagem (tudo antes da primeira questão do grupo)
            # Esta é uma aproximação - o texto real requer análise mais sofisticada
            passage_text = f"[Passagem {passage_num} - Texto extraído do PDF {exam_id}]"
            
            # Cria as questões
            questions = []
            for q_idx, (q_num, q_text, _) in enumerate(passage_questions):
                q_id = f"{exam_id}-q{int(q_num):02d}"
                correct = answers.get(q_num, "A")
                
                questions.append({
                    "id": q_id,
                    "question_type": detect_question_type(q_text),
                    "question_text": q_text[:200] + "..." if len(q_text) > 200 else q_text,
                    "options": ["(A)", "(B)", "(C)", "(D)", "(E)"],
                    "correct_answer": correct,
                    "correct_explanation": f"Resposta correta: {correct}",
                    "tested_concept": detect_question_type(q_text),
                    "difficulty": "medium"
                })
            
            passage = Passage(
                id=f"{exam_id}-p{passage_num}",
                exam_id=exam_id,
                exam_name=exam_name,
                source="FUVEST - Fundação Universitária para o Vestibular",
                text=passage_text,
                difficulty="medium",
                topic="social_sciences",  # Seria detectado do texto real
                estimated_reading_time=5,
                questions=questions
            )
            
            passages.append(passage)
    
    print(f"  >> {len(passages)} passagens, {sum(len(p.questions) for p in passages)} questoes")
    
    return passages

def main():
    pdf_dir = Path("fuvest_pdfs")
    
    # Define os exames a processar
    exams = [
        ("2026-2ed", "FUVEST 2025/2026 - 2ª Edição", "2026-2ed-prova.pdf", "2026-2ed-gabarito.pdf"),
        ("2026-1ed", "FUVEST 2025/2026 - 1ª Edição", "2026-1ed-prova.pdf", "2026-1ed-gabarito.pdf"),
        ("2025-2ed", "FUVEST 2024/2025 - 2ª Edição", "2025-2ed-prova.pdf", "2025-2ed-gabarito.pdf"),
        ("2025-1ed-manha", "FUVEST 2024/2025 - 1ª Edição (Manhã)", "2025-1ed-manha.pdf", None),
        ("2025-1ed-tarde", "FUVEST 2024/2025 - 1ª Edição (Tarde)", "2025-1ed-tarde.pdf", None),
        ("2024-manha", "FUVEST 2023/2024 (Manhã)", "2024-manha.pdf", None),
        ("2024-tarde", "FUVEST 2023/2024 (Tarde)", "2024-tarde.pdf", None),
    ]
    
    all_passages = []
    
    for exam_id, exam_name, prova_file, gabarito_file in exams:
        prova_path = pdf_dir / prova_file
        gabarito_path = pdf_dir / gabarito_file if gabarito_file else None
        
        if prova_path.exists():
            passages = process_exam(exam_id, exam_name, prova_path, gabarito_path)
            all_passages.extend([asdict(p) for p in passages])
        else:
            print(f"Arquivo não encontrado: {prova_path}")
    
    # Gera o JSON final
    output = {
        "schema_version": "3.3",
        "description": "Banco de questões FUVEST - Proficiência em Língua Inglesa",
        "last_updated": "2025-03-13",
        "total_passages": len(all_passages),
        "total_questions": sum(len(p["questions"]) for p in all_passages),
        "source": "FUVEST - Fundação Universitária para o Vestibular",
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
