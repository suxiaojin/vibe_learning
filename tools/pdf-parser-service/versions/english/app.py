"""English V1 development preview and its reading-comprehension parser."""
import argparse
import fcntl
import hashlib
import json
import os
import re
import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field

from reading import NEXT_PART, READING, clean, parse_reading, parse_reading_answers, scan_rows
from cloze import CLOZE, cloze_answers, parse_cloze
from judgment import HEADING as JUDGMENT_HEADING, NEXT_SECTION as JUDGMENT_END, judgment_answers, parse_judgment
from translation import PART as TRANSLATION_PART, END as TRANSLATION_END, parse_translation, translation_answers
from correction import extract_correction, fill_correction_answers, ink_rows, marked_stem
from answer_keys import AnswerKey
from writing import extract_writing, extract_writing_answer
from paper_import import import_questions, import_task_router


app = FastAPI(title="Vibe Learning English V1 Reading Parser")
sample_path = Path(os.environ.get("VIBE_ENGLISH_SAMPLE_PATH",
    "/data/vibe_pdf_parser_tasks_english/english-v1-reading-sample.json"))
preview_hosts = set(os.environ.get("VIBE_ENGLISH_PREVIEW_HOSTS", "127.0.0.1,172.18.255.71").split(","))


@contextmanager
def lock_sample():
    sample_path.parent.mkdir(parents=True, exist_ok=True)
    with sample_path.with_suffix('.lock').open('a') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        yield


class ReadingQuestion(BaseModel):
    number: int
    prompt: str = Field(min_length=1, max_length=4000)
    options: dict[Literal["A", "B", "C", "D"], str]
    answer: Literal["A", "B", "C", "D"] | None = None


class ReadingPassage(BaseModel):
    number: int
    stem: str = Field(min_length=1, max_length=25000)
    questions: list[ReadingQuestion]


class ClozeQuestion(BaseModel):
    number: int
    options: dict[Literal["A", "B", "C", "D"], str]
    answer: Literal["A", "B", "C", "D"] | None = None


class ClozePassage(BaseModel):
    number: int
    stem: str = Field(min_length=1, max_length=25000)
    questions: list[ClozeQuestion]


class JudgmentQuestion(BaseModel):
    number: int
    prompt: str = Field(min_length=1, max_length=4000)
    options: dict[Literal["A", "B"], str]
    answer: Literal["A", "B"] | None = None


class JudgmentPassage(BaseModel):
    number: int
    stem: str = Field(min_length=1, max_length=25000)
    questions: list[JudgmentQuestion]


class TranslationQuestion(BaseModel):
    number: int
    options: dict[str, str]
    answer: str | None = Field(default=None, max_length=4000)


class TranslationSection(BaseModel):
    number: int
    title: str
    stem: str = Field(min_length=1, max_length=25000)
    questions: list[TranslationQuestion]


class CorrectionQuestion(BaseModel):
    number: int
    answer: Literal["A", "B", "C", "D"] | None = None
    correction: str = Field(default="", max_length=4000)
    explanation: str = Field(default="", max_length=8000)


class CorrectionPassage(BaseModel):
    number: int
    stem: str = Field(max_length=4000)
    questions: list[CorrectionQuestion] = Field(min_length=1, max_length=1)


class WritingQuestion(BaseModel):
    number: int
    answer: str = Field(default="", max_length=25000)


class WritingPassage(BaseModel):
    number: int
    stem: str = Field(min_length=1, max_length=25000)
    questions: list[WritingQuestion] = Field(min_length=1, max_length=1)


class SampleUpdate(BaseModel):
    revision: str
    passages: list[ReadingPassage]
    clozePassages: list[ClozePassage] | None = None
    judgmentPassages: list[JudgmentPassage] | None = None
    translationSections: list[TranslationSection] | None = None
    correctionPassages: list[CorrectionPassage] | None = None
    writingPassages: list[WritingPassage] | None = None


@app.get("/health")
def health():
    return {"status": "ok"}


def require_preview_host(request):
    if not request.client or request.client.host not in preview_hosts:
        raise HTTPException(status_code=404)


def read_sample():
    try:
        raw = sample_path.read_bytes()
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="尚未保存英语 V1 测试样本。") from None
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


@app.get("/english-v1/sample")
def sample(request: Request):
    require_preview_host(request)
    data, revision = read_sample()
    return {**data, "revision": revision}


def question_numbers(passages):
    return [(p["number"], [q["number"] for q in p["questions"]]) for p in passages]


def update_corrections(current, incoming):
    if question_numbers(incoming) != question_numbers(current):
        raise HTTPException(status_code=400, detail="短文改错题号必须与当前测试样本一致。")
    for existing, passage in zip(current, incoming):
        if passage["stem"] != existing["stem"]:
            if not marked_stem(passage["stem"]):
                raise HTTPException(status_code=400, detail=f'请按原句顺序填写第 {passage["number"]} 题的 A–D 标记。')
            existing.update(stem=passage["stem"], stemIssue=None)
        saved_question, = existing["questions"]
        question, = passage["questions"]
        if any(saved_question[key] != question[key] for key in ("answer", "correction")):
            saved_question["answerIssue"] = None if question["answer"] and question["correction"].strip() else "请填写错误位置和改正内容。"
        saved_question.update(question)


@app.put("/english-v1/sample")
def update_sample(request: Request, update: SampleUpdate):
    require_preview_host(request)
    with lock_sample():
        data, revision = read_sample()
        if update.revision != revision:
            raise HTTPException(status_code=409, detail="测试样本已有新版本，请先保留你的修改，再刷新页面。")
        passages = [passage.model_dump() for passage in update.passages]
        if question_numbers(passages) != question_numbers(data["passages"]):
            raise HTTPException(status_code=400, detail="题号必须与当前测试样本一致。")
        cloze_passages = (data.get("clozePassages", []) if update.clozePassages is None else
                          [passage.model_dump() for passage in update.clozePassages])
        if question_numbers(cloze_passages) != question_numbers(data.get("clozePassages", [])):
            raise HTTPException(status_code=400, detail="完形填空题号必须与当前测试样本一致。")
        judgment_passages = (data.get("judgmentPassages", []) if update.judgmentPassages is None else
                             [passage.model_dump() for passage in update.judgmentPassages])
        if question_numbers(judgment_passages) != question_numbers(data.get("judgmentPassages", [])):
            raise HTTPException(status_code=400, detail="阅读理解（判断）题号必须与当前测试样本一致。")
        translation_sections = (data.get("translationSections", []) if update.translationSections is None else
                                [section.model_dump() for section in update.translationSections])
        if question_numbers(translation_sections) != question_numbers(data.get("translationSections", [])) or [s['title'] for s in translation_sections] != [s['title'] for s in data.get('translationSections', [])]:
            raise HTTPException(status_code=400, detail="翻译选择的分节和题号必须与当前测试样本一致。")
        for section in translation_sections:
            if not section['stem'].strip():
                raise HTTPException(status_code=400, detail="翻译题干不能为空。")
            allowed = {1: 'ABCD', 2: 'ABCDEFGHIJ', 3: ''}.get(section['number'])
            if allowed is None:
                raise HTTPException(status_code=400, detail="未知翻译分节。")
            for question in section['questions']:
                if set(question['options']) != set(allowed) or any(not value.strip() or len(value) > 4000 for value in question['options'].values()) or (allowed and question['answer'] is not None and question['answer'] not in set(allowed)):
                    raise HTTPException(status_code=400, detail=f'第 {question["number"]} 题的选项或答案无效。')
        for group, allowed in ((passages, "ABCD"), (cloze_passages, "ABCD"), (judgment_passages, "AB")):
            for passage in group:
                if not passage["stem"].strip():
                    raise HTTPException(status_code=400, detail=f'Passage {passage["number"]} 的题干不能为空。')
                for question in passage["questions"]:
                    options = question["options"]
                    if ("prompt" in question and not question["prompt"].strip()) or set(options) != set(allowed) or any(
                        not text.strip() or len(text) > 4000 for text in options.values()
                    ):
                        raise HTTPException(status_code=400, detail=f'请填写第 {question["number"]} 题和全部选项。')
        data["passages"] = passages
        if "clozePassages" in data or update.clozePassages is not None:
            data["clozePassages"] = cloze_passages
        if "judgmentPassages" in data or update.judgmentPassages is not None:
            data["judgmentPassages"] = judgment_passages
        if "translationSections" in data or update.translationSections is not None:
            data["translationSections"] = translation_sections
        if update.correctionPassages is not None:
            update_corrections(data.get("correctionPassages", []), [passage.model_dump() for passage in update.correctionPassages])
        if update.writingPassages is not None:
            writing = [passage.model_dump() for passage in update.writingPassages]
            if question_numbers(writing) != question_numbers(data.get("writingPassages", [])):
                raise HTTPException(status_code=400, detail="写作题号必须与当前测试样本一致。")
            if any(not passage["stem"].strip() for passage in writing):
                raise HTTPException(status_code=400, detail="写作题干不能为空。")
            data["writingPassages"] = writing
        write_sample(data)
        saved, new_revision = read_sample()
    return {**saved, "revision": new_revision}


class PdfPartCursor:
    """Resume on the boundary page, which can contain both adjacent parts."""

    def __init__(self):
        self.page_index = 0

    def pages(self, document):
        for page in document.pages(start=self.page_index):
            self.page_index = page.number
            yield page


def extract_reading(pdf_path, cursor=None):
    import cv2
    import fitz
    import numpy as np
    from rapidocr_onnxruntime import RapidOCR

    cv2.setNumThreads(1)
    ocr = None
    rows = []
    started = False
    with fitz.open(pdf_path) as document:
        for page in (cursor or PdfPartCursor()).pages(document):
            native = page.get_text("text", sort=True).splitlines()
            if sum(char.isascii() and char.isalpha() for row in native for char in row) >= 160:
                page_rows = native
            else:
                if ocr is None:
                    ocr = RapidOCR(intra_op_num_threads=2, inter_op_num_threads=1)
                pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), colorspace=fitz.csRGB, alpha=False)
                image = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, 3)
                page_rows = scan_rows(cv2.cvtColor(image, cv2.COLOR_RGB2BGR), ocr.text_rec)
            rows.extend(page_rows)
            started = started or any(READING.match(clean(row)) for row in page_rows)
            if started and any(NEXT_PART.match(clean(row)) for row in page_rows):
                break
    return parse_reading(rows)


def ocr_page_rows(page, ocr):
    """Get full-page detector rows for ambiguous, tightly spaced option labels."""
    import fitz
    import numpy as np
    import cv2

    pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), colorspace=fitz.csRGB, alpha=False)
    image = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, 3)
    image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    detailed, _ = ocr(image)
    blocks = []
    for box, text, _ in detailed or []:
        xs, ys = zip(*box)
        blocks.append((min(ys), min(xs), str(text)))
    groups = []
    for y, x, text in sorted(blocks):
        if groups and abs(groups[-1][0][0] - y) <= 10:
            groups[-1].append((y, x, text))
        else:
            groups.append([(y, x, text)])
    return [" ".join(item[2] for item in sorted(group, key=lambda item: item[1])) for group in groups]


def extract_cloze(pdf_path, cursor=None):
    import cv2
    import fitz
    import numpy as np
    from rapidocr_onnxruntime import RapidOCR

    cv2.setNumThreads(1)
    ocr = None
    rows, fallback = [], []
    started = False
    with fitz.open(pdf_path) as document:
        for page in (cursor or PdfPartCursor()).pages(document):
            native = page.get_text("text", sort=True).splitlines()
            is_native = sum(char.isascii() and char.isalpha() for row in native for char in row) >= 160
            if is_native:
                page_rows = native
                native_fallback = native
            else:
                if ocr is None:
                    ocr = RapidOCR(intra_op_num_threads=2, inter_op_num_threads=1)
                pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), colorspace=fitz.csRGB, alpha=False)
                image = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, 3)
                page_rows = scan_rows(cv2.cvtColor(image, cv2.COLOR_RGB2BGR), ocr.text_rec)
                native_fallback = None
            if not started and any(CLOZE.match(clean(row)) for row in page_rows):
                started = True
            if started:
                rows.extend(page_rows)
                fallback.extend(native_fallback if native_fallback is not None else ocr_page_rows(page, ocr))
                if any(JUDGMENT_HEADING.match(clean(row)) for row in page_rows):
                    break
    return parse_cloze(rows, fallback)


def extract_judgment(pdf_path, cursor=None):
    import cv2
    import fitz
    import numpy as np
    from rapidocr_onnxruntime import RapidOCR

    cv2.setNumThreads(1)
    ocr = None
    rows = []
    started = False
    with fitz.open(pdf_path) as document:
        for page in (cursor or PdfPartCursor()).pages(document):
            native = page.get_text("text", sort=True).splitlines()
            if sum(char.isascii() and char.isalpha() for row in native for char in row) >= 160:
                page_rows = native
            else:
                if ocr is None:
                    ocr = RapidOCR(intra_op_num_threads=2, inter_op_num_threads=1)
                pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), colorspace=fitz.csRGB, alpha=False)
                image = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, 3)
                page_rows = scan_rows(cv2.cvtColor(image, cv2.COLOR_RGB2BGR), ocr.text_rec)
            if not started and any(JUDGMENT_HEADING.match(clean(row)) for row in page_rows):
                started = True
            if started:
                rows.extend(page_rows)
                if any(JUDGMENT_END.match(clean(row)) for row in page_rows):
                    break
    return parse_judgment(rows)


def extract_translation(pdf_path, cursor=None):
    import cv2
    import fitz
    from rapidocr_onnxruntime import RapidOCR

    cv2.setNumThreads(1)
    ocr, rows, started = None, [], False
    with fitz.open(pdf_path) as document:
        for page in (cursor or PdfPartCursor()).pages(document):
            native = page.get_text('text', sort=True).splitlines()
            if sum(char.isascii() and char.isalpha() for row in native for char in row) >= 160:
                page_rows = native
            else:
                if ocr is None:
                    ocr = RapidOCR(intra_op_num_threads=2, inter_op_num_threads=1)
                page_rows = ocr_page_rows(page, ocr)
            if any(TRANSLATION_PART.match(clean(row)) for row in page_rows):
                started = True
            if started:
                rows.extend(page_rows)
                if any(TRANSLATION_END.match(clean(row)) for row in page_rows):
                    break
    return parse_translation(rows)


def fill_translation_answers(sections, answer_pdf):
    import fitz
    with fitz.open(answer_pdf) as document:
        rows = [line for page in document for line in page.get_text().splitlines()]
    return translation_answers(rows, sections)


def write_sample(data):
    sample_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=sample_path.parent, delete=False) as handle:
        temp_path = Path(handle.name)
        try:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.flush()
            temp_path.replace(sample_path)
        finally:
            temp_path.unlink(missing_ok=True)


def fill_sample_answers(data, answer_pdf):
    import fitz

    questions = [q for passage in data["passages"] for q in passage["questions"]]
    with fitz.open(answer_pdf) as document:
        rows = [line for page in document for line in page.get_text().splitlines()]
    answers = parse_reading_answers(rows, {q["number"] for q in questions})
    for question in questions:
        if not question.get("answer"):
            question["answer"] = answers[question["number"]]
    return answers


def fill_cloze_answers(cloze, answer_pdf):
    import fitz

    with fitz.open(answer_pdf) as document:
        rows = [line for page in document for line in page.get_text().splitlines()]
    numbers = [question["number"] for question in cloze["questions"]]
    answers = cloze_answers(rows, numbers)
    for question in cloze["questions"]:
        question["answer"] = answers[question["number"]]
    return answers


def fill_judgment_answers(judgment, answer_pdf):
    import fitz

    with fitz.open(answer_pdf) as document:
        rows = [line for page in document for line in page.get_text().splitlines()]
    numbers = [question["number"] for question in judgment["questions"]]
    answers = judgment_answers(rows, numbers)
    for question in judgment["questions"]:
        question["answer"] = answers[question["number"]]
    return answers


def last_translation_question(data):
    numbers = [question["number"] for section in data.get("translationSections", []) for question in section["questions"]]
    if not numbers:
        raise ValueError("请先准备同一份试卷的 Part IV 测试样本。")
    return max(numbers)


def extract_answer_key(pdf):
    import cv2
    import fitz
    import numpy as np
    from rapidocr_onnxruntime import RapidOCR

    cv2.setNumThreads(1)
    recognize = None
    rows = []
    with fitz.open(pdf) as document:
        for page in document:
            text = page.get_text()
            if len(re.findall(r"[A-Za-z\u4e00-\u9fff]", text)) >= 160:
                rows.extend(text.splitlines())
                continue
            if recognize is None:
                recognize = RapidOCR(intra_op_num_threads=2, inter_op_num_threads=1).text_rec
            pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), colorspace=fitz.csRGB, alpha=False)
            pixels = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, 3)
            image = cv2.cvtColor(pixels, cv2.COLOR_RGB2BGR)
            rows.extend(text for _, text in ink_rows(image, recognize, margins=(.045, .025, .975, .982)))
    return AnswerKey(rows)


def parse_import_paper(pdf, answer_pdf, meta, report):
    cursor = PdfPartCursor()
    report("reading", 8, "识别 Part I 阅读理解")
    reading = extract_reading(pdf, cursor)
    report("cloze", 24, "识别 Part II 完形填空")
    cloze = extract_cloze(pdf, cursor)
    report("judgment", 40, "识别 Part III 阅读理解（判断）")
    judgment = extract_judgment(pdf, cursor)
    report("translation", 54, "识别 Part IV 翻译")
    translations = extract_translation(pdf, cursor)
    report("correction", 70, "识别 Part V 短文改错")
    corrections = extract_correction(pdf, last_translation_question({"translationSections": translations}), first_page=cursor.page_index + 1)
    unmatched = []
    writing_answer = ""
    if answer_pdf:
        report("answers", 88, "按原题号匹配答案解析")
        answer_key = extract_answer_key(answer_pdf)
        for group in [*reading, cloze, judgment, *translations]:
            for item in group["questions"]:
                number = item["number"]
                item["answer"] = answer_key.choice(number, item["options"]) if item["options"] else answer_key.translation(number)
                if not item["answer"]:
                    unmatched.append(number)
        for entry in corrections:
            number = entry["number"]
            letter, replacement, explanation = answer_key.correction(number)
            entry["questions"] = [{"number": number, "answer": letter, "correction": replacement, "explanation": explanation,
                                   "answerIssue": not (letter and replacement)}]
        writing_answer = extract_writing_answer(answer_pdf) or answer_key.essay()
    report("writing", 96, "识别 Part VI 写作")
    writing_page = max((entry["sourcePage"] for entry in corrections if entry.get("sourcePage")), default=1)
    writing_stem = extract_writing(pdf, first_page=writing_page, reference_title=writing_answer.partition("\n\n")[0])
    questions, warnings = import_questions(reading, cloze, judgment, translations, corrections, writing_stem, writing_answer)
    if unmatched:
        warnings.append("答案 PDF 中未唯一匹配以下题号，请对照补录：" + "、".join(map(str, unmatched)))
    if answer_pdf and not writing_answer:
        warnings.append("答案 PDF 中未识别到写作参考范文，请对照补录。")
    if not answer_pdf:
        warnings.append("未上传答案解析 PDF，请在确认导入前填写客观题答案。")
    return {
        "payload": {**meta, "paperType": "real_exam", "questionBankStructure": "english_v1",
                    "chapterTitle": "历年真题", "knowledgePointTitle": meta["title"], "questions": questions},
        "warnings": warnings,
    }


app.include_router(import_task_router(parse_import_paper, require_preview_host))


def add_correction_sample(pdf, answer_pdf):
    initial, _ = read_sample()
    if "correctionPassages" in initial:
        raise ValueError("测试样本已有短文改错，请在工作台编辑。")
    last_number = last_translation_question(initial)
    entries = fill_correction_answers(extract_correction(pdf, last_number), answer_pdf)
    with lock_sample():
        data, _ = read_sample()
        if "correctionPassages" in data or data["title"] != initial["title"] or last_translation_question(data) != last_number:
            raise ValueError("解析期间测试样本已更换，请核对后重试。")
        data["correctionPassages"] = entries
        write_sample(data)
    review = [entry["number"] for entry in entries if entry["stemIssue"] or entry["questions"][0]["answerIssue"]]
    print(f"Added {len(entries)} correction questions. Needs review: {review}")


def add_writing_sample(pdf, answer_pdf):
    initial, _ = read_sample()
    if "writingPassages" in initial:
        raise ValueError("测试样本已有写作题，请在工作台编辑。")
    correction_pages = [entry["sourcePage"] for entry in initial.get("correctionPassages", []) if entry.get("sourcePage")]
    answer = extract_writing_answer(answer_pdf) if answer_pdf else ""
    stem = extract_writing(pdf, first_page=max(correction_pages, default=1), reference_title=answer.partition("\n\n")[0])
    passage = WritingPassage(number=1, stem=stem, questions=[WritingQuestion(number=1, answer=answer)])
    with lock_sample():
        data, _ = read_sample()
        if "writingPassages" in data or data["title"] != initial["title"]:
            raise ValueError("解析期间测试样本已更换，请核对后重试。")
        data["writingPassages"] = [passage.model_dump()]
        write_sample(data)
    print("Added the Part VI writing question.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prepare the English V1 test sample")
    parser.add_argument("pdf", type=Path, nargs="?")
    parser.add_argument("--title")
    parser.add_argument("--answer-pdf", type=Path)
    sections = parser.add_mutually_exclusive_group()
    sections.add_argument("--correction-pdf", type=Path, help="Add Part V to the existing test sample")
    sections.add_argument("--writing-pdf", type=Path, help="Add Part VI to the existing test sample")
    args = parser.parse_args()
    if args.writing_pdf:
        if args.pdf or args.title:
            parser.error("--writing-pdf adds Part VI to the existing sample and accepts --answer-pdf")
        add_writing_sample(args.writing_pdf, args.answer_pdf)
        raise SystemExit(0)
    if args.correction_pdf:
        if args.pdf or not args.answer_pdf or args.title:
            parser.error("--correction-pdf requires --answer-pdf and the existing Part IV sample")
        add_correction_sample(args.correction_pdf, args.answer_pdf)
        raise SystemExit(0)
    if not args.pdf and not args.answer_pdf:
        parser.error("provide a question PDF or --answer-pdf")
    passages = extract_reading(args.pdf) if args.pdf else None
    with lock_sample():
        if args.pdf:
            data = {"title": args.title or args.pdf.stem, "passages": passages}
        else:
            data, _ = read_sample()
        if args.answer_pdf:
            answers = fill_sample_answers(data, args.answer_pdf)
            print(f"Matched {len(answers)} reading answers.")
        write_sample(data)
    print([(passage["number"], len(passage["questions"])) for passage in data["passages"]])
