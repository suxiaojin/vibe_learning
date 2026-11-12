"""Part II cloze extraction for the English V1 preview."""
import re
from difflib import SequenceMatcher

from judgment import HEADING as NEXT_PART
from reading import ANSWER, NOISE, OPTION, clean, split_choices

CLOZE = re.compile(r"^Part\s*(?:[Il1]{1,3}|2)\s*Cloze\b", re.I)
QUESTION = re.compile(r"^(\d{1,3})\s*[.．)]\s*(.*)")


def part_rows(rows, require_count=True):
    active = False
    heading = ""
    selected = []
    for raw in rows:
        row = clean(raw)
        if CLOZE.match(row):
            active, heading = True, row
        elif active and NEXT_PART.match(row):
            break
        elif active and row and not NOISE.fullmatch(row):
            selected.append(row)
    if not heading:
        raise ValueError("未识别 Part II 完形填空标题。")
    directions = " ".join(selected[:5])
    count_match = (re.search(r"\d+\s*[x×*]\s*(\d+)\s*points", heading, re.I)
                   or re.search(r"(\d+)\s*blanks", directions, re.I)
                   or re.search(r"\(\s*1\s*[x×*]\s*(\d+)\s*\)", directions, re.I))
    if not count_match and require_count:
        raise ValueError("无法确认完形填空题数。")
    return selected, int(count_match[1]) if count_match else None


def first_option_row(rows):
    return next((i for i, row in enumerate(rows)
                 if (match := QUESTION.match(row)) and (option := OPTION.match(match[2])) and option[1] == "A"), None)


def option_groups(rows, numbers):
    groups = {}
    current = None
    for row in rows:
        match = QUESTION.match(row)
        if match and int(match[1]) in numbers:
            number = int(match[1])
            if number in groups:
                raise ValueError(f"完形填空第 {number} 题重复。")
            current = [match[2]]
            groups[number] = current
        elif current is not None:
            current.append(row)
    return {number: result[1] for number, lines in groups.items() if (result := split_choices(lines)) and not result[0]}


def blank_position(rows, token):
    matches = [(i, match) for i, row in enumerate(rows) for match in token.finditer(row)]
    if len(matches) > 1:
        matches = [(i, match) for i, match in matches if re.search(r"[_—– ]{2,}$|[_—–]$", rows[i][:match.start()])
                   or re.match(r"(?:[.．]?[_—–]| {2,})", rows[i][match.end():])]
    return matches[0] if len(matches) == 1 else None


def parse_cloze(rows, fallback_rows):
    selected, count = part_rows(rows, require_count=False)
    fallback, fallback_count = part_rows(fallback_rows, require_count=False)
    count = count or fallback_count
    if not count:
        raise ValueError("无法确认完形填空题数。")
    first = first_option_row(selected)
    if first is None:
        raise ValueError("未找到完整的完形填空选项。")
    passage = selected[:first]
    if passage and re.match(r"^Directions?\s*:", passage[0], re.I):
        directions = ""
        direction_end = None
        for i, row in enumerate(passage):
            directions += re.sub(r"\s+", "", row).lower()
            if "answersheet" in directions:
                direction_end = i
                break
        if direction_end is None:
            raise ValueError("无法区分完形填空说明与原文。")
        passage = passage[direction_end + 1:]

    option_rows = selected[first:]
    first_number = int(QUESTION.match(option_rows[0])[1])
    numbers = range(first_number, first_number + count)
    fallback_start = first_option_row(fallback)
    fallback_questions = option_groups(fallback[fallback_start:], numbers) if fallback_start is not None else {}
    primary_questions = option_groups(option_rows, numbers)
    questions = {}
    for number in numbers:
        options = fallback_questions.get(number) or primary_questions.get(number)
        if not options:
            raise ValueError(f"完形填空第 {number} 题选项识别不完整。")
        questions[number] = {"number": number, "options": options}
    fallback_passage = fallback[:fallback_start]
    for number in numbers:
        token = re.compile(rf"(?<!\d){number}(?!\d)")
        if sum(len(token.findall(row)) for row in passage) == 0:
            candidate = [row for row in fallback_passage if len(token.findall(row)) == 1]
            if len(candidate) == 1:
                similarity = [(SequenceMatcher(None, row.lower(), candidate[0].lower()).ratio(), i)
                              for i, row in enumerate(passage)]
                score, index = max(similarity, default=(0, -1))
                if score >= .65:
                    passage[index] = candidate[0]
        position = blank_position(passage, token)
        if position is None:
            # A printed option group can exist without a numbered blank in the passage.
            if not any(token.search(row) for row in passage):
                continue
            raise ValueError(f"无法确认第 {number} 空在完形填空原文中的位置。")
        index, match = position
        row = passage[index]
        before = row[:match.start()].rstrip(" _—–")
        after = re.sub(r"^(?:[.．]?[_—–]+)?\s*", "", row[match.end():])
        passage[index] = f"{before} ___{number}___ {after}".strip()

    stem = re.sub(r" {2,}", " ", " ".join(passage)).strip()
    if not stem:
        raise ValueError("完形填空原文为空。")
    return {"number": 1, "stem": stem, "questions": list(questions.values())}


def cloze_answers(rows, numbers):
    selected, _ = part_rows(rows, require_count=False)
    text = "\n".join(selected)
    answers = {}
    for match in ANSWER.finditer(text):
        number, letter = int(match[1]), match[2]
        if number not in numbers:
            continue
        if number in answers and answers[number] != letter:
            raise ValueError(f"完形填空第 {number} 题答案冲突。")
        answers[number] = letter
    if set(answers) != set(numbers):
        raise ValueError("完形填空答案未完整匹配原题号。")
    return answers
