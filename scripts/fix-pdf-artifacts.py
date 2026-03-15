#!/usr/bin/env python3
"""Fix PDF extraction artifacts in initial-bank.json using Claude API.

Sends each passage's text fields wrapped in XML tags to Claude,
receives corrected texts back in the same format.
"""

import asyncio
import json
import os
import re
import sys
import time
from pathlib import Path

import anthropic
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

INPUT_FILE = Path(__file__).parent.parent / "data" / "initial-bank.json"
OUTPUT_FILE = Path(__file__).parent.parent / "data" / "initial-bank-fixed.json"
REPORT_FILE = Path(__file__).parent / "fix-report.md"

MODEL = "claude-opus-4-6"
MAX_CONCURRENCY = 3
MAX_RETRIES = 3

SYSTEM_PROMPT = """You are a text-cleaning tool. You receive text fragments from Brazilian university entrance exam PDFs wrapped in XML tags. These texts have PDF extraction artifacts:

1. Words broken with spaces: "fi elds" → "fields", "sit ting" → "sitting", "méd icos" → "médicos"
2. Letter-by-letter spacing: "C o n s i d e r a n d o" → "Considerando"
3. Broken URLs: "commen tisfree" → "commentisfree"

Rules:
- Fix ONLY PDF extraction artifacts (rejoin broken words)
- Do NOT change meaning, add/remove words, or alter punctuation
- Preserve \\n characters exactly as they appear
- Return ALL fields in the EXACT same XML tag format
- If a field has no artifacts, return it unchanged
- No explanation, ONLY the XML output"""


def extract_fields(passage: dict) -> list[tuple[str, str]]:
    """Extract all text fields as (tag_name, value) pairs."""
    fields = [("passage_text", passage.get("text", ""))]
    for i, q in enumerate(passage.get("questions", [])):
        fields.append((f"q{i}_text", q.get("question_text", "")))
        for j, opt in enumerate(q.get("options", [])):
            fields.append((f"q{i}_opt{j}", opt))
    return fields


def apply_fields(passage: dict, field_map: dict[str, str]) -> dict:
    """Apply corrected text fields back to the passage."""
    result = json.loads(json.dumps(passage))  # deep copy
    if "passage_text" in field_map:
        result["text"] = field_map["passage_text"]
    for i, q in enumerate(result.get("questions", [])):
        key = f"q{i}_text"
        if key in field_map:
            q["question_text"] = field_map[key]
        for j in range(len(q.get("options", []))):
            key = f"q{i}_opt{j}"
            if key in field_map:
                q["options"][j] = field_map[key]
    return result


def fields_to_xml(fields: list[tuple[str, str]]) -> str:
    """Convert fields to XML string."""
    parts = []
    for tag, val in fields:
        parts.append(f"<{tag}>{val}</{tag}>")
    return "\n".join(parts)


def parse_xml_response(response: str, expected_tags: list[str]) -> dict[str, str] | None:
    """Parse XML-tagged response back to dict."""
    result = {}
    for tag in expected_tags:
        pattern = rf"<{tag}>(.*?)</{tag}>"
        match = re.search(pattern, response, re.DOTALL)
        if match:
            result[tag] = match.group(1)
        else:
            return None
    return result


async def fix_passage(client: anthropic.AsyncAnthropic, passage: dict, sem: asyncio.Semaphore) -> tuple[dict, list[tuple[str, str, str]], bool]:
    """Fix a passage. Returns (fixed_passage, changes_list, was_changed)."""
    passage_id = passage.get("id", "unknown")
    fields = extract_fields(passage)
    expected_tags = [tag for tag, _ in fields]
    xml_input = fields_to_xml(fields)

    for attempt in range(MAX_RETRIES):
        try:
            async with sem:
                response = await client.messages.create(
                    model=MODEL,
                    max_tokens=16000,
                    temperature=0,
                    system=SYSTEM_PROMPT,
                    messages=[{
                        "role": "user",
                        "content": f"Fix PDF extraction artifacts in these text fields:\n\n{xml_input}"
                    }]
                )

            response_text = response.content[0].text.strip()
            parsed = parse_xml_response(response_text, expected_tags)

            if parsed is None:
                missing = [t for t in expected_tags if f"<{t}>" not in response_text]
                print(f"  ERROR [{passage_id}]: Missing tags: {missing[:3]}... (attempt {attempt+1})")
                if attempt == MAX_RETRIES - 1:
                    print(f"  SKIPPED [{passage_id}]")
                    return passage, [], False
                continue

            # Validate and collect changes
            changes = []
            validated = {}
            for tag, orig in fields:
                fixed = parsed[tag]
                if len(fixed) > len(orig) + 5:
                    print(f"  WARNING [{passage_id}]: {tag} grew ({len(orig)}→{len(fixed)}), keeping original")
                    validated[tag] = orig
                else:
                    validated[tag] = fixed
                    if orig != fixed:
                        changes.append((tag, orig, fixed))

            result = apply_fields(passage, validated)
            was_changed = len(changes) > 0

            if was_changed:
                print(f"  FIXED [{passage_id}]: {len(changes)} field(s)")
            else:
                print(f"  CLEAN [{passage_id}]")

            return result, changes, was_changed

        except anthropic.RateLimitError:
            wait = 2 ** (attempt + 1)
            print(f"  RATE LIMITED [{passage_id}]: Waiting {wait}s...")
            await asyncio.sleep(wait)

        except Exception as e:
            print(f"  ERROR [{passage_id}]: {e} (attempt {attempt+1})")
            if attempt == MAX_RETRIES - 1:
                return passage, [], False
            await asyncio.sleep(1)

    return passage, [], False


async def main():
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ERROR: ANTHROPIC_API_KEY not set")
        sys.exit(1)

    print(f"Loading {INPUT_FILE}...")
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    passages = data["passages"]
    print(f"Found {len(passages)} passages\n")

    client = anthropic.AsyncAnthropic()
    sem = asyncio.Semaphore(MAX_CONCURRENCY)

    print(f"Processing with {MODEL} (concurrency={MAX_CONCURRENCY})...\n")
    start = time.time()

    tasks = [fix_passage(client, p, sem) for p in passages]
    results = await asyncio.gather(*tasks)

    elapsed = time.time() - start

    fixed_passages = []
    all_changes = []
    changed_count = 0

    for fixed_p, changes, was_changed in results:
        fixed_passages.append(fixed_p)
        if was_changed:
            changed_count += 1
            all_changes.append((fixed_p.get("id", "?"), changes))

    data["passages"] = fixed_passages
    data["schema_version"] = "3.4"
    data["last_updated"] = time.strftime("%Y-%m-%d")

    print(f"\nWriting {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Writing {REPORT_FILE}...")
    report_lines = [
        "# Fix Report: PDF Extraction Artifacts\n",
        f"- **Date:** {time.strftime('%Y-%m-%d %H:%M')}",
        f"- **Model:** {MODEL}",
        f"- **Total passages:** {len(passages)}",
        f"- **Passages changed:** {changed_count}",
        f"- **Passages unchanged:** {len(passages) - changed_count}",
        f"- **Elapsed:** {elapsed:.1f}s\n",
        "## Changes\n",
    ]

    if all_changes:
        for pid, changes in all_changes:
            report_lines.append(f"### {pid}\n")
            for tag, orig, fixed in changes:
                report_lines.append(f"**{tag}:**")
                report_lines.append(f"- Before: `{orig[:300]}`")
                report_lines.append(f"- After:  `{fixed[:300]}`\n")
    else:
        report_lines.append("No changes detected.\n")

    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(report_lines))

    print(f"\nDone! {changed_count}/{len(passages)} passages fixed in {elapsed:.1f}s")
    print(f"Review: {REPORT_FILE}")
    print(f"Fixed data: {OUTPUT_FILE}")


if __name__ == "__main__":
    asyncio.run(main())
