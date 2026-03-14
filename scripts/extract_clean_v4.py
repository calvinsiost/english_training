#!/usr/bin/env python3
"""
Extrator limpo de questoes FUVEST v4.
Suporta dois formatos de PDF:
  - Formato 2026: questoes marcadas com {NN}, opcoes com (A)
  - Formato 2025/2024: questoes marcadas com NN., opcoes com a) b) c) d) e)
"""

import json
import re
from pathlib import Path
from typing import Dict, List
import PyPDF2


def extract_text(pdf_path: Path) -> str:
    text = ""
    with open(pdf_path, 'rb') as f:
        reader = PyPDF2.PdfReader(f)
        for page in reader.pages:
            t = page.extract_text()
            if t:
                text += t + "\n"
    return text


def clean_text(text: str) -> str:
    """Remove caracteres especiais do PyPDF2."""
    text = text.replace('\u00a0', ' ')
    text = text.replace('\ufffd', ' ')
    # Keep accented chars, common punctuation, quotes
    text = re.sub(r'[^\x20-\x7E\n\u00C0-\u024F\u2018\u2019\u201C\u201D\u2013\u2014]', ' ', text)
    text = re.sub(r' {2,}', ' ', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def fix_hyphenation(text: str) -> str:
    """Fix PDF extraction artifacts."""
    # Fix "word -word" (space before hyphen at word boundary)
    text = re.sub(r'(\w) -(\w)', r'\1-\2', text)
    # Fix lost apostrophes in contractions: "can t" -> "can't", "it s" -> "it's"
    contraction_patterns = [
        (r"\bcan t\b", "can't"), (r"\bdon t\b", "don't"), (r"\bwon t\b", "won't"),
        (r"\bdoesn t\b", "doesn't"), (r"\bdidn t\b", "didn't"), (r"\bwasn t\b", "wasn't"),
        (r"\bisn t\b", "isn't"), (r"\baren t\b", "aren't"), (r"\bcouldn t\b", "couldn't"),
        (r"\bwouldn t\b", "wouldn't"), (r"\bshouldn t\b", "shouldn't"), (r"\bhaven t\b", "haven't"),
        (r"\bhasn t\b", "hasn't"), (r"\bweren t\b", "weren't"),
        (r"\bit s\b", "it's"), (r"\bthat s\b", "that's"), (r"\bwhat s\b", "what's"),
        (r"\bthere s\b", "there's"), (r"\bhere s\b", "here's"), (r"\bhe s\b", "he's"),
        (r"\bshe s\b", "she's"), (r"\bwho s\b", "who's"), (r"\blet s\b", "let's"),
        (r"\bwe ve\b", "we've"), (r"\bthey ve\b", "they've"), (r"\byou ve\b", "you've"),
        (r"\bI ve\b", "I've"), (r"\bwe re\b", "we're"), (r"\bthey re\b", "they're"),
        (r"\byou re\b", "you're"), (r"\bwe ll\b", "we'll"), (r"\bthey ll\b", "they'll"),
        (r"\byou ll\b", "you'll"), (r"\bhe ll\b", "he'll"), (r"\bshe ll\b", "she'll"),
        (r"\bit ll\b", "it'll"), (r"\bI ll\b", "I'll"), (r"\bI m\b", "I'm"),
        (r"\bwe d\b", "we'd"), (r"\bthey d\b", "they'd"), (r"\byou d\b", "you'd"),
        (r"\bhe d\b", "he'd"), (r"\bshe d\b", "she'd"), (r"\bI d\b", "I'd"),
    ]
    for pattern, replacement in contraction_patterns:
        text = re.sub(pattern, replacement, text)
    # Fix possessives: "city s" -> "city's", "doctor s" -> "doctor's"
    text = re.sub(r"(\w{2,}) s\b", r"\1's", text)
    return text

# Common words that get split by PDF extraction
_COMMON_WORDS = {
    'but', 'study', 'their', 'the', 'and', 'for', 'not', 'are', 'was', 'his',
    'her', 'has', 'had', 'have', 'been', 'who', 'with', 'this', 'that', 'from',
    'they', 'will', 'would', 'could', 'should', 'about', 'which', 'what', 'when',
    'where', 'how', 'than', 'then', 'into', 'over', 'under', 'stuck', 'author',
}

def rebuild_paragraphs(text: str) -> str:
    """Join broken lines into proper paragraphs."""
    lines = text.split('\n')
    paragraphs = []
    current = []
    for line in lines:
        line = line.strip()
        if not line:
            if current:
                paragraphs.append(' '.join(current))
                current = []
        else:
            current.append(line)
    if current:
        paragraphs.append(' '.join(current))
    result = '\n\n'.join(paragraphs)
    return fix_hyphenation(result)


def extract_answers(gabarito_path: Path) -> Dict[str, str]:
    """Extrai gabarito do PDF."""
    text = clean_text(extract_text(gabarito_path))
    answers = {}
    # Match patterns like "01 B" or "01. B" or "1) A"
    for m in re.finditer(r'(\d{1,2})\s*[\.\)\s]\s*([A-E])\b', text):
        answers[m.group(1).zfill(2)] = m.group(2).upper()
    return answers


def detect_topic(text: str) -> str:
    text_lower = text.lower()
    topics = {
        "technology_ai": ['artificial intelligence', 'algorithm', 'digital', 'software', 'a.i.', 'technology'],
        "medicine_health": ['health', 'disease', 'medicine', 'medical', 'patient', 'physician'],
        "environment_climate": ['climate', 'environment', 'warming', 'pollution', 'temperature', 'solar'],
        "social_sciences": ['society', 'social', 'community', 'inequality', 'fairness'],
        "culture_arts": ['art', 'artist', 'music', 'literature', 'museum', 'gallery', 'fiction'],
        "science_research": ['science', 'research', 'scientist', 'experiment', 'crowd'],
        "psychology": ['psychology', 'mental', 'behavior', 'cognitive'],
        "history": ['history', 'historical', 'century', 'ancient', 'map'],
        "politics_governance": ['politics', 'government', 'policy', 'democracy', 'gambling'],
        "economics_business": ['economy', 'economic', 'market', 'business'],
        "ecology_sound": ['sound', 'acoustic', 'silence', 'noise', 'ecosystem'],
        "education": ['education', 'school', 'learning', 'student'],
    }
    scores = {t: sum(1 for w in words if w in text_lower) for t, words in topics.items()}
    scores = {t: s for t, s in scores.items() if s > 0}
    return max(scores, key=scores.get) if scores else "social_sciences"


def detect_question_type(text: str) -> str:
    text_lower = text.lower()
    patterns = {
        "main_idea": [r'tese principal', r'ideia central', r'tema principal'],
        "inference": [r'pode-se inferir', r'infere-se', r'indica que', r'sugere que'],
        "vocab_synonym": [r'substitu.do', r'sin.nimo', r'sem altera', r'sem preju.zo'],
        "vocab_meaning": [r'significa', r'efeito de sentido', r'escolha do termo'],
        "detail": [r'segundo o texto', r'conforme', r'de acordo com'],
        "purpose": [r'finalidade', r'objetivo', r'inten..o'],
        "reference": [r'refere-se', r'se refere', r'pronome'],
        "expression": [r'express.o', r'no excerto', r'no trecho'],
    }
    for qtype, pats in patterns.items():
        if any(re.search(p, text_lower) for p in pats):
            return qtype
    return "detail"


def remove_page_headers(text: str) -> str:
    """Remove repeated page headers from text."""
    # After clean_text, accented chars may become spaces (e.g. PROFICIÊNCIA -> PROFICI NCIA)
    text = re.sub(r'Exame de Profici.*?Inglesa\)?\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'EXAME DE PROFICI\S*.*?(?:Ingl.sa?|ESTRANGEIRA)\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'Prova de Ingl.s\s*\d{2}/\d{2}/\d{4}\s*', '', text)
    # Catch cleaned versions where accents became spaces or other artifacts
    text = re.sub(r'EXAME DE PROFIC\s*I\s*.?\s*NCIA EM L\s*.?\s*NGUA ESTRANGEIRA\s*', '', text)
    text = re.sub(r'Prova de Ingl.s\s*-?\s*(?:Manha|Tarde|Manh.)?\s*\d{2}/\d{2}/\d{4}\s*', '', text)
    return text


# ============================================================
# FORMAT 1: 2026 exams - {NN} question markers, (A) options
# ============================================================

def parse_format_2026(text: str, exam_id: str, exam_name: str, answers: Dict[str, str]) -> List[dict]:
    """Parse exams with {NN} question markers."""
    text = clean_text(text)
    passages = []

    # Find passage headers
    passage_headers = list(re.finditer(
        r'Texto para as quest[a-z\u00e3\u00f5]es de (\d{2}) a (\d{2})',
        text, re.IGNORECASE
    ))

    # Find question markers {NN}
    q_positions = {m.group(1): m.start() for m in re.finditer(r'\{(\d{2})\}', text)}

    for idx, header in enumerate(passage_headers):
        q_start_num = int(header.group(1))
        q_end_num = int(header.group(2))

        # Extract passage text
        passage_start = header.end()
        first_q_key = f"{q_start_num:02d}"
        if first_q_key in q_positions:
            passage_end = q_positions[first_q_key]
        elif idx + 1 < len(passage_headers):
            passage_end = passage_headers[idx + 1].start()
        else:
            passage_end = len(text)

        passage_text = text[passage_start:passage_end].strip()
        passage_text = remove_page_headers(passage_text)
        # Remove source line at end
        passage_text = re.sub(r'\n\s*\w.*?\d{4}\.?\s*(Adaptado|Adapted|Aadaptado)\.?\s*$', '', passage_text, flags=re.MULTILINE)
        passage_text = rebuild_paragraphs(passage_text)

        # Extract questions
        questions = []
        for q_num in range(q_start_num, q_end_num + 1):
            q_key = f"{q_num:02d}"
            if q_key not in q_positions:
                continue

            q_pos = q_positions[q_key]
            next_q_key = f"{q_num + 1:02d}"
            if next_q_key in q_positions:
                q_end = q_positions[next_q_key]
            elif idx + 1 < len(passage_headers):
                q_end = passage_headers[idx + 1].start()
            else:
                q_end = len(text)

            q_content = text[q_pos + len(f'{{{q_key}}}'):q_end].strip()
            q_content = re.sub(r'#{3,}', '', q_content)
            q_content = remove_page_headers(q_content)

            # Extract options (A) through (E)
            options_match = re.search(
                r'\(A\)\s*(.*?)\s*\(B\)\s*(.*?)\s*\(C\)\s*(.*?)\s*\(D\)\s*(.*?)\s*\(E\)\s*(.*?)$',
                q_content, re.DOTALL
            )

            if options_match:
                q_text = q_content[:q_content.find('(A)')].strip()
                options = [f"({chr(65+i)}) {re.sub(r'\\s+', ' ', options_match.group(i+1)).strip()}"
                           for i in range(5)]
            else:
                q_text = q_content.strip()
                options = ["(A)", "(B)", "(C)", "(D)", "(E)"]

            q_text = re.sub(r'\s+', ' ', q_text).strip()
            correct = answers.get(q_key, "A")

            questions.append({
                "id": f"{exam_id}-q{q_key}",
                "question_type": detect_question_type(q_text),
                "question_text": q_text,
                "options": options,
                "correct_answer": correct,
                "correct_explanation": f"Resposta correta: {correct}",
                "tested_concept": detect_question_type(q_text),
                "difficulty": "medium"
            })

        if questions:
            reading_time = max(3, len(passage_text.split()) // 150)
            passages.append(make_passage(exam_id, idx + 1, exam_name, passage_text, questions, reading_time))

    return passages


# ============================================================
# FORMAT 2: 2025/2024 exams - NN. question markers, a) options
# ============================================================

def parse_format_2025(text: str, exam_id: str, exam_name: str, answers: Dict[str, str]) -> List[dict]:
    """Parse exams with NN. question markers and a) b) c) options."""
    text = clean_text(text)
    passages = []

    # Find passage headers - format: "Texto para as questões 01 a 05" (no "de")
    passage_headers = list(re.finditer(
        r'Texto para as quest[a-z\u00e3\u00f5]es\s+(\d{2})\s+a\s+(\d{2})',
        text, re.IGNORECASE
    ))

    if not passage_headers:
        return []

    # Find question markers: "01." or "01 ." at start of content
    q_positions = {}
    for m in re.finditer(r'(?:^|\n)\s*(\d{2})\.\s', text):
        q_key = m.group(1)
        if q_key not in q_positions:
            q_positions[q_key] = m.start()

    for idx, header in enumerate(passage_headers):
        q_start_num = int(header.group(1))
        q_end_num = int(header.group(2))

        # Passage text: from header end to first question
        passage_start = header.end()
        first_q_key = f"{q_start_num:02d}"
        if first_q_key in q_positions:
            passage_end = q_positions[first_q_key]
        elif idx + 1 < len(passage_headers):
            passage_end = passage_headers[idx + 1].start()
        else:
            passage_end = len(text)

        passage_text = text[passage_start:passage_end].strip()
        passage_text = remove_page_headers(passage_text)
        # Remove source/attribution
        passage_text = re.sub(r'\n\s*\(?\w.*?\d{4}\.?\s*(Adaptado|Adapted)\.?\)?\s*$', '', passage_text, flags=re.MULTILINE)
        passage_text = rebuild_paragraphs(passage_text)

        # Extract questions
        questions = []
        for q_num in range(q_start_num, q_end_num + 1):
            q_key = f"{q_num:02d}"
            if q_key not in q_positions:
                continue

            q_pos = q_positions[q_key]
            next_q_key = f"{q_num + 1:02d}"
            if next_q_key in q_positions:
                q_end_pos = q_positions[next_q_key]
            elif idx + 1 < len(passage_headers):
                q_end_pos = passage_headers[idx + 1].start()
            else:
                q_end_pos = len(text)

            q_content = text[q_pos:q_end_pos].strip()
            # Remove the "NN." prefix
            q_content = re.sub(r'^\d{2}\.\s*', '', q_content)
            q_content = remove_page_headers(q_content)

            # Extract options - handle line breaks between letter and )
            # Normalize: join letter + ) that got split across lines
            q_content_norm = re.sub(r'\b([a-eA-E])\s*\n\s*\)', r'\1)', q_content)

            # Try lowercase a) b) c) d) e) format
            options_match = re.search(
                r'(?:^|\n)\s*a\)\s*(.*?)\s*(?:^|\n)\s*b\)\s*(.*?)\s*(?:^|\n)\s*c\)\s*(.*?)\s*(?:^|\n)\s*d\)\s*(.*?)\s*(?:^|\n)\s*e\)\s*(.*?)$',
                q_content_norm, re.DOTALL | re.IGNORECASE | re.MULTILINE
            )

            if not options_match:
                # Try inline format: a) ... b) ... c) ... d) ... e) ...
                options_match = re.search(
                    r'\ba\)\s*(.*?)\s*\bb\)\s*(.*?)\s*\bc\)\s*(.*?)\s*\bd\)\s*(.*?)\s*\be\)\s*(.*?)$',
                    q_content_norm, re.DOTALL | re.IGNORECASE
                )

            if options_match:
                # Find where options start
                a_match = re.search(r'(?:^|\n)\s*a\)', q_content_norm, re.IGNORECASE | re.MULTILINE)
                if a_match:
                    q_text = q_content_norm[:a_match.start()].strip()
                else:
                    q_text = q_content_norm[:q_content_norm.lower().find('a)')].strip()
                options = [f"({chr(65+i)}) {re.sub(r'\\s+', ' ', options_match.group(i+1)).strip()}"
                           for i in range(5)]
            else:
                q_text = q_content.strip()
                options = ["(A)", "(B)", "(C)", "(D)", "(E)"]

            q_text = re.sub(r'\s+', ' ', q_text).strip()
            correct = answers.get(q_key, "A")

            questions.append({
                "id": f"{exam_id}-q{q_key}",
                "question_type": detect_question_type(q_text),
                "question_text": q_text,
                "options": options,
                "correct_answer": correct,
                "correct_explanation": f"Resposta correta: {correct}",
                "tested_concept": detect_question_type(q_text),
                "difficulty": "medium"
            })

        if questions:
            reading_time = max(3, len(passage_text.split()) // 150)
            passages.append(make_passage(exam_id, idx + 1, exam_name, passage_text, questions, reading_time))

    return passages


def make_passage(exam_id, num, exam_name, text, questions, reading_time):
    return {
        "id": f"{exam_id}-p{num}",
        "exam_id": exam_id,
        "exam_name": exam_name,
        "source": "FUVEST",
        "text": text,
        "difficulty": "medium",
        "topic": detect_topic(text),
        "estimated_reading_time": reading_time,
        "questions": questions,
        "stats": {
            "total_attempts": 0,
            "correct_count": 0,
            "accuracy_rate": 0,
            "avg_time": 0,
            "last_attempt": None
        }
    }


def detect_format(text: str) -> str:
    """Detect PDF format based on question markers."""
    curly_count = len(re.findall(r'\{\d{2}\}', text))
    dot_count = len(re.findall(r'(?:^|\n)\s*\d{2}\.\s', text))
    if curly_count >= 10:
        return "2026"
    return "2025"


def main():
    pdf_dir = Path("fuvest_pdfs")

    exams = [
        ("2026-2ed", "FUVEST 2025/2026 - 2a Edicao", "2026-2ed-prova.pdf", "2026-2ed-gabarito.pdf"),
        ("2026-1ed", "FUVEST 2025/2026 - 1a Edicao", "2026-1ed-prova.pdf", "2026-1ed-gabarito.pdf"),
        ("2025-2ed", "FUVEST 2024/2025 - 2a Edicao", "2025-2ed-prova.pdf", "2025-2ed-gabarito.pdf"),
        ("2025-1ed-manha", "FUVEST 2024/2025 - 1a Edicao (Manha)", "2025-1ed-manha.pdf", None),
        ("2025-1ed-tarde", "FUVEST 2024/2025 - 1a Edicao (Tarde)", "2025-1ed-tarde.pdf", None),
        ("2024-manha", "FUVEST 2023/2024 (Manha)", "2024-manha.pdf", None),
        ("2024-tarde", "FUVEST 2023/2024 (Tarde)", "2024-tarde.pdf", None),
    ]

    all_passages = []
    total_questions = 0

    for exam_id, exam_name, prova_file, gabarito_file in exams:
        prova_path = pdf_dir / prova_file
        if not prova_path.exists():
            print(f"SKIP: {prova_path} not found")
            continue

        raw_text = extract_text(prova_path)
        fmt = detect_format(raw_text)
        print(f"\n{exam_name}: {len(raw_text)} chars (format: {fmt})")

        answers = {}
        if gabarito_file:
            gab_path = pdf_dir / gabarito_file
            if gab_path.exists():
                answers = extract_answers(gab_path)
                print(f"  Gabarito: {len(answers)} answers")

        if fmt == "2026":
            passages = parse_format_2026(raw_text, exam_id, exam_name, answers)
        else:
            passages = parse_format_2025(raw_text, exam_id, exam_name, answers)

        q_count = sum(len(p['questions']) for p in passages)
        print(f"  => {len(passages)} passages, {q_count} questions")

        # Validate
        for p in passages:
            if len(p['text']) < 100:
                print(f"  WARNING: Short passage {p['id']}: {len(p['text'])} chars")
            for q in p['questions']:
                if q['options'] == ["(A)", "(B)", "(C)", "(D)", "(E)"]:
                    print(f"  WARNING: Empty options in {q['id']}")
                if len(q['question_text']) < 10:
                    print(f"  WARNING: Short question {q['id']}: '{q['question_text']}'")

        total_questions += q_count
        all_passages.extend(passages)

    output = {
        "schema_version": "3.3",
        "description": "Banco de questoes FUVEST - Proficiencia em Lingua Inglesa",
        "last_updated": "2026-03-13",
        "total_passages": len(all_passages),
        "total_questions": total_questions,
        "source": "FUVEST",
        "passages": all_passages
    }

    output_path = Path("../data/initial-bank.json")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nDone: {len(all_passages)} passages, {total_questions} questions")
    print(f"Output: {output_path}")


if __name__ == "__main__":
    main()
