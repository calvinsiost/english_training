#!/usr/bin/env python3
"""
Extrator completo de PDFs FUVEST - Versao Final.
Lida com o layout intercalado de textos em ingles e questoes em portugues.
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

def clean_text(text):
    """Limpa texto extraido."""
    if not text:
        return ""
    
    # Remove (cid:172) e NOT SIGN
    text = text.replace('(cid:172)', ' ')
    text = text.replace('\u00ac', ' ')
    
    # Corrige caracteres acentuados
    fixes = {
        '�': 'ç', '�': 'ã', '�': 'õ', '�': 'á', '�': 'é', '�': 'í', '�': 'ó', '�': 'ú',
        '�': 'â', '�': 'ê', '�': 'ô', '�': 'à', '�': 'ü', '�': 'Ç', '�': 'Ã', '�': 'Õ',
        '�': 'Á', '�': 'É', '�': 'Í', '�': 'Ó', '�': 'Ú', '�': 'Â', '�': 'Ê', '�': 'Ô',
        '�': 'À', '�': 'Ü', '�': '�', '�': 'é', '�': 'a', '�': 'o', '�': 'a',
    }
    for wrong, correct in fixes.items():
        text = text.replace(wrong, correct)
    
    # Normaliza espacos
    text = re.sub(r' +', ' ', text)
    text = re.sub(r'\n ', '\n', text)
    text = re.sub(r' \n', '\n', text)
    text = re.sub(r'\n+', '\n', text)
    
    return text.strip()

def is_english_line(line):
    """Verifica se uma linha eh predominantemente em ingles."""
    if not line or len(line) < 5:
        return False
    
    # Conta palavras comuns em ingles vs portugues
    common_english = ['the', 'and', 'of', 'to', 'a', 'in', 'is', 'it', 'you', 'that', 'he', 'was', 'for', 'on', 'are', 'with', 'as', 'i', 'his', 'they', 'at', 'be', 'this', 'have', 'from', 'or', 'one', 'had', 'by', 'word', 'but', 'not', 'what', 'all', 'were', 'we', 'when', 'your', 'can', 'said', 'there', 'use', 'an', 'each', 'which', 'she', 'do', 'how', 'their', 'if', 'will', 'up', 'other', 'about', 'out', 'many', 'then', 'them', 'these', 'so', 'some', 'her', 'would', 'make', 'like', 'into', 'him', 'has', 'two', 'more', 'very', 'after', 'words', 'just', 'where', 'most', 'get', 'through', 'back', 'much', 'go', 'good', 'new', 'write', 'our', 'me', 'man', 'too', 'any', 'day', 'same', 'right', 'look', 'think', 'also', 'around', 'another', 'came', 'come', 'work', 'three', 'must', 'because', 'does', 'part', 'even', 'place', 'well', 'such', 'here', 'take', 'why', 'things', 'great', 'years', 'still', 'own', 'under', 'last', 'might', 'say', 'great', 'where', 'both', 'between', 'being', 'before', 'over', 'only', 'again', 'never', 'each', 'made', 'many', 'first', 'down', 'way', 'find', 'long', 'little', 'world', 'year', 'still', 'every', 'tell', 'very', 'when', 'much', 'would', 'there', 'their', 'what', 'said', 'each', 'which', 'she', 'will', 'about', 'could', 'other', 'after', 'many', 'some', 'them', 'these', 'would', 'make', 'like', 'into', 'time', 'has', 'more', 'her', 'two', 'him', 'see', 'now', 'than', 'how', 'its', 'our', 'out', 'day', 'had', 'who', 'oil', 'sit', 'set', 'run', 'eat', 'far', 'sea', 'eye', 'ago', 'off', 'too', 'any', 'try', 'ask', 'end', 'why', 'let', 'put', 'say', 'she', 'try', 'way', 'own', 'say', 'too', 'old']
    
    line_lower = line.lower()
    words = line_lower.split()
    
    english_count = sum(1 for word in words if word in common_english)
    return english_count >= 2  # Se tem pelo menos 2 palavras em ingles

def is_portuguese_question(line):
    """Verifica se eh uma questao em portugues."""
    if not line:
        return False
    
    # Marcadores de questao em portugues
    markers = ['conforme o texto', 'de acordo com', 'no texto', 'no trecho', 'a expressao', 'a palavra', 'o autor', 'a frase']
    line_lower = line.lower()
    return any(marker in line_lower for marker in markers)

def is_option_line(line):
    """Verifica se eh uma linha de opcao (A), (B), etc."""
    return bool(re.match(r'^\([A-E]\)', line.strip()))

def extract_passage_and_questions(text, q_start, q_end):
    """Extrai texto da passagem e questoes de um bloco de texto."""
    lines = text.split('\n')
    
    passage_lines = []
    questions = []
    current_question = None
    current_options = []
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        # Verifica se eh marcador de questao {01}
        if re.match(r'^\{\d{2}\}$', line):
            # Salva questao anterior se existir
            if current_question:
                questions.append({
                    'text': current_question,
                    'options': current_options
                })
            current_question = None
            current_options = []
            i += 1
            continue
        
        # Verifica se eh opcao
        if is_option_line(line):
            current_options.append(line)
            i += 1
            continue
        
        # Verifica se eh linha de separacao #####
        if '#####' in line:
            if current_question:
                questions.append({
                    'text': current_question,
                    'options': current_options
                })
            current_question = None
            current_options = []
            i += 1
            continue
        
        # Verifica se eh questao em portugues
        if is_portuguese_question(line):
            if current_question:
                questions.append({
                    'text': current_question,
                    'options': current_options
                })
            current_question = line
            current_options = []
        elif current_question is not None and line:
            # Continuacao da questao
            current_question += ' ' + line
        elif is_english_line(line):
            # Linha em ingles - parte da passagem
            passage_lines.append(line)
        
        i += 1
    
    # Salva ultima questao
    if current_question:
        questions.append({
            'text': current_question,
            'options': current_options
        })
    
    passage_text = ' '.join(passage_lines)
    
    return passage_text, questions

def parse_exam(exam_id, exam_name, pdf_path):
    """Faz parse completo de um exame."""
    print(f"\nProcessando: {exam_name}")
    
    # Extrai texto de todas as paginas
    raw_text = ""
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                raw_text += page_text + "\n"
    
    # Limpa
    text = clean_text(raw_text)
    print(f"  Texto total: {len(text)} chars")
    
    # Encontra blocos de passagens
    passages = []
    
    # Padrao: "Texto para as questoes de XX a YY"
    for i in range(6):  # 6 passagens
        q_start = i * 5 + 1
        q_end = q_start + 4
        
        # Procura pelo marcador desta passagem
        pattern = rf'Texto para as quest[õo]es de {q_start:02d} a {q_end:02d}'
        match = re.search(pattern, text, re.IGNORECASE)
        
        if match:
            # Extrai texto ate o proximo marcador ou fim
            start_pos = match.end()
            
            # Procura proximo marcador
            next_pattern = rf'Texto para as quest[õo]es de {q_end+1:02d}'
            next_match = re.search(next_pattern, text[start_pos:], re.IGNORECASE)
            
            if next_match:
                block_text = text[start_pos:start_pos + next_match.start()]
            else:
                block_text = text[start_pos:]
            
            # Extrai passagem e questoes
            passage_text, questions = extract_passage_and_questions(block_text, q_start, q_end)
            
            if passage_text and questions:
                # Formata questoes
                formatted_questions = []
                for j, q in enumerate(questions[:5]):  # Max 5 questoes
                    q_num = q_start + j
                    
                    # Garante 5 opcoes
                    opts = q.get('options', [])
                    while len(opts) < 5:
                        opts.append(f'({chr(65+len(opts))})')
                    opts = opts[:5]  # Limita a 5
                    
                    formatted_questions.append({
                        "id": f"{exam_id}-q{q_num:02d}",
                        "question_type": "detail",
                        "question_text": q['text'][:500],
                        "options": opts,
                        "correct_answer": "A",
                        "correct_explanation": "Resposta: A",
                        "tested_concept": "detail",
                        "difficulty": "medium"
                    })
                
                passages.append(Passage(
                    id=f"{exam_id}-p{i+1}",
                    exam_id=exam_id,
                    exam_name=exam_name,
                    source="FUVEST",
                    text=passage_text[:2000],
                    difficulty="medium",
                    topic="social_sciences",
                    estimated_reading_time=5,
                    questions=formatted_questions
                ))
    
    q_count = sum(len(p.questions) for p in passages)
    print(f"  >> {len(passages)} passagens, {q_count} questoes")
    
    return passages

def main():
    pdf_dir = Path("fuvest_pdfs")
    
    exams = [
        ("2026-2ed", "FUVEST 2025/2026 - 2 Edicao", "2026-2ed-prova.pdf"),
        ("2026-1ed", "FUVEST 2025/2026 - 1 Edicao", "2026-1ed-prova.pdf"),
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
