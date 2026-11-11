"""Extract Part I reading-comprehension passages and their numbered questions."""
import re
import unicodedata

import cv2


READING = re.compile(r"^Part\s*[I1]\s*Reading\s*Comprehension\b", re.I)
NEXT_PART = re.compile(r"^Part\s*(?:(?:[Il1]{1,3}|2)\s*Cloze\b|(?:II|III|IV|V|VI|VII|[2-9])\s*[a-z])", re.I)
PASSAGE = re.compile(r"^Passage\s*(\d+|one|two|three|four|five|six)\s*[.:]?$", re.I)
PASSAGE_NUMBERS = dict(zip(("one", "two", "three", "four", "five", "six"), range(1, 7)))
QUESTION = re.compile(r"^(\d{1,3})\s*[.)]\s*(.+)")
OPTION = re.compile(r"([A-D])\s*[.),:、]\s*(?=\S)")
ANSWER = re.compile(r"第\s*(\d{1,3})\s*题\s*:?\s*(?:答案\s*:\s*)?([A-D])(?=\s|[,.:;()]|$)")
NOISE = re.compile(r"^(?:\d+|第\s*\d+\s*页.*|(?:\d+\s*)?免费领取.*|(?:小红书搜索\s*[:：]\s*)?文行文化.*|[:：]?\s*h\s*t\s*t\s*p\s*s?\s*:.*)$", re.I)


def clean(text):
    return unicodedata.normalize("NFKC", text).strip()


def scan_rows(image, recognize):
    """Use ink bands to retain lines omitted by full-page text detection."""
    height, width = image.shape[:2]
    left, right = int(width * .065), int(width * .955)
    top, bottom = int(height * .065), int(height * .943)
    ink = cv2.cvtColor(image[top:bottom, left:right], cv2.COLOR_BGR2GRAY) < 155
    density = ink.sum(axis=1)
    spans = []
    for y, pixels in enumerate(density):
        if 7 <= pixels <= (right - left) * .8:
            if spans and y - spans[-1][1] <= 4:
                spans[-1][1] = y
            else:
                spans.append([y, y])
    crops = []
    for start, end in spans:
        if not 8 <= end - start <= int(height * .04):
            continue
        _, xs = ink[start:end + 1].nonzero()
        if xs.size:
            y1, y2 = max(0, top + start - 4), min(height, top + end + 5)
            x1, x2 = max(0, left + int(xs.min()) - 6), min(width, left + int(xs.max()) + 7)
            crops.append(image[y1:y2, x1:x2])
    result, _ = recognize(crops) if crops else ([], 0)
    return [text for text, score in result if score >= .5 and text.strip()]


def reading_part(rows):
    sections = []
    heading = None
    for raw in rows:
        row = clean(raw)
        if READING.match(row):
            heading = row
        elif heading and NEXT_PART.match(row):
            break
        elif heading and row and not NOISE.fullmatch(row):
            sections.append(row)
    return heading or "", sections


def split_choices(lines, letters="ABCD"):
    # Bare labels are only accepted at the start of an option row.
    lines = [re.sub(r"^([A-D])\s+(?=\S)", r"\1. ", line) if i else line for i, line in enumerate(lines)]
    text = " ".join(lines)
    markers = list(OPTION.finditer(text))
    separated = [match for match in markers if match.start() == 0 or not text[match.start() - 1].isalnum()]
    if "".join(match[1] for match in separated) == letters:
        markers = separated
    if "".join(match[1] for match in markers) != letters:
        return None
    values = {marker[1]: text[marker.end():markers[i + 1].start() if i + 1 < len(markers) else len(text)].strip()
              for i, marker in enumerate(markers)}
    return (text[:markers[0].start()].strip(), values) if all(values.values()) else None


def parse_reading(rows):
    heading, section = reading_part(rows)
    starts = [(i, int(token) if token.isdigit() else PASSAGE_NUMBERS[token.lower()])
              for i, row in enumerate(section) if (match := PASSAGE.fullmatch(row)) for token in (match[1],)]
    if not starts:
        raise ValueError("未找到 Part I 阅读理解及 Passage 标题。")
    if [number for _, number in starts] != list(range(1, len(starts) + 1)):
        raise ValueError("Passage 编号有缺失、重复或顺序异常，请核对原卷。")
    directions = " ".join(section[:starts[0][0]])
    passage_count = re.search(r"(\d+)\s*passages\b", directions, re.I)
    if passage_count and len(starts) != int(passage_count[1]):
        raise ValueError("识别到的 Passage 数与阅读理解说明不一致。")

    passages = []
    next_question = 1
    for (start, number), (end, _) in zip(starts, starts[1:] + [(len(section), 0)]):
        article = []
        children = []
        current = None
        for row in section[start + 1:end]:
            match = QUESTION.match(row)
            if match and int(match[1]) == next_question:
                current = (next_question, [match[2]])
                children.append(current)
                next_question += 1
            elif current:
                current[1].append(row)
            else:
                article.append(row)
        if not article or not children:
            raise ValueError(f"Passage {number} 缺少原文或小题。")
        questions = []
        for child_number, lines in children:
            result = split_choices(lines)
            if not result:
                raise ValueError(f"原卷第 {child_number} 小题的 A–D 选项未完整识别。")
            prompt, options = result
            if not prompt:
                raise ValueError(f"原卷第 {child_number} 小题缺少题干或选项。")
            questions.append({"number": child_number, "prompt": prompt, "options": options})
        passages.append({"number": number, "stem": " ".join(article), "questions": questions})
    question_count = re.search(r"\d+\s*[x×*]\s*(\d+)\s*points", heading, re.I)
    if question_count and next_question - 1 != int(question_count[1]):
        raise ValueError("识别到的小题数与阅读理解标题不一致。")
    return passages


def parse_reading_answers(rows, numbers):
    heading, section = reading_part(rows)
    if not heading:
        raise ValueError("答案解析 PDF 中未找到 Part I 阅读理解。")
    answers = {}
    for match in ANSWER.finditer("\n".join(section)):
        number, letter = int(match[1]), match[2]
        if number not in numbers:
            continue
        if number in answers and answers[number] != letter:
            raise ValueError(f"答案解析 PDF 中第 {number} 题有冲突答案。")
        answers[number] = letter
    missing = sorted(numbers - answers.keys())
    if missing:
        raise ValueError(f"答案解析 PDF 中未找到以下小题的明确答案：{missing}")
    return answers
