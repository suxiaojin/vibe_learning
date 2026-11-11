"""Parse Part III reading-and-judgment questions for English V1."""
import re

from reading import ANSWER, NOISE, clean

HEADING = re.compile(r"^Part\s*(?:[Il1]{2,4}|M[I1]|3)\s*(?:True|Ture)\s*or\s*False\b", re.I)
NEXT_SECTION = re.compile(r"^Part\s*(?:IV|4)\s*Translation\b", re.I)
QUESTION = re.compile(r"^(?:\(\s*\)|\))?\s*(\d{1,3})\s*[.．)]\s*(?:\(\s*\)\s*)?(.+)")


def section_rows(rows):
    heading = ""
    selected = []
    for raw in rows:
        row = clean(raw)
        if HEADING.match(row):
            heading = row
        elif heading and NEXT_SECTION.match(row):
            break
        elif heading and row and not NOISE.fullmatch(row):
            selected.append(row)
    if not heading:
        raise ValueError("未识别 Part III 阅读理解（判断）标题。")
    return heading, selected


def parse_judgment(rows):
    heading, selected = section_rows(rows)
    if selected and re.match(r"^Directions?\s*:", selected[0], re.I):
        directions = ""
        for i, row in enumerate(selected):
            directions += " " + row
            compact = re.sub(r"[^a-z]", "", directions.lower())
            if all(marker in compact for marker in ("answersheet", "afortrue", "bforfalse")):
                selected = selected[i + 1:]
                break
        else:
            raise ValueError("判断题 A、B 与正确、错误的对应关系不明确。")
    else:
        raise ValueError("未识别判断题答题说明，无法确认正确、错误的选项映射。")
    count_match = re.search(r"\d+\s*[x×*]\s*(\d+)", heading + " " + directions, re.I)
    if not count_match:
        raise ValueError("无法确认阅读理解（判断）题数。")
    count = int(count_match[1])

    article = []
    groups = {}
    current = None
    expected = None
    for row in selected:
        match = QUESTION.match(row)
        if match:
            number = int(match[1])
            if expected is not None and number != expected:
                raise ValueError(f"判断题原题号不连续，遇到第 {number} 题。")
            expected = number + 1
            current = []
            groups[number] = current
            current.append(match[2])
        elif current is None:
            article.append(row)
        else:
            current.append(row)
    if not article or len(groups) != count:
        raise ValueError(f"判断题原文或小题识别不完整，预计 {count} 题，识别到 {len(groups)} 题。")
    questions = []
    for number, parts in groups.items():
        prompt = " ".join(parts).strip()
        if not prompt:
            raise ValueError(f"判断题第 {number} 题题干为空。")
        questions.append({
            "number": number, "prompt": prompt,
            "options": {"A": "正确", "B": "错误"},
        })
    return {"number": 1, "stem": " ".join(article), "questions": questions}


def judgment_answers(rows, numbers):
    _, selected = section_rows(rows)
    answers = {}
    for match in ANSWER.finditer("\n".join(selected)):
        number, letter = int(match[1]), match[2]
        if number not in numbers:
            continue
        if letter not in {"A", "B"}:
            raise ValueError(f"判断题第 {number} 题答案不是 A 或 B。")
        if number in answers and answers[number] != letter:
            raise ValueError(f"判断题第 {number} 题答案冲突。")
        answers[number] = letter
    if set(answers) != set(numbers):
        raise ValueError("阅读理解（判断）答案未完整匹配原题号。")
    return answers
