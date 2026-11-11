"""Extract single-sentence error correction questions for the English V1 preview."""

import re
from difflib import SequenceMatcher
from itertools import combinations

from reading import NOISE, QUESTION, clean


PART = re.compile(r"^Part\s*(?:V|5)\s*Error\s*Correction\b", re.I)
END = re.compile(r"^Part\s*(?:VI|6)\s*Writing\b", re.I)
LABELS = "ABCD"
MARKERS = re.compile(r"\[([A-D]):\s*([^\[\]\r\n]+)\]")
ANSWER_MARKER = re.compile(r"第\s*(\d{1,3})\s*题\s*[:：]?\s*")
REPLACEMENT = re.compile(
    r"(?:改\s*为|应\s*使用\s*(?:单数|复数)\s*形式)\s*[“\"‘]?"
    r"([A-Za-z]+(?:[-’'][A-Za-z]+)*(?:[ \t]+[A-Za-z]+(?:[-’'][A-Za-z]+)*)*)"
)


def marked_stem(stem):
    matches = list(MARKERS.finditer(stem))
    remainder = MARKERS.sub("", stem)
    return ("".join(match[1] for match in matches) == LABELS and all(match[2].strip() for match in matches)
            and "[" not in remainder and "]" not in remainder)


def ink_rows(image, recognize, *, margins=(.065, .065, .955, .943)):
    """Retain positions and recognize every text row, including sparse A–D labels."""
    import cv2

    height, width = image.shape[:2]
    left, top, right, bottom = margins
    left, right = round(width * left), round(width * right)
    top, bottom = round(height * top), round(height * bottom)
    ink = cv2.cvtColor(image[top:bottom, left:right], cv2.COLOR_BGR2GRAY) < 160
    spans = []
    for y, count in enumerate(ink.sum(axis=1)):
        if 3 <= count <= (right - left) * .8:
            if spans and y - spans[-1][1] <= 4:
                spans[-1][1] = y
            else:
                spans.append([y, y])

    rows = []
    for start, end in spans:
        if not 8 <= end - start <= height * .04:
            continue
        _, xs = ink[start:end + 1].nonzero()
        x1, x2 = left + int(xs.min()), left + int(xs.max()) + 1
        y1, y2 = top + start, top + end + 1
        rows.append((x1, y1, x2, y2))
    if not rows:
        return []
    results, _ = recognize([image[y1 - 4:y2 + 4, x1 - 4:x2 + 4] for x1, y1, x2, y2 in rows])
    return [(box, clean(text)) for box, (text, _) in zip(rows, results)]


def recognize_crops(crops, recognize):
    import cv2

    padded = [cv2.copyMakeBorder(crop, 5, 5, 7, 7, cv2.BORDER_CONSTANT, value=(255, 255, 255)) for crop in crops]
    results, _ = recognize(padded)
    return [clean(text) for text, _ in results]


def label_centers(image, box, text, recognize, remaining=LABELS):
    import cv2
    import numpy as np

    x1, y1, x2, y2 = box
    ink = cv2.cvtColor(image[y1:y2, x1:x2], cv2.COLOR_BGR2GRAY) < 160
    edges = np.flatnonzero(np.diff(np.r_[False, ink.any(axis=0), False]))
    runs = [(int(start), int(end)) for start, end in edges.reshape(-1, 2) if end - start >= (y2 - y1) * .28]
    if not 1 <= len(runs) <= len(remaining) or any(end - start > (y2 - y1) * 1.4 for start, end in runs):
        return None
    expected = remaining[:len(runs)]
    if re.sub(r"\W", "", text) != expected:
        letters = recognize_crops([image[y1:y2, x1 + start:x1 + end] for start, end in runs], recognize)
        if "".join(letters) != expected:
            return None
    return [(x1 + (start + end) / 2) / image.shape[1] for start, end in runs]


def underline_boxes(image, box, labels):
    import cv2
    import numpy as np

    x1, y1, x2, y2 = box
    height = y2 - y1
    ink = np.uint8(cv2.cvtColor(image[y1:y2, x1:x2], cv2.COLOR_BGR2GRAY) < 165)
    horizontal = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((1, max(5, round(height * .28))), np.uint8))
    _, _, components, _ = cv2.connectedComponentsWithStats(horizontal)
    lines = [(int(x), int(y), int(w), int(h)) for x, y, w, h, _ in components[1:]
             if y >= height * .77 and h <= max(3, height * .16)]
    if len(lines) < len(labels):
        return []
    # The underline band has several long strokes on the same baseline. Allow slight scan skew.
    tolerance = max(2, round(height * .08))
    baseline = max((y for _, y, _, _ in lines), key=lambda y: sum(w * w for _, other_y, w, _ in lines if abs(y - other_y) <= tolerance))
    lines = sorted(line for line in lines if abs(line[1] - baseline) <= tolerance)
    if not len(labels) <= len(lines) <= 12:
        return []

    def distance(group):
        return sum(abs((x1 + x + w / 2) / image.shape[1] - label) for (x, _, w, _), label in zip(group, labels))

    ranked = sorted((distance(group), group) for group in combinations(lines, len(labels)))
    best_distance, best = ranked[0]
    if best_distance > height * 3 / image.shape[1] or (
        len(ranked) > 1 and ranked[1][0] - best_distance < height * .2 / image.shape[1]
    ):
        return []
    if any(abs(x1 + x + w / 2 - label * image.shape[1]) > height * 2.2 for (x, _, w, _), label in zip(best, labels)):
        return []
    return [(x1 + x, y1 + y, w, h) for x, y, w, h in best]


def compact(text):
    return "".join(char.lower() for char in text if char.isalnum())


def mark_sentence(image, box, prompt, labels, recognize, letters=LABELS, numbered=True):
    lines = underline_boxes(image, box, labels)
    if not lines:
        return None
    x1, y1, _, y2 = box
    crops = []
    for x, y, width, height in lines:
        token = image[y1:y2, x:x + width].copy()
        token[y - y1:y - y1 + height, :] = 255
        prefix = image[y1:y2, x1:max(x, x1 + 1)].copy()
        if x <= x1 + 1:
            prefix[:] = 255
        crops.extend((token, prefix))
    texts = recognize_crops(crops, recognize)
    positions = [i for i, char in enumerate(prompt) if char.isalnum()]
    normalized = compact(prompt)
    marked, cursor = [], 0
    for letter, text, prefix, line in zip(letters, texts[::2], texts[1::2], lines):
        token = compact(text)
        if numbered:
            before = re.sub(r"^\d{1,3}\s*[.)]\s*", "", prefix)
            before = compact(before) if before != prefix else ""
        else:
            before = compact(prefix) if line[0] > x1 + 1 else ""
        if not token:
            return None
        if token not in normalized:
            # A short crop may read the letter o as zero. Confirm the spelling in the full line.
            token = token.replace("0", "o")
        candidates = []
        for match in re.finditer(rf"(?={re.escape(token)})", normalized):
            offset = match.start()
            start, end = positions[offset], positions[offset + len(token) - 1] + 1
            if start < cursor or (start > 0 and prompt[start - 1].isalnum()) or (end < len(prompt) and prompt[end].isalnum()):
                continue
            score = SequenceMatcher(None, normalized[:offset], before).ratio()
            candidates.append((score, start, end))
        ranked = sorted(candidates, reverse=True)
        if not ranked:
            return None
        score, start, end = ranked[0]
        if score < .8 or (len(ranked) > 1 and score - ranked[1][0] < .04):
            return None
        marked.extend((prompt[cursor:start], f"[{letter}: {prompt[start:end]}]"))
        cursor = end
    return "".join(marked) + prompt[cursor:]


def mark_native_line(line):
    text, characters, baseline, drawings, labels = line
    words = list(re.finditer(r"[\w]+(?:['’.-][\w]+)*", text))
    marked = []
    for letter, x in sorted(labels):
        candidates = []
        for rect in drawings:
            if not baseline - 1 <= rect.y0 <= baseline + 7 or not rect.x0 - 12 <= x <= rect.x1 + 12:
                continue
            covered = []
            for word in words:
                left = characters[word.start()]["bbox"][0]
                right = characters[word.end() - 1]["bbox"][2]
                if min(rect.x1, right) - max(rect.x0, left) >= (right - left) * .55:
                    covered.append(word)
            if covered:
                start, end = covered[0].start(), covered[-1].end()
                distance = abs((rect.x0 + rect.x1) / 2 - x) / max(rect.width, 12) + abs(rect.y0 - baseline) * .04
                candidates.append((distance, start, end))
        if candidates:
            _, start, end = min(candidates)
            marked.append((start, end, letter))
    if any(current[1] > following[0] for current, following in zip(marked, marked[1:])):
        return text
    for start, end, letter in reversed(marked):
        text = f"{text[:start]}[{letter}: {text[start:end]}]{text[end:]}"
    return text


def native_text_rows(page):
    import fitz

    raw = page.get_text("rawdict", sort=True, flags=fitz.TEXTFLAGS_RAWDICT & ~fitz.TEXT_PRESERVE_IMAGES)
    fragments = []
    for block in raw["blocks"]:
        for line in block.get("lines", []):
            chars = [char for span in line["spans"] for char in span["chars"]]
            if any(char["c"].strip() for char in chars):
                fragments.append((line["bbox"][1], line["bbox"][0], chars))
    groups = []
    for top, left, chars in sorted(fragments, key=lambda fragment: fragment[:2]):
        if not groups or top - groups[-1][0] > 1:
            groups.append((top, []))
        groups[-1][1].append((left, chars))
    for _, fragments in groups:
        characters = []
        for _, chars in sorted(fragments, key=lambda fragment: fragment[0]):
            if characters and chars[0]["bbox"][0] - characters[-1]["bbox"][2] > 2.5:
                characters.append({**characters[-1], "c": " "})
            characters.extend(chars)
        yield "".join(char["c"] for char in characters), characters


def native_corrections(document, previous_number, first_page):
    entries = []
    started = ended = False
    for page in document.pages(start=first_page - 1):
        rows = list(native_text_rows(page))
        if not started and not any(PART.match(clean(text)) for text, _ in rows):
            continue
        drawings = [item["rect"] for item in page.get_drawings() if item["rect"].width >= 5 and item["rect"].height <= 2]
        for text, characters in rows:
            if PART.match(clean(text)):
                started = True
                continue
            if not started or NOISE.fullmatch(clean(text)):
                continue
            if END.match(clean(text)):
                ended = True
                break
            match = QUESTION.match(text.strip())
            if match:
                if int(match[1]) != previous_number + len(entries) + 1:
                    return []
                entries.append({"number": int(match[1]), "sourcePage": page.number + 1, "labelPage": None, "lines": []})
                offset = len(text) - len(text.lstrip()) + match.start(2)
                characters = characters[offset:offset + len(match[2])]
                text = match[2]
            elif not entries:
                continue
            elif re.fullmatch(r"[A-D](?:\s*[A-D])*", text.strip()):
                entries[-1]["lines"][-1][-1].extend(
                    (character["c"], (character["bbox"][0] + character["bbox"][2]) / 2)
                    for character in characters if character["c"] in LABELS
                )
                entries[-1]["labelPage"] = page.number + 1
                continue
            baseline = max(character["origin"][1] for character in characters)
            entries[-1]["lines"].append((text, characters, baseline, drawings, []))
        if ended:
            break
    if not ended or len(entries) != 10:
        return []
    for entry in entries:
        stem = " ".join(mark_native_line(line).strip() for line in entry.pop("lines"))
        entry.update(stem=stem, stemIssue=None if marked_stem(stem) else "请对照原卷确认 A–D 标记。", questions=[])
    return entries


def extract_correction(pdf_path, previous_number, first_page=1):
    import cv2
    import fitz
    import numpy as np
    from rapidocr_onnxruntime import RapidOCR

    cv2.setNumThreads(1)
    results, entry, pending = [], None, None
    started, ended = False, False
    expected_count = None
    directions = []
    with fitz.open(pdf_path) as document:
        native = native_corrections(document, previous_number, first_page)
        if native and all(not entry["stemIssue"] for entry in native):
            return native
        recognize = RapidOCR(intra_op_num_threads=2, inter_op_num_threads=1).text_rec
        for page in document.pages(start=first_page - 1):
            pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), colorspace=fitz.csRGB, alpha=False)
            pixels = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, 3)
            image = cv2.cvtColor(pixels, cv2.COLOR_RGB2BGR)
            page_number = page.number + 1
            for box, text in ink_rows(image, recognize):
                if not started:
                    started = bool(PART.match(text))
                    continue
                if END.match(text):
                    ended = True
                    break
                if not text or NOISE.fullmatch(text):
                    continue
                number = QUESTION.match(text)
                if number:
                    n = int(number[1])
                    if not results:
                        count = re.search(r"(\d+)\s*sentences\b", " ".join(directions), re.I)
                        count = count or re.search(r"\b2\s*[x×*]\s*(\d+)", " ".join(directions), re.I)
                        expected_count = int(count[1]) if count else None
                    if n <= previous_number or any(item["number"] == n for item in results):
                        raise ValueError(f"Part V 题号 {n} 重复或超出范围。")
                    entry = {"number": n, "stem": number[2], "sourcePage": page_number, "labelPage": None,
                             "stemIssue": "请对照原卷确认 A–D 标记。", "questions": []}
                    results.append(entry)
                    pending = (image, box, number[2], "", True)
                    remaining = LABELS
                elif not results:
                    directions.append(text)
                else:
                    centers = label_centers(image, box, text, recognize, remaining) if pending and remaining else None
                    if centers:
                        source_image, sentence_box, prompt, previous, numbered = pending
                        letters, remaining = remaining[:len(centers)], remaining[len(centers):]
                        entry["labelPage"] = page_number
                        marked = mark_sentence(source_image, sentence_box, prompt, centers, recognize, letters, numbered)
                        if marked:
                            entry["stem"] = previous + marked
                            if marked_stem(entry["stem"]):
                                entry["stemIssue"] = None
                        pending = None
                    elif re.search(r"[a-z]{2,}", text):
                        previous = entry["stem"] + " "
                        entry["stem"] = previous + text
                        pending = (image, box, text, previous, False)
            if ended:
                break
    if not started or not ended or not results or not expected_count:
        if native:
            return native
        raise ValueError("未能确认 Part V 的标题、题量或结束位置。")
    expected = list(range(previous_number + 1, previous_number + 1 + expected_count))
    by_number = {item["number"]: item for item in results}
    if list(by_number) != sorted(by_number) or not set(by_number) <= set(expected):
        raise ValueError("Part V 识别到异常题号，请核对原卷。")
    for entry in native:
        if not entry["stemIssue"] or entry["number"] not in by_number or by_number[entry["number"]]["stemIssue"]:
            by_number[entry["number"]] = entry
    return [by_number.get(n, {"number": n, "stem": "", "sourcePage": None, "labelPage": None,
                              "stemIssue": "未识别到题干，请对照原卷补录。", "questions": []}) for n in expected]


def fill_correction_answers(entries, answer_pdf):
    import fitz

    with fitz.open(answer_pdf) as document:
        rows = [clean(line) for page in document for line in page.get_text().splitlines()]
    start = next((index for index, row in enumerate(rows) if PART.match(row)), None)
    end = next((index for index, row in enumerate(rows) if start is not None and index > start and END.match(row)), len(rows))
    text = "\n".join(row for row in rows[start + 1:end] if row and not NOISE.fullmatch(row)) if start is not None else ""
    markers = list(ANSWER_MARKER.finditer(text))
    blocks = {}
    for i, marker in enumerate(markers):
        blocks.setdefault(int(marker[1]), []).append(text[marker.end():markers[i + 1].start() if i + 1 < len(markers) else len(text)].strip())

    for entry in entries:
        n = entry["number"]
        candidates = blocks.get(n, [])
        block = candidates[0] if len(candidates) == 1 else ""
        match = re.match(r"(?:答案\s*:\s*)?([A-D])(?=\s|[,.:;()]|$)", block)
        explanation = re.search(r"解析\s*:\s*(.*)", block, re.S)
        explanation = re.sub(r"\s+", " ", explanation[1]).strip() if explanation else ""
        replacements = set(REPLACEMENT.findall(explanation))
        correction = next(iter(replacements)) if len(replacements) == 1 else ""
        answer = match[1] if match else None
        entry["questions"] = [{"number": n, "answer": answer, "correction": correction, "explanation": explanation,
                               "answerIssue": None if answer and correction else "请对照答案 PDF 核对错误位置和改正内容。"}]
    return entries
