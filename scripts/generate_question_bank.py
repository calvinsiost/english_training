#!/usr/bin/env python3
"""
Gerador de banco de questões FUVEST para o app English Training.

Este script:
1. Converte provas em PDF para texto
2. Extrai passagens e questões usando regex e heurísticas
3. Gera JSON compatível com o app.js

Uso:
    python generate_question_bank.py --pdf-dir ./fuvest_pdfs --output ../data/initial-bank.json
"""

import argparse
import json
import re
import sys
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import List, Dict, Optional
from enum import Enum
import unicodedata

class QuestionType(Enum):
    MAIN_IDEA = "main_idea"
    INFERENCE = "inference"
    VOCAB_SYNONYM = "vocab_synonym"
    VOCAB_MEANING = "vocab_meaning"
    EXPRESSION = "expression"
    DETAIL = "detail"
    PURPOSE = "purpose"
    TONE = "tone"
    REFERENCE = "reference"
    STRUCTURE = "structure"

class Topic(Enum):
    TECHNOLOGY_AI = "technology_ai"
    MEDICINE_HEALTH = "medicine_health"
    ENVIRONMENT_CLIMATE = "environment_climate"
    SOCIAL_SCIENCES = "social_sciences"
    CULTURE_ARTS = "culture_arts"
    EDUCATION = "education"
    POLITICS_GOVERNANCE = "politics_governance"
    ECONOMICS_BUSINESS = "economics_business"
    SCIENCE_RESEARCH = "science_research"
    PSYCHOLOGY = "psychology"
    LANGUAGE_COMMUNICATION = "language_communication"
    HISTORY = "history"

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
    hint: Optional[str] = None

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

def normalize_text(text: str) -> str:
    """Normaliza texto para comparações."""
    text = unicodedata.normalize('NFKC', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def detect_question_type(question_text: str) -> str:
    """Detecta o tipo de questão baseado no texto."""
    question_lower = question_text.lower()
    
    patterns = {
        QuestionType.MAIN_IDEA: [
            r'tese principal', r'ideia central', r'tema principal',
            r'principal objetivo', r'propósito principal'
        ],
        QuestionType.INFERENCE: [
            r'pode-se inferir', r'infere-se', r'indica que',
            r'sugere que', r'implica que', r'dedução'
        ],
        QuestionType.VOCAB_SYNONYM: [
            r'pode ser substituído', r'sinônimo',
            r'sem alteração', r'sem prejuízo'
        ],
        QuestionType.VOCAB_MEANING: [
            r'significa que', r'contribui para',
            r'escolha do termo', r'efeito de sentido'
        ],
        QuestionType.EXPRESSION: [
            r'expressão', r'frase', r'proposição'
        ],
        QuestionType.DETAIL: [
            r'segundo o texto', r'conforme o texto',
            r'de acordo com'
        ],
        QuestionType.PURPOSE: [
            r'finalidade', r'objetivo', r'intenção'
        ],
        QuestionType.TONE: [
            r'tom', r'atitude', r'sentimento'
        ],
        QuestionType.REFERENCE: [
            r'refere-se', r'se refere', r'pronome'
        ]
    }
    
    for qtype, patterns_list in patterns.items():
        if any(re.search(pattern, question_lower) for pattern in patterns_list):
            return qtype.value
    
    return QuestionType.DETAIL.value

def detect_topic(passage_text: str) -> str:
    """Detecta o tema da passagem baseado em palavras-chave."""
    text_lower = passage_text.lower()
    
    keywords = {
        Topic.TECHNOLOGY_AI: ['artificial intelligence', 'machine learning', 'algorithm', 'digital', 'internet', 'computação', 'software'],
        Topic.MEDICINE_HEALTH: ['health', 'disease', 'medicine', 'medical', 'patient', 'treatment', 'saúde', 'doença'],
        Topic.ENVIRONMENT_CLIMATE: ['climate', 'environment', 'global warming', 'pollution', 'sustainability', 'meio ambiente', 'clima'],
        Topic.SOCIAL_SCIENCES: ['society', 'social', 'community', 'culture', 'inequality', 'social'],
        Topic.CULTURE_ARTS: ['art', 'artist', 'music', 'literature', 'culture', 'arte'],
        Topic.EDUCATION: ['education', 'school', 'learning', 'student', 'university', 'educação'],
        Topic.POLITICS_GOVERNANCE: ['politics', 'government', 'policy', 'democracy', 'política', 'governo'],
        Topic.ECONOMICS_BUSINESS: ['economy', 'economic', 'market', 'business', 'finance', 'economia'],
        Topic.SCIENCE_RESEARCH: ['science', 'research', 'scientist', 'study', 'discovery', 'pesquisa'],
        Topic.PSYCHOLOGY: ['psychology', 'mental', 'behavior', 'cognitive', 'psicologia'],
        Topic.LANGUAGE_COMMUNICATION: ['language', 'communication', 'speech', 'writing', 'linguagem'],
        Topic.HISTORY: ['history', 'historical', 'past', 'century', 'era', 'história']
    }
    
    scores = {}
    for topic, words in keywords.items():
        score = sum(1 for word in words if word in text_lower)
        if score > 0:
            scores[topic] = score
    
    if scores:
        return max(scores, key=scores.get).value
    return Topic.SOCIAL_SCIENCES.value

def parse_raw_text(text: str, exam_id: str, exam_name: str) -> List[Passage]:
    """
    Extrai passagens de texto bruto de prova FUVEST.
    
    Padrão esperado:
    - Textos em inglês (passagens)
    - Questões em português
    - 6 passagens com 5 questões cada (30 questões)
    """
    passages = []
    
    # Regex para identificar passagens (textos em inglês com múltiplos parágrafos)
    # Procura por blocos de texto inglês antes das questões
    passage_pattern = r'(?:Texto\s*\d+|Passage\s*\d+)?\s*([A-Z][^.]*?(?:\n{2,}.+?){3,})\s*(?=\d+[\.\)]|Questão)'
    
    # Divide o texto em potenciais passagens
    # Heurística: procura por blocos de texto seguidos por números de questões
    lines = text.split('\n')
    current_passage = []
    current_questions = []
    passage_count = 0
    
    for i, line in enumerate(lines):
        line = line.strip()
        
        # Detecta início de questão (número seguido de ponto ou parêntese)
        if re.match(r'^\d+[\.\)]\s', line):
            if current_passage and len(current_questions) < 5:
                current_questions.append(line)
            elif current_passage and len(current_questions) >= 5:
                # Finalizou uma passagem
                passage_count += 1
                passage_text = '\n'.join(current_passage).strip()
                
                # Analisa questões
                questions = []
                for j, q_text in enumerate(current_questions):
                    question = parse_question(q_text, text, i - len(current_questions) + j, exam_id, passage_count)
                    if question:
                        questions.append(question)
                
                if questions:
                    passage = Passage(
                        id=f"{exam_id}-p{passage_count}",
                        exam_id=exam_id,
                        exam_name=exam_name,
                        source="FUVEST - Adapted",
                        text=passage_text,
                        difficulty="medium",
                        topic=detect_topic(passage_text),
                        estimated_reading_time=len(passage_text.split()) // 200 + 1,
                        questions=questions
                    )
                    passages.append(passage)
                
                current_passage = []
                current_questions = [line]
        else:
            # É parte de uma passagem
            if len(line) > 20:  # Ignora linhas muito curtas
                current_passage.append(line)
    
    return passages

def parse_question(question_text: str, full_text: str, line_idx: int, exam_id: str, passage_num: int) -> Optional[Dict]:
    """Extrai uma questão do texto."""
    
    # Padrão: número da questão seguido do texto
    match = re.match(r'^(\d+)[\.\)]\s*(.+)$', question_text, re.DOTALL)
    if not match:
        return None
    
    q_num = int(match.group(1))
    q_text = match.group(2).strip()
    
    # Tenta encontrar opções A-E nas próximas linhas
    options = ['(A)', '(B)', '(C)', '(D)', '(E)']
    
    return {
        "id": f"{exam_id}-q{q_num:02d}",
        "question_type": detect_question_type(q_text),
        "question_text": q_text,
        "options": options,
        "correct_answer": "A",  # Placeholder - precisa do gabarito
        "correct_explanation": "Explicação a ser preenchida.",
        "tested_concept": detect_question_type(q_text),
        "difficulty": "medium"
    }

def generate_sample_bank() -> List[Dict]:
    """Gera um banco de exemplo completo baseado no template."""
    
    exams_data = {
        "2026-2ed": {
            "name": "FUVEST 2025/2026 - 2ª Edição",
            "date": "2025-10-12",
            "topics": ["technology_ai", "medicine_health", "environment_climate", "social_sciences", "culture_arts", "education"]
        },
        "2026-1ed": {
            "name": "FUVEST 2025/2026 - 1ª Edição", 
            "date": "2025-06-15",
            "topics": ["technology_ai", "medicine_health", "politics_governance", "economics_business", "psychology", "language_communication"]
        },
        "2025-2ed": {
            "name": "FUVEST 2024/2025 - 2ª Edição",
            "date": "2024-10-13",
            "topics": ["technology_ai", "medicine_health", "social_sciences", "culture_arts", "education", "history"]
        },
        "2025-1ed": {
            "name": "FUVEST 2024/2025 - 1ª Edição",
            "date": "2024-06-16",
            "topics": ["technology_ai", "environment_climate", "politics_governance", "economics_business", "psychology", "language_communication"]
        },
        "2024-manha": {
            "name": "FUVEST 2023/2024 - Manhã",
            "date": "2023-11-19",
            "topics": ["medicine_health", "technology_ai", "social_sciences", "science_research", "education", "culture_arts"]
        },
        "2024-tarde": {
            "name": "FUVEST 2023/2024 - Tarde",
            "date": "2023-11-19",
            "topics": ["environment_climate", "medicine_health", "politics_governance", "technology_ai", "economics_business", "history"]
        }
    }
    
    passages = []
    
    for exam_id, exam_info in exams_data.items():
        for passage_idx, topic in enumerate(exam_info["topics"], 1):
            passage_id = f"{exam_id}-p{passage_idx}"
            
            # Gera 5 questões para cada passagem
            questions = []
            q_base = (passage_idx - 1) * 5 + 1
            
            question_types = [
                QuestionType.MAIN_IDEA,
                QuestionType.INFERENCE,
                QuestionType.VOCAB_SYNONYM,
                QuestionType.VOCAB_MEANING,
                QuestionType.EXPRESSION
            ]
            
            for q_idx, q_type in enumerate(question_types, q_base):
                question_num = q_idx
                
                questions.append({
                    "id": f"{exam_id}-q{question_num:02d}",
                    "question_type": q_type.value,
                    "question_text": f"[Questão {question_num}] (Texto a ser extraído do PDF)",
                    "options": ["(A)", "(B)", "(C)", "(D)", "(E)"],
                    "correct_answer": "A",
                    "correct_explanation": "[Explicação a ser preenchida após extração do gabarito]",
                    "tested_concept": q_type.value,
                    "difficulty": "medium"
                })
            
            passage = Passage(
                id=passage_id,
                exam_id=exam_id,
                exam_name=exam_info["name"],
                source="FUVEST - Fundação Universitária para o Vestibular",
                text="[Texto da passagem a ser extraído do PDF]",
                difficulty="medium",
                topic=topic,
                estimated_reading_time=5,
                questions=questions
            )
            
            passages.append(asdict(passage))
    
    return passages

def merge_with_existing(new_passages: List[Dict], existing_file: Path) -> List[Dict]:
    """Mescla novas passagens com banco existente."""
    if not existing_file.exists():
        return new_passages
    
    with open(existing_file, 'r', encoding='utf-8') as f:
        existing = json.load(f)
    
    # Cria set de IDs existentes
    existing_ids = {p['id'] for p in existing.get('passages', existing)}
    
    # Adiciona apenas passagens novas
    for passage in new_passages:
        if passage['id'] not in existing_ids:
            existing.append(passage)
    
    return existing

def main():
    parser = argparse.ArgumentParser(description='Gera banco de questões FUVEST')
    parser.add_argument('--pdf-dir', type=str, help='Diretório com PDFs das provas')
    parser.add_argument('--output', type=str, default='../data/initial-bank.json',
                        help='Arquivo JSON de saída')
    parser.add_argument('--sample', action='store_true',
                        help='Gera banco de exemplo (sem PDFs)')
    parser.add_argument('--merge', action='store_true',
                        help='Mescla com banco existente')
    
    args = parser.parse_args()
    
    if args.sample:
        passages = generate_sample_bank()
        print(f"Gerado banco de exemplo com {len(passages)} passagens ({len(passages) * 5} questões)")
    else:
        print("Extração de PDF não implementada nesta versão.")
        print("Use --sample para gerar estrutura de exemplo.")
        sys.exit(1)
    
    output_path = Path(args.output)
    
    if args.merge and output_path.exists():
        passages = merge_with_existing(passages, output_path)
    
    # Gera o JSON final
    output = {
        "schema_version": "3.3",
        "description": "Banco de questões FUVEST - Proficiência em Língua Inglesa",
        "last_updated": "2025-03-13",
        "total_passages": len(passages),
        "total_questions": len(passages) * 5,
        "source": "FUVEST - Fundação Universitária para o Vestibular",
        "passages": passages
    }
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    
    print(f"Banco salvo em: {output_path}")
    print(f"Total: {output['total_passages']} passagens ({output['total_questions']} questões)")

if __name__ == '__main__':
    main()
