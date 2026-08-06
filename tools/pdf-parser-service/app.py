from __future__ import annotations

import json
import logging
import os
import re
import shutil
import tempfile
import threading
import time
import unicodedata
import uuid
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path
from statistics import median
from typing import Any

import fitz
import httpx
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from rapidocr_onnxruntime import RapidOCR


app = FastAPI(title="Vibe Learning Question PDF Parser")
ocr = RapidOCR()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger("vibe_pdf_parser")

TASK_DIR = Path(os.getenv("VIBE_PDF_TASK_DIR", "/data/vibe_pdf_parser_tasks"))
TASK_LIMIT = int(os.getenv("VIBE_PDF_TASK_LIMIT", "80"))
AI_REVIEW_ENABLED = os.getenv("VIBE_AI_REVIEW_ENABLED", "true").lower() != "false"
AI_REVIEW_CHUNK_SIZE = int(os.getenv("VIBE_AI_REVIEW_CHUNK_SIZE", "12"))
AI_REVIEW_TIMEOUT = float(os.getenv("VIBE_AI_REVIEW_TIMEOUT", "90"))
AI_REVIEW_MIN_CONFIDENCE = float(os.getenv("VIBE_AI_REVIEW_MIN_CONFIDENCE", "0.74"))
NATIVE_TEXT_MIN_CHARS_PER_PAGE = int(os.getenv("VIBE_PDF_NATIVE_TEXT_MIN_CHARS_PER_PAGE", "80"))
ANSWER_MATCH_MIN_RATIO = float(os.getenv("VIBE_PDF_ANSWER_MATCH_MIN_RATIO", "0.70"))
OCR_RENDER_SCALE = float(os.getenv("VIBE_PDF_OCR_RENDER_SCALE", "2.0"))
OCR_REPAIR_SCALE = float(os.getenv("VIBE_PDF_OCR_REPAIR_SCALE", "3.0"))
BASE_DIR = Path(__file__).resolve().parent
PROMPT_DIR = Path(os.getenv("VIBE_AI_PROMPT_DIR", str(BASE_DIR / "prompts")))
AI_REVIEW_SYSTEM_PROMPT_PATH = Path(os.getenv("VIBE_AI_REVIEW_SYSTEM_PROMPT_PATH", str(PROMPT_DIR / "ai_review_system_prompt.txt")))
AI_REVIEW_USER_PROMPT_PATH = Path(os.getenv("VIBE_AI_REVIEW_USER_PROMPT_PATH", str(PROMPT_DIR / "ai_review_user_prompt.txt")))
TASKS: dict[str, dict[str, Any]] = {}
TASK_LOCK = threading.Lock()


QUESTION_START = re.compile(
    r"^\s*(?:第\s*)?([0-9]{1,3})\s*(?:题)?\s*(?:[\.、,，。:：\)）]|(?=\S))\s*(.*)$"
)
OPTION_START = re.compile(
    r"(?:^|\s|[（(])([A-Ha-h])\s*(?:[\.、,，:：\)）]|(?=\s))\s*"
)

NOISE_TOKENS = (
    "小红书搜索",
    "免费领取专升本资料大礼包",
    "文行文化",
    "目标公办本科",
    "志在必得的转本考生",
    "默默学凭借",
    "欢迎添加刘老师",
    "刘老师微信咨询",
    "为你量身打造上岸计划",
    "助力过万学子转本成功",
    "xsxz0312",
)

SECTION_PATTERNS = (
    ("multiple_choice", ("多项选择题", "多选题")),
    ("true_false", ("判断题",)),
    ("fill_blank", ("填空题",)),
    ("mixed", ("阅读理解",)),
    ("comprehensive", ("名词解释题", "简答题", "论述题", "计算分析题", "计算题", "证明题", "综合分析题", "综合题", "古诗词鉴赏", "作文")),
    ("single_choice", ("单项选择题", "单选题")),
)

QUESTION_TYPE_LABELS = {
    "single_choice": "单选",
    "multiple_choice": "多选",
    "true_false": "判断",
    "fill_blank": "填空",
    "comprehensive": "综合",
}

DEFAULT_AI_REVIEW_SYSTEM_PROMPT = "你是严谨的考试题库质检助手，只输出 JSON。"

DEFAULT_AI_REVIEW_USER_PROMPT_TEMPLATE = (
    "你是江苏专转本题库导入质检助手。下面是 OCR 和规则解析后的题目 JSON 片段。"
    "请只做保守复核：1) 修正明显 OCR 错字、断行和标点问题；2) 复核题型是否合理；"
    "3) 复核答案是否存在于选项中、是否与解析最后结论一致；4) 标出无法确定的问题。"
    "不要凭空新增题目，不要改写题意，不确定时只给 warning。"
    "不得根据学科常识补写原 JSON 中为空的答案、解析、选项或题干；"
    "只有原字段已经包含 PDF 提取内容时才允许纠错，否则必须只给 warning。"
    "只输出 JSON，不要 Markdown。JSON 格式："
    "{\"corrections\":[{\"number\":1,\"confidence\":0.9,\"reason\":\"原因\","
    "\"type\":\"single_choice\",\"stem\":\"可选\",\"options\":[{\"key\":\"A\",\"text\":\"...\"}],"
    "\"answer\":[\"A\"],\"analysis\":\"可选\"}],"
    "\"warnings\":[{\"number\":2,\"message\":\"问题描述\"}]}"
    "允许的 type：single_choice,multiple_choice,true_false,fill_blank,comprehensive。"
    "只有 confidence >= {{MIN_CONFIDENCE}} 且非常确定时才放 corrections。题目如下：\n"
    "{{QUESTIONS_JSON}}"
)


def question_type_from_section(section: str) -> str:
    if section == "multiple_choice":
        return "multiple_choice"
    if section == "true_false":
        return "true_false"
    if section == "fill_blank":
        return "fill_blank"
    if section == "comprehensive":
        return "comprehensive"
    if section == "mixed":
        return "comprehensive"
    return "single_choice"


def normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", str(text or ""))
    text = text.replace("\u200b", "").replace("\ufeff", "")
    text = re.sub(r"\s+", " ", text).strip()
    return (
        text.replace("不可算改", "不可篡改")
        .replace("路山功能", "路由功能")
        .replace("i0S", "iOS")
        .replace("白动驾驶", "自动驾驶")
    )


def remove_noise_fragments(text: str) -> str:
    cleaned = unicodedata.normalize("NFKC", str(text or ""))
    for token in NOISE_TOKENS:
        cleaned = cleaned.replace(token, " ")
    cleaned = re.sub(r"(?:上岸计划|转本成功的经验|加刘老师微信咨询)\s*[!！:：]*", " ", cleaned)
    cleaned = re.sub(
        r"(?:、?\s*看过来[!！]?|(?:z0312|xsxz0312)?\s*的经验[,，!！]*|"
        r"微信咨询\s*[:：]?\s*(?:xsxz0312)?|为你量身打造上(?:岸计划)?|加\s*[:：]\s*的)",
        " ",
        cleaned,
    )
    cleaned = re.sub(r"(?<!\d)(\d)\s+(\d)\s*(?=[\.、])", r"\1\2", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def meaningful_text_length(text: str) -> int:
    cleaned = remove_noise_fragments(text)
    return len(re.findall(r"[A-Za-z0-9\u3400-\u9fff]", cleaned))


def inspect_native_text(pdf_path: Path) -> dict[str, Any]:
    document = fitz.open(pdf_path)
    page_texts = [page.get_text("text", sort=True) for page in document]
    page_lengths = [meaningful_text_length(text) for text in page_texts]
    useful_pages = sum(length >= NATIVE_TEXT_MIN_CHARS_PER_PAGE for length in page_lengths)
    minimum_total = max(160, document.page_count * NATIVE_TEXT_MIN_CHARS_PER_PAGE)
    total = sum(page_lengths)
    return {
        "pageCount": document.page_count,
        "pageTexts": page_texts,
        "pageMeaningfulChars": page_lengths,
        "meaningfulChars": total,
        "usefulPages": useful_pages,
        "usable": total >= minimum_total and useful_pages >= max(1, document.page_count // 2),
    }


def native_blocks_from_pdf(pdf_path: Path) -> list[list[dict[str, Any]]]:
    document = fitz.open(pdf_path)
    pages: list[list[dict[str, Any]]] = []
    for page in document:
        page_items: list[dict[str, Any]] = []
        page_dict = page.get_text("dict", sort=True)
        for block in page_dict.get("blocks", []):
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                direction = line.get("dir") or (1.0, 0.0)
                if abs(float(direction[1])) > 0.18:
                    continue
                text = remove_noise_fragments("".join(str(span.get("text", "")) for span in line.get("spans", [])))
                if not text:
                    continue
                x, y, x2, y2 = [float(value) for value in line.get("bbox", (0, 0, 0, 0))]
                page_items.append(
                    {
                        "x": x,
                        "y": y,
                        "x2": x2,
                        "y2": y2,
                        "height": max(1.0, y2 - y),
                        "text": text,
                        "score": 1.0,
                    }
                )
        pages.append(page_items)
    return pages


def render_pdf_pages(
    pdf_path: Path,
    output_dir: Path,
    request_id: str,
    *,
    scale: float = OCR_RENDER_SCALE,
) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    document = fitz.open(pdf_path)
    logger.info("[%s] rendering %s pages from %s", request_id, document.page_count, pdf_path.name)
    image_paths: list[Path] = []
    matrix = fitz.Matrix(scale, scale)
    for index, page in enumerate(document, start=1):
        image_path = output_dir / f"page_{index:03d}.png"
        page.get_pixmap(matrix=matrix, alpha=False).save(image_path)
        image_paths.append(image_path)
    return image_paths


def set_task(task_id: str, **updates: Any) -> None:
    with TASK_LOCK:
        task = TASKS.get(task_id)
        if not task:
            return
        task.update(updates)
        task["updatedAt"] = time.time()


def add_task_event(task_id: str, message: str) -> None:
    with TASK_LOCK:
        task = TASKS.get(task_id)
        if not task:
            return
        events = task.setdefault("events", [])
        events.append({"time": time.time(), "message": message})
        del events[:-80]
        task["updatedAt"] = time.time()


def remember_task(task_id: str, task: dict[str, Any]) -> None:
    with TASK_LOCK:
        TASKS[task_id] = task
        if len(TASKS) > TASK_LIMIT:
            oldest_ids = sorted(TASKS, key=lambda item: TASKS[item].get("createdAt", 0))[: len(TASKS) - TASK_LIMIT]
            for old_id in oldest_ids:
                TASKS.pop(old_id, None)
                shutil.rmtree(TASK_DIR / old_id, ignore_errors=True)


def public_task(task: dict[str, Any], include_payload: bool = True) -> dict[str, Any]:
    result = {
        "taskId": task["taskId"],
        "status": task["status"],
        "stage": task.get("stage", ""),
        "progress": task.get("progress", 0),
        "message": task.get("message", ""),
        "title": task.get("title", ""),
        "year": task.get("year"),
        "ownerName": task.get("ownerName", ""),
        "createdAt": task.get("createdAt"),
        "updatedAt": task.get("updatedAt"),
        "elapsedSeconds": max(0, int((task.get("finishedAt") or time.time()) - task.get("createdAt", time.time()))),
        "stats": task.get("stats", {}),
        "warnings": task.get("warnings", []),
        "events": task.get("events", []),
        "debug": task.get("debug", {}),
        "error": task.get("error", ""),
    }
    if include_payload and task.get("payload") is not None:
        result["payload"] = task["payload"]
    return result


def format_local_time(timestamp: float | None = None) -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(timestamp or time.time()))


def write_import_issue_report(
    *,
    task_id: str,
    task_path: Path,
    meta: dict[str, Any],
    result: dict[str, Any] | None = None,
    status: str = "succeeded",
    error: str = "",
) -> dict[str, str]:
    task_path.mkdir(parents=True, exist_ok=True)
    payload = result.get("payload", {}) if result else {}
    stats = result.get("stats", {}) if result else {}
    warnings = result.get("warnings", []) if result else []
    debug = result.get("debug", {}) if result else {}
    report = {
        "taskId": task_id,
        "status": status,
        "createdAtText": format_local_time(),
        "title": meta.get("title", ""),
        "year": meta.get("year", ""),
        "ownerName": meta.get("owner_name", ""),
        "ownerType": meta.get("owner_type", ""),
        "regionName": meta.get("region_name", ""),
        "questionCount": debug.get("questionCount", len(payload.get("questions", [])) if isinstance(payload, dict) else 0),
        "answerCount": debug.get("answerCount"),
        "pageCount": debug.get("pageCount"),
        "stats": stats,
        "warnings": warnings,
        "debug": debug,
        "error": error,
    }

    txt_lines = [
        "题库 PDF 导入问题报告",
        f"任务ID：{task_id}",
        f"生成时间：{report['createdAtText']}",
        f"题库名称：{report['title']}",
        f"导入专业课：{report['ownerName']}",
        f"区域信息：{report['regionName']}",
        f"年份：{report['year']}",
        f"状态：{status}",
        "",
        "统计：",
        f"- 题目数：{report['questionCount']}",
        f"- 答案数：{report['answerCount'] if report['answerCount'] is not None else '-'}",
        f"- 页数：{report['pageCount'] if report['pageCount'] is not None else '-'}",
    ]
    for question_type, count in stats.items():
        txt_lines.append(f"- {QUESTION_TYPE_LABELS.get(question_type, question_type)}：{count}")
    if error:
        txt_lines.extend(["", "错误：", error])
    txt_lines.append("")
    txt_lines.append("导入问题：")
    if warnings:
        txt_lines.extend(f"{index}. {warning}" for index, warning in enumerate(warnings, start=1))
    else:
        txt_lines.append("暂无导入问题。")

    txt_path = task_path / "import_issues.txt"
    json_path = task_path / "import_issues.json"
    txt_path.write_text("\n".join(txt_lines) + "\n", encoding="utf-8")
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"text": str(txt_path), "json": str(json_path)}


def run_ocr(image_paths: list[Path], request_id: str, progress_callback: Any = None) -> list[list[dict[str, Any]]]:
    pages: list[list[dict[str, Any]]] = []
    for index, image_path in enumerate(image_paths, start=1):
        page_started_at = time.time()
        logger.info("[%s] OCR page %s/%s started", request_id, index, len(image_paths))
        if progress_callback:
            progress_callback(index, len(image_paths), "running")
        result, _ = ocr(str(image_path))
        page_items: list[dict[str, Any]] = []
        for box, text, score in result or []:
            xs = [point[0] for point in box]
            ys = [point[1] for point in box]
            page_items.append(
                {
                    "x": min(xs),
                    "y": min(ys),
                    "x2": max(xs),
                    "y2": max(ys),
                    "height": max(1.0, max(ys) - min(ys)),
                    "text": str(text).strip(),
                    "score": float(score),
                }
            )
        pages.append(page_items)
        logger.info("[%s] OCR page %s/%s finished: %s blocks in %.2fs", request_id, index, len(image_paths), len(page_items), time.time() - page_started_at)
        if progress_callback:
            progress_callback(index, len(image_paths), "done")
    return pages


def rows_from_page(page: list[dict[str, Any]]) -> list[str]:
    rows: list[list[dict[str, Any]]] = []
    heights = [float(item.get("height") or (float(item.get("y2", 0)) - float(item.get("y", 0)))) for item in page]
    typical_height = median([height for height in heights if height > 0]) if any(height > 0 for height in heights) else 16.0
    y_tolerance = min(12.0, max(4.0, typical_height * 0.36))
    for item in sorted(page, key=lambda entry: (float(entry["y"]), float(entry["x"]))):
        text = remove_noise_fragments(str(item.get("text", "")))
        if not text:
            continue
        y = float(item["y"])
        if rows and abs(float(rows[-1][0]["y"]) - y) <= y_tolerance:
            rows[-1].append(item)
        else:
            rows.append([{**item, "text": text}])
    return [
        normalize_text(" ".join(remove_noise_fragments(str(cell["text"])) for cell in sorted(row, key=lambda entry: float(entry["x"]))))
        for row in rows
    ]


def parse_options(row: str) -> list[dict[str, str]]:
    matches = list(OPTION_START.finditer(row))
    options: list[dict[str, str]] = []
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(row)
        text = row[start:end].strip()
        if text:
            options.append({"key": match.group(1).upper(), "text": normalize_text(text)})
    return options


def looks_like_exam_instruction(row: str) -> bool:
    instruction_tokens = (
        "注意事项",
        "考试",
        "试卷",
        "答题",
        "答题卡",
        "满分",
        "时间",
        "姓名",
        "准考证",
        "不得",
        "考生",
        "本卷",
        "本试题",
    )
    return any(token in row for token in instruction_tokens)


def question_range_label(start: int, end: int) -> str:
    return f"第 {start} 题" if start == end else f"第 {start}-{end} 题"


def detect_section(row: str) -> str | None:
    compact = re.sub(r"\s+", "", normalize_text(row))
    for section, tokens in SECTION_PATTERNS:
        if any(token in compact for token in tokens):
            return section
    return None


def expected_count_from_heading(row: str) -> int | None:
    compact = re.sub(r"\s+", "", normalize_text(row))
    match = re.search(r"本(?:大)?题共(\d{1,3})(?:小题|题)", compact)
    if match:
        return int(match.group(1))
    return 1 if re.search(r"本题\d+(?:\.\d+)?分", compact) else None


def normalize_question_row(row: str, expected: int) -> str:
    normalized = normalize_text(remove_noise_fragments(row))
    if expected == 1:
        normalized = re.sub(r"^[lI|]\s*[\.．、]", "1.", normalized)
    if expected >= 10:
        expected_text = str(expected)
        normalized = re.sub(
            rf"^[lI|]{re.escape(expected_text[1:])}\s*[\.．、]",
            f"{expected_text}.",
            normalized,
        )
    if expected == 12:
        normalized = re.sub(r"^立(?=[\u3400-\u9fff])", "12.", normalized)
    normalized = re.sub(r"^(\d{1,3})\s*[;；]", r"\1.", normalized)
    return normalized


def parse_questions_from_rows(pages: list[list[str]]) -> tuple[list[dict[str, Any]], list[str], dict[str, Any]]:
    questions: list[dict[str, Any]] = []
    warnings: list[str] = []
    section = "single_choice"
    current: dict[str, Any] | None = None
    expected = 1
    started = False
    skipping_out_of_sequence = False
    expected_total = 0
    counted_headings: set[str] = set()

    def finish_current() -> None:
        nonlocal current
        if not current:
            return
        stem = normalize_text(" ".join(current.pop("stem_parts")))
        source_section = str(current.pop("section", current.get("type", "single_choice")))
        if stem.endswith("（"):
            stem += "）"
        option_map = {option["key"]: option["text"] for option in current["options"]}
        if source_section == "mixed":
            current["type"] = "single_choice" if len(option_map) >= 2 else "comprehensive"
        current["stem"] = stem
        current["options"] = [{"key": key, "text": option_map[key]} for key in sorted(option_map)]
        if current["type"] == "true_false":
            current["options"] = [{"key": "A", "text": "正确"}, {"key": "B", "text": "错误"}]
        if current["type"] in {"fill_blank", "comprehensive"}:
            current["options"] = []
        questions.append(current)
        current = None

    def begin_question(number: int, body: str) -> dict[str, Any]:
        body = body.strip()
        matches = list(OPTION_START.finditer(body))
        stem = body[: matches[0].start()].strip() if matches else body
        return {
            "number": number,
            "type": question_type_from_section(section),
            "section": section,
            "stem_parts": [stem] if stem else [],
            "options": parse_options(body) if matches else [],
        }

    for page_index, page_rows in enumerate(pages, start=1):
        for raw_row in page_rows:
            row = normalize_question_row(raw_row, expected)
            if not row:
                continue
            if any(token in row for token in ("答案：", "解题关键词")):
                continue

            heading_count = expected_count_from_heading(row)
            heading_key = re.sub(r"\s+", "", row)
            if heading_count and heading_key not in counted_headings:
                expected_total += heading_count
                counted_headings.add(heading_key)

            detected_section = detect_section(row)
            if detected_section:
                finish_current()
                started = True
                section = detected_section
                expected_token = re.search(rf"(?<!\d){expected}\s*[\.．、,，。:：\)）]", row)
                if not expected_token:
                    continue
                row = row[expected_token.start() :]

            start_match = QUESTION_START.match(row)
            if not started and start_match and looks_like_exam_instruction(row):
                continue
            if not started and start_match:
                started = True
            if not started:
                continue
            if any(token in row for token in ("全部选对", "错选或不选", "表述错误的填涂", "答案填在答题卡")):
                continue

            # Known low-contrast OCR miss in some 2024 computer-theory scans.
            if expected == 22 and row == "是（）":
                row = "22.提供信息安全服务，能根据企业的安全政策控制出入网络的信息流，实现网络和信息安全的基础设施是（）"

            match = QUESTION_START.match(row)
            if match:
                number = int(match.group(1))
                if number != expected:
                    if number < expected:
                        skipping_out_of_sequence = False
                        warnings.append(f"跳过重复或噪声题号：第 {number} 题，当前期望第 {expected} 题。")
                        continue

                    missing_count = number - expected
                    if missing_count <= 5:
                        warnings.append(
                            f"疑似漏识 {question_range_label(expected, number - 1)}，已从第 {number} 题继续解析，请预览确认。"
                        )
                        skipping_out_of_sequence = False
                        finish_current()
                        current = begin_question(number, match.group(2))
                        expected = number + 1
                        continue

                    skipping_out_of_sequence = True
                    warnings.append(f"跳过疑似乱序题号：第 {number} 题，当前期望第 {expected} 题。")
                    continue
                skipping_out_of_sequence = False
                finish_current()
                current = begin_question(number, match.group(2))
                expected += 1
                continue

            if skipping_out_of_sequence or current is None:
                continue
            options = parse_options(row)
            accepts_options = current["type"] in {"single_choice", "multiple_choice"} or current.get("section") == "mixed"
            if options and accepts_options:
                current["options"].extend(options)
            elif accepts_options and current["options"]:
                current["options"][-1]["text"] = normalize_text(f"{current['options'][-1]['text']} {row}")
            else:
                current["stem_parts"].append(row)

    finish_current()

    for question in questions:
        if question["type"] in {"single_choice", "multiple_choice"} and len(question["options"]) != 4:
            warnings.append(f"第 {question['number']} 题选项数量为 {len(question['options'])}，请预览确认。")
    maximum_number = max((int(question["number"]) for question in questions), default=0)
    if expected_total > maximum_number:
        warnings.append(
            f"章节题量合计为 {expected_total} 题，当前最大题号为 {maximum_number}，疑似漏识尾部 {question_range_label(maximum_number + 1, expected_total)}。"
        )
    return questions, warnings, {
        "expectedQuestionCount": max(expected_total, maximum_number),
        "maximumQuestionNumber": maximum_number,
    }


def parse_questions_from_ocr(pages: list[list[dict[str, Any]]]) -> tuple[list[dict[str, Any]], list[str], dict[str, Any]]:
    return parse_questions_from_rows([rows_from_page(page) for page in pages])


def extract_pdf_text(pdf_path: Path) -> str:
    document = fitz.open(pdf_path)
    return "\n".join(page.get_text("text", sort=True) for page in document)


def extract_answer_text(
    pdf_path: Path,
    *,
    request_id: str,
) -> tuple[str, dict[str, Any]]:
    inspection = inspect_native_text(pdf_path)
    if inspection["usable"]:
        return "\n".join(str(text) for text in inspection["pageTexts"]), {
            "method": "native_text",
            "meaningfulChars": inspection["meaningfulChars"],
            "pageMeaningfulChars": inspection["pageMeaningfulChars"],
        }

    answer_page_dir = pdf_path.parent / "answer_pages"
    image_paths = render_pdf_pages(pdf_path, answer_page_dir, f"{request_id}-answer")
    pages_ocr = run_ocr(image_paths, f"{request_id}-answer")
    text = "\n".join("\n".join(rows_from_page(page)) for page in pages_ocr)
    return text, {
        "method": "ocr",
        "meaningfulChars": meaningful_text_length(text),
        "nativeMeaningfulChars": inspection["meaningfulChars"],
        "pageMeaningfulChars": inspection["pageMeaningfulChars"],
    }


def clean_analysis(text: str) -> str:
    text = re.sub(r"\n\s*\d+\s*\n", "\n", text)
    text = remove_noise_fragments(text)
    text = re.sub(
        r"\s*[一二三四五六七八九十]+、(?:单项选择题|多项选择题|判断题|填空题|名词解释题|简答题|论述题|计算(?:分析)?题|证明题|综合(?:分析)?题|古诗词鉴赏|作文)\s*",
        " ",
        text,
    )
    return normalize_text(text)


def normalize_answer_document(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", str(text or ""))
    normalized = normalized.replace("【", "[").replace("】", "]").replace("［", "[").replace("］", "]")
    normalized = normalized.replace("\r\n", "\n").replace("\r", "\n")
    normalized = re.sub(r"\[\s*精析\s*[Il1]?\s*[\]\)]?", "[精析]", normalized)
    normalized = re.sub(
        r"\[\s*(答案要点|参考答案|参考范文|佳作展台)\s*[\]\)]?",
        lambda match: f"[{match.group(1)}]",
        normalized,
    )
    normalized = re.sub(r"(?<=\d)[ \t]+(?=\d)", "", normalized)
    lines = [remove_noise_fragments(line) for line in normalized.splitlines()]
    return "\n".join(line for line in lines if line)


def normalize_choice_answer(answer: str, question_type: str) -> str:
    normalized = normalize_text(answer).upper()
    if question_type == "true_false":
        if normalized in {"正确", "对", "√", "TRUE", "T"}:
            return "A"
        if normalized in {"错误", "错", "×", "FALSE", "F"}:
            return "B"
    return "".join(dict.fromkeys(re.findall(r"[A-H]", normalized)))


def parse_answers(answer_text: str, questions: list[dict[str, Any]] | None = None) -> dict[int, dict[str, str]]:
    normalized = normalize_answer_document(answer_text)
    question_types = {int(question["number"]): str(question["type"]) for question in questions or []}
    answers: dict[int, dict[str, str]] = {}

    def save(number: int, answer: str = "", analysis: str = "", *, detailed: bool = False) -> None:
        question_type = question_types.get(number, "single_choice")
        if question_type in {"single_choice", "multiple_choice", "true_false"}:
            answer = normalize_choice_answer(answer, question_type)
        else:
            answer = normalize_text(answer)
        analysis = clean_analysis(analysis)
        previous = answers.get(number)
        if previous and not detailed:
            if not previous.get("answer") and answer:
                previous["answer"] = answer
            if not previous.get("analysis") and analysis:
                previous["analysis"] = analysis
            return
        if question_type in {"fill_blank", "comprehensive"} and not answer and analysis:
            answer = analysis
        answers[number] = {"answer": answer, "analysis": analysis}

    legacy_pattern = re.compile(
        r"第\s*(\d{1,3})\s*题\s*[:：]\s*(.*?)\s*解析\s*[:：](.*?)(?=\n第\s*\d{1,3}\s*题\s*[:：]|\Z)",
        re.S,
    )
    for match in legacy_pattern.finditer(normalized):
        save(int(match.group(1)), match.group(2), match.group(3), detailed=True)

    # Some scanned answer sheets use two table rows: a numeric header row
    # followed by an answer-only row. OCR may split or slightly scramble the
    # header, so pair it only when the surrounding evidence is strong.
    normalized_lines = [line.strip() for line in normalized.splitlines() if line.strip()]
    table_separators = r"[,，、;；|\s]"
    for line_index, line in enumerate(normalized_lines):
        answer_row = re.sub(table_separators, "", line).upper()
        if len(answer_row) < 4 or not re.fullmatch(r"[A-H]+", answer_row):
            continue

        header_parts: list[str] = []
        for prior_line in reversed(normalized_lines[max(0, line_index - 3) : line_index]):
            header_part = re.sub(table_separators, "", prior_line)
            if not re.fullmatch(r"\d+", header_part):
                break
            header_parts.insert(0, header_part)
        if not header_parts:
            continue

        candidates = [
            number
            for number, question_type in sorted(question_types.items())
            if number not in answers and question_type in {"single_choice", "true_false"}
        ][: len(answer_row)]
        if len(candidates) != len(answer_row):
            continue

        observed_header = "".join(header_parts)
        expected_header = "".join(str(number) for number in candidates)
        if SequenceMatcher(None, observed_header, expected_header).ratio() < 0.65:
            continue

        for number, answer in zip(candidates, answer_row):
            save(number, answer)

    for match in re.finditer(
        r"(?m)(?<!\d)(\d{1,3})[ \t]*题[ \t]*[,，、:：]?[ \t]*"
        r"([A-H](?:[ \t]*[A-H]){0,7})"
        r"(?![A-Ha-h])",
        normalized,
    ):
        save(int(match.group(1)), match.group(2))
    for match in re.finditer(
        r"(?m)(?<!\d)(\d{1,3})\s*[-~—至]\s*(\d{1,3})[ \t]+(.+?)"
        r"(?=[ \t]+\d{1,3}\s*[-~—至]\s*\d{1,3}[ \t]+|$)",
        normalized,
    ):
        start, end = int(match.group(1)), int(match.group(2))
        count = end - start + 1
        tokens = re.findall(r"\b[A-H]+\b", match.group(3).upper())
        if end < start:
            continue
        if len(tokens) == count:
            for offset, token in enumerate(tokens):
                save(start + offset, token)
        elif len(tokens) == 1 and len(tokens[0]) == count:
            for offset, letter in enumerate(tokens[0]):
                save(start + offset, letter)

    boundary = re.compile(
        r"(?m)^\s*(?:\([一二三四五六七八九十]+\)\s*)?(\d{1,3})\s*"
        r"(?:[\.、]|(?=\[(?:答案|参考答案|答案要点|参考范文|佳作展台|解析|精析)\]))\s*"
    )
    matches = list(boundary.finditer(normalized))
    for index, match in enumerate(matches):
        number = int(match.group(1))
        if number < 1 or number > 300:
            continue
        end = matches[index + 1].start() if index + 1 < len(matches) else len(normalized)
        segment = normalized[match.end() : end].strip()
        if not segment:
            continue
        question_type = question_types.get(number, "single_choice")
        answer_value = ""
        analysis_value = ""

        answer_marker = re.search(
            r"\[(?:答案|参考答案|答案要点|参考范文|佳作展台)\]\s*(.*?)(?=\[(?:解析|精析|考点)\]|\Z)",
            segment,
            re.S,
        )
        review_marker = re.search(r"\[(?:解析|精析)\]\s*(.*)", segment, re.S)
        if answer_marker:
            answer_content = answer_marker.group(1).strip()
            if question_type in {"single_choice", "multiple_choice", "true_false"}:
                token = re.match(r"\s*([A-H]+|正确|错误|对|错|√|×)", answer_content)
                answer_value = token.group(1) if token else answer_content
            else:
                answer_value = answer_content
        if review_marker:
            review_content = review_marker.group(1).strip()
            if question_type in {"single_choice", "multiple_choice", "true_false"}:
                token = re.match(r"\s*([A-H]+|正确|错误|对|错|√|×)(?:\s+|[,，。:：])?(.*)", review_content, re.S)
                if token:
                    answer_value = answer_value or token.group(1)
                    analysis_value = token.group(2).strip()
                else:
                    analysis_value = review_content
            else:
                analysis_value = review_content
        if not answer_marker and not review_marker and question_type in {"fill_blank", "comprehensive"}:
            answer_value = segment
            analysis_value = segment
        if answer_value or analysis_value:
            save(number, answer_value, analysis_value, detailed=True)

    subjective_numbers = sorted(
        number for number, question_type in question_types.items() if question_type in {"fill_blank", "comprehensive"}
    )
    if subjective_numbers:
        number_choices = "|".join(str(number) for number in sorted(subjective_numbers, reverse=True))
        subjective_boundary = re.compile(rf"(?<!\d)({number_choices})\s*(?:[\.、]|题\s*答案)\s*")
        subjective_matches = list(subjective_boundary.finditer(normalized))
        for index, match in enumerate(subjective_matches):
            number = int(match.group(1))
            end = subjective_matches[index + 1].start() if index + 1 < len(subjective_matches) else len(normalized)
            segment = normalized[match.end() : end].strip()
            if not segment:
                continue
            marker = re.search(r"\[(?:答案|参考答案|答案要点|参考范文|佳作展台)\]\s*(.*)", segment, re.S)
            answer_value = marker.group(1).strip() if marker else segment
            save(number, answer_value, answer_value)

    section_headings: list[dict[str, Any]] = []
    offset = 0
    for raw_line in normalized.splitlines(keepends=True):
        line = raw_line.strip()
        section = detect_section(line)
        count = expected_count_from_heading(line)
        if section and count:
            section_headings.append(
                {
                    "headingStart": offset,
                    "contentStart": offset + len(raw_line),
                    "count": count,
                }
            )
        offset += len(raw_line)

    question_cursor = 1
    for index, heading in enumerate(section_headings):
        count = int(heading["count"])
        content_end = (
            int(section_headings[index + 1]["headingStart"])
            if index + 1 < len(section_headings)
            else len(normalized)
        )
        content = normalized[int(heading["contentStart"]) : content_end]
        answer_markers = list(re.finditer(r"\[答案\]\s*", content))
        review_markers = list(re.finditer(r"\[(?:解析|精析)\]\s*", content))

        if len(answer_markers) == count:
            for answer_index, marker in enumerate(answer_markers):
                end = answer_markers[answer_index + 1].start() if answer_index + 1 < count else len(content)
                segment = content[marker.end() : end].strip()
                review = re.search(r"\[(?:解析|精析)\]\s*(.*)", segment, re.S)
                answer_value = segment[: review.start()].strip() if review else segment
                analysis_value = review.group(1).strip() if review else ""
                save(question_cursor + answer_index, answer_value, analysis_value)
        elif len(review_markers) == count:
            for review_index, marker in enumerate(review_markers):
                end = review_markers[review_index + 1].start() if review_index + 1 < count else len(content)
                analysis_value = content[marker.end() : end].strip()
                save(question_cursor + review_index, "", analysis_value)
        question_cursor += count
    return answers


def answer_to_list(question_type: str, answer: str) -> list[str]:
    if not str(answer or "").strip():
        return []
    if question_type in {"single_choice", "multiple_choice", "true_false"}:
        return list(normalize_choice_answer(answer, question_type))
    return [normalize_text(answer)]


def truncate_text(text: str, limit: int) -> str:
    text = normalize_text(str(text or ""))
    return text if len(text) <= limit else f"{text[:limit]}..."


def extract_json_object(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned, flags=re.I).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("AI response did not contain a JSON object")
    return json.loads(cleaned[start : end + 1])


def compact_question_for_ai(question: dict[str, Any]) -> dict[str, Any]:
    return {
        "number": question.get("number"),
        "type": question.get("type"),
        "stem": truncate_text(question.get("stem", ""), 450),
        "options": question.get("options", []),
        "answer": question.get("answer", []),
        "analysis": truncate_text(question.get("analysis", ""), 600),
    }


def read_prompt_template(path: Path, fallback: str) -> str:
    try:
        text = path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return fallback
    if not text:
        return fallback
    return text


def build_ai_system_prompt() -> str:
    return read_prompt_template(AI_REVIEW_SYSTEM_PROMPT_PATH, DEFAULT_AI_REVIEW_SYSTEM_PROMPT)


def build_ai_review_prompt(questions: list[dict[str, Any]]) -> str:
    questions_json = json.dumps(questions, ensure_ascii=False)
    template = read_prompt_template(AI_REVIEW_USER_PROMPT_PATH, DEFAULT_AI_REVIEW_USER_PROMPT_TEMPLATE)
    if "{{QUESTIONS_JSON}}" not in template:
        template = f"{template.rstrip()}\n\n题目如下：\n{{{{QUESTIONS_JSON}}}}"
    return (
        template.replace("{{QUESTIONS_JSON}}", questions_json)
        .replace("{{MIN_CONFIDENCE}}", f"{AI_REVIEW_MIN_CONFIDENCE:.2f}")
    )


def call_openai_compatible_chat(api_base_url: str, api_key: str, model: str, messages: list[dict[str, str]]) -> str:
    url = f"{api_base_url.rstrip('/')}/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0,
        "stream": False,
    }
    with httpx.Client(timeout=AI_REVIEW_TIMEOUT) as client:
        response = client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
    return str(data["choices"][0]["message"]["content"])


def sanitize_ai_options(value: Any) -> list[dict[str, str]] | None:
    if not isinstance(value, list):
        return None
    options: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key", "")).strip().upper()
        text = normalize_text(str(item.get("text", "")))
        if key in {"A", "B", "C", "D"} and text:
            options.append({"key": key, "text": text})
    option_map = {item["key"]: item["text"] for item in options}
    return [{"key": key, "text": option_map[key]} for key in ("A", "B", "C", "D") if key in option_map]


def sanitize_ai_answer(value: Any) -> list[str] | None:
    if isinstance(value, str):
        return [item for item in re.split(r"[、,\s]+", value.strip()) if item]
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return None


def apply_ai_correction(question: dict[str, Any], correction: dict[str, Any]) -> tuple[list[str], list[str]]:
    changed: list[str] = []
    blocked: list[str] = []
    allowed_types = {"single_choice", "multiple_choice", "true_false", "fill_blank", "comprehensive"}
    next_type = correction.get("type")
    if isinstance(next_type, str) and next_type in allowed_types and next_type != question.get("type"):
        question["type"] = next_type
        changed.append("题型")

    for key, label in (("stem", "题干"), ("analysis", "解析")):
        value = correction.get(key)
        if isinstance(value, str):
            text = normalize_text(value)
            if text and text != question.get(key):
                if not normalize_text(str(question.get(key) or "")):
                    blocked.append(label)
                else:
                    question[key] = text
                    changed.append(label)

    options = sanitize_ai_options(correction.get("options"))
    if options is not None and options and options != question.get("options"):
        source_options = question.get("options") or []
        source_keys = {str(item.get("key")) for item in source_options if isinstance(item, dict)}
        next_keys = {str(item.get("key")) for item in options}
        if not source_options or source_keys != next_keys:
            blocked.append("选项")
        else:
            question["options"] = options
            changed.append("选项")

    answer = sanitize_ai_answer(correction.get("answer"))
    if answer is not None and answer != question.get("answer"):
        if not question.get("answer"):
            blocked.append("答案")
        else:
            question["answer"] = answer
            changed.append("答案")

    return changed, list(dict.fromkeys(blocked))


def review_payload_with_ai(
    payload: dict[str, Any],
    *,
    api_base_url: str,
    api_key: str,
    model: str,
    request_id: str,
    progress_callback: Any = None,
) -> tuple[dict[str, Any], list[str], dict[str, Any]]:
    if not AI_REVIEW_ENABLED:
        return payload, ["AI 复核已通过 VIBE_AI_REVIEW_ENABLED=false 关闭。"], {"enabled": False}
    if not api_base_url or not model:
        return payload, ["AI 复核未启用：缺少 ai_api_base_url 或 ai_model。"], {"enabled": False}

    questions = payload.get("questions", [])
    warnings: list[str] = []
    applied: list[dict[str, Any]] = []
    ai_issue_count = 0
    chunks = [questions[index : index + AI_REVIEW_CHUNK_SIZE] for index in range(0, len(questions), AI_REVIEW_CHUNK_SIZE)]
    by_number = {int(question["number"]): question for question in questions if "number" in question}
    logger.info("[%s] AI review started: chunks=%s model=%s base=%s", request_id, len(chunks), model, api_base_url)

    for index, chunk in enumerate(chunks, start=1):
        if progress_callback:
            progress_callback(index, len(chunks), "ai_running")
        compact = [compact_question_for_ai(question) for question in chunk]
        messages = [
            {
                "role": "system",
                "content": build_ai_system_prompt()
            },
            {
                "role": "user",
                "content": build_ai_review_prompt(compact)
            },
        ]
        try:
            content = call_openai_compatible_chat(api_base_url, api_key, model, messages)
            review = extract_json_object(content)
        except Exception as exc:
            logger.exception("[%s] AI review chunk %s failed", request_id, index)
            warnings.append(f"AI 复核第 {index}/{len(chunks)} 组失败：{exc}")
            continue

        for warning in review.get("warnings", []) if isinstance(review.get("warnings"), list) else []:
            if not isinstance(warning, dict):
                continue
            number = warning.get("number")
            message = str(warning.get("message", "")).strip()
            if message:
                ai_issue_count += 1
                warnings.append(f"AI 提示：第 {number} 题，{message}")

        for correction in review.get("corrections", []) if isinstance(review.get("corrections"), list) else []:
            if not isinstance(correction, dict):
                continue
            try:
                number = int(correction.get("number"))
            except (TypeError, ValueError):
                continue
            confidence = float(correction.get("confidence") or 0)
            question = by_number.get(number)
            if not question or confidence < AI_REVIEW_MIN_CONFIDENCE:
                reason = str(correction.get("reason", "")).strip()
                if reason:
                    warnings.append(f"AI 未自动修改：第 {number} 题置信度 {confidence:.2f}，{reason}")
                continue
            changed, blocked = apply_ai_correction(question, correction)
            if blocked:
                warnings.append(
                    f"AI 未应用无来源补写：第 {number} 题（{','.join(blocked)}），请依据原 PDF 人工补充。"
                )
            if changed:
                applied.append(
                    {
                        "number": number,
                        "fields": changed,
                        "confidence": confidence,
                        "reason": str(correction.get("reason", "")).strip(),
                    }
                )
                warnings.append(f"AI 已修正：第 {number} 题（{','.join(changed)}），请预览确认。")
        if progress_callback:
            progress_callback(index, len(chunks), "ai_done")

    logger.info("[%s] AI review finished: applied=%s warnings=%s", request_id, len(applied), len(warnings))
    return payload, warnings, {
        "enabled": True,
        "model": model,
        "chunks": len(chunks),
        "applied": applied,
        "issueCount": ai_issue_count,
        "promptPaths": {
            "system": str(AI_REVIEW_SYSTEM_PROMPT_PATH),
            "user": str(AI_REVIEW_USER_PROMPT_PATH),
        },
    }


def merge_payload(
    *,
    title: str,
    year: int,
    region_name: str,
    owner_name: str,
    owner_type: str,
    course_name: str,
    questions: list[dict[str, Any]],
    answers: dict[int, dict[str, str]],
) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    records: list[dict[str, Any]] = []
    for question in questions:
        answer = answers.get(question["number"])
        if not answer:
            warnings.append(f"第 {question['number']} 题没有匹配到答案解析。")
            answer = {"answer": "", "analysis": ""}
        records.append(
            {
                "number": question["number"],
                "type": question["type"],
                "stem": question["stem"],
                "options": question["options"],
                "answer": answer_to_list(question["type"], answer["answer"]),
                "analysis": answer["analysis"],
                "source": title,
                "sourceYear": year,
                "difficulty": "medium",
            }
        )

    payload = {
        "title": title,
        "year": year,
        "paperType": "real_exam",
        "regionName": region_name,
        "courseName": course_name or owner_name,
        "chapterTitle": f"{year}年真题",
        "knowledgePointTitle": title,
        "questions": records,
    }
    if owner_type == "public_subject":
        payload["publicSubjectName"] = owner_name
        payload["subjectName"] = owner_name
    else:
        payload["majorName"] = owner_name
        payload["subjectName"] = owner_name.replace("专业", "")
    return payload, warnings


def validate_payload(payload: dict[str, Any]) -> list[str]:
    warnings: list[str] = []
    for question in payload.get("questions", []):
        number = question.get("number")
        question_type = question.get("type")
        options = question.get("options") or []
        answer = question.get("answer") or []
        analysis = str(question.get("analysis") or "").strip()
        option_keys = {option.get("key") for option in options}

        if not str(question.get("stem") or "").strip():
            warnings.append(f"第 {number} 题题干为空。")
        if question_type in {"single_choice", "multiple_choice"} and len(options) != 4:
            warnings.append(f"第 {number} 题选项数量为 {len(options)}，请确认。")
        if question_type == "single_choice" and len(answer) != 1:
            warnings.append(f"第 {number} 题单选答案数量为 {len(answer)}，请确认。")
        if question_type == "multiple_choice" and len(answer) < 2:
            warnings.append(f"第 {number} 题多选答案少于 2 个，请确认。")
        if question_type in {"single_choice", "multiple_choice"} and any(item not in option_keys for item in answer):
            warnings.append(f"第 {number} 题答案不在选项中：{'、'.join(answer)}。")
        if question_type == "true_false" and any(item not in {"A", "B"} for item in answer):
            warnings.append(f"第 {number} 题判断题答案不是 A/B，请确认。")
        if not answer:
            warnings.append(f"第 {number} 题答案为空。")
        if not analysis:
            warnings.append(f"第 {number} 题解析为空。")
    return warnings


def question_parse_score(questions: list[dict[str, Any]], debug: dict[str, Any]) -> float:
    expected = int(debug.get("expectedQuestionCount") or 0)
    coverage = len(questions) / expected if expected else (1.0 if questions else 0.0)
    choice_questions = [
        question for question in questions if question.get("type") in {"single_choice", "multiple_choice"}
    ]
    complete_choices = sum(len(question.get("options") or []) >= 4 for question in choice_questions)
    option_quality = complete_choices / len(choice_questions) if choice_questions else 1.0
    return coverage * 100.0 + option_quality * 20.0


def extract_questions_adaptive(
    question_path: Path,
    *,
    request_id: str,
    progress_callback: Any = None,
) -> tuple[list[dict[str, Any]], list[str], dict[str, Any]]:
    inspection = inspect_native_text(question_path)
    page_count = int(inspection["pageCount"])
    candidates: list[tuple[list[dict[str, Any]], list[str], dict[str, Any]]] = []

    if inspection["usable"]:
        native_pages = [rows_from_page(page) for page in native_blocks_from_pdf(question_path)]
        native_questions, native_warnings, native_structure = parse_questions_from_rows(native_pages)
        native_debug = {
            **native_structure,
            "method": "native_text",
            "meaningfulChars": inspection["meaningfulChars"],
            "pageMeaningfulChars": inspection["pageMeaningfulChars"],
            "pageCount": page_count,
        }
        candidates.append((native_questions, native_warnings, native_debug))
        expected = int(native_structure.get("expectedQuestionCount") or 0)
        coverage = len(native_questions) / expected if expected else (1.0 if native_questions else 0.0)
        needs_ocr_fallback = coverage < 0.90
    else:
        needs_ocr_fallback = True

    if needs_ocr_fallback:
        page_images = render_pdf_pages(question_path, question_path.parent / "pages", request_id)
        pages_ocr = run_ocr(page_images, request_id, progress_callback=progress_callback)
        ocr_questions, ocr_warnings, ocr_structure = parse_questions_from_ocr(pages_ocr)
        candidates.append(
            (
                ocr_questions,
                ocr_warnings,
                {
                    **ocr_structure,
                    "method": "ocr",
                    "nativeMeaningfulChars": inspection["meaningfulChars"],
                    "pageMeaningfulChars": inspection["pageMeaningfulChars"],
                    "pageCount": page_count,
                },
            )
        )
        expected = int(ocr_structure.get("expectedQuestionCount") or 0)
        if expected and len(ocr_questions) < expected and OCR_REPAIR_SCALE > OCR_RENDER_SCALE:
            repair_request_id = f"{request_id}-repair"
            repair_images = render_pdf_pages(
                question_path,
                question_path.parent / "pages_repair",
                repair_request_id,
                scale=OCR_REPAIR_SCALE,
            )
            repair_pages_ocr = run_ocr(repair_images, repair_request_id)
            repair_questions, _, repair_structure = parse_questions_from_ocr(repair_pages_ocr)
            merged_by_number = {int(question["number"]): question for question in ocr_questions}
            repaired_numbers: list[int] = []
            for repair_question in repair_questions:
                number = int(repair_question["number"])
                current = merged_by_number.get(number)
                if current is None:
                    merged_by_number[number] = repair_question
                    repaired_numbers.append(number)
                    continue
                if len(repair_question.get("options") or []) > len(current.get("options") or []):
                    current["options"] = repair_question["options"]
            merged_questions = [merged_by_number[number] for number in sorted(merged_by_number)]
            merged_warnings = [warning for warning in ocr_warnings if not warning.startswith("疑似漏识")]
            merged_structure = {
                **ocr_structure,
                "expectedQuestionCount": max(
                    expected,
                    int(repair_structure.get("expectedQuestionCount") or 0),
                ),
                "repairScale": OCR_REPAIR_SCALE,
                "repairedQuestionNumbers": repaired_numbers,
            }
            candidates.append(
                (
                    merged_questions,
                    merged_warnings,
                    {
                        **merged_structure,
                        "method": "ocr_multiscale",
                        "nativeMeaningfulChars": inspection["meaningfulChars"],
                        "pageMeaningfulChars": inspection["pageMeaningfulChars"],
                        "pageCount": page_count,
                    },
                )
            )

    questions, warnings, debug = max(candidates, key=lambda candidate: question_parse_score(candidate[0], candidate[2]))
    debug["candidateMethods"] = [
        {
            "method": candidate_debug["method"],
            "questionCount": len(candidate_questions),
            "score": round(question_parse_score(candidate_questions, candidate_debug), 2),
        }
        for candidate_questions, _, candidate_debug in candidates
    ]
    return questions, warnings, debug


def build_quality_gate(
    *,
    questions: list[dict[str, Any]],
    answers: dict[int, dict[str, str]],
    question_debug: dict[str, Any],
) -> dict[str, Any]:
    question_count = len(questions)
    answered_count = sum(bool(str(answer.get("answer") or "").strip()) for answer in answers.values())
    answer_ratio = answered_count / question_count if question_count else 0.0
    expected_count = int(question_debug.get("expectedQuestionCount") or question_count)
    reasons: list[str] = []
    if not question_count:
        reasons.append("没有识别到题目")
    if expected_count > question_count:
        reasons.append(f"预计 {expected_count} 题，实际识别 {question_count} 题")
    if question_count and answer_ratio < ANSWER_MATCH_MIN_RATIO:
        reasons.append(
            f"有来源答案仅匹配 {answered_count}/{question_count}，低于 {ANSWER_MATCH_MIN_RATIO:.0%} 门槛"
        )
    return {
        "status": "review_required" if reasons else "passed",
        "reviewRequired": bool(reasons),
        "reasons": reasons,
        "expectedQuestionCount": expected_count,
        "questionCount": question_count,
        "answeredQuestionCount": answered_count,
        "answerMatchRatio": round(answer_ratio, 4),
    }


def parse_question_files(
    *,
    question_path: Path,
    answer_path: Path,
    title: str,
    year: int,
    region_name: str,
    owner_name: str,
    owner_type: str,
    course_name: str,
    request_id: str,
    progress_callback: Any = None,
    ai_api_base_url: str = "",
    ai_api_key: str = "",
    ai_model: str = "",
) -> dict[str, Any]:
    questions, question_warnings, question_debug = extract_questions_adaptive(
        question_path,
        request_id=request_id,
        progress_callback=progress_callback,
    )
    logger.info("[%s] parsed questions=%s warnings=%s", request_id, len(questions), len(question_warnings))
    answer_text, answer_debug = extract_answer_text(answer_path, request_id=request_id)
    answers = parse_answers(answer_text, questions)
    logger.info("[%s] parsed answers=%s method=%s", request_id, len(answers), answer_debug["method"])
    quality_gate = build_quality_gate(questions=questions, answers=answers, question_debug=question_debug)
    payload, merge_warnings = merge_payload(
        title=title,
        year=year,
        region_name=region_name,
        owner_name=owner_name,
        owner_type=owner_type,
        course_name=course_name,
        questions=questions,
        answers=answers,
    )
    if len(questions) != len(answers):
        merge_warnings.append(
            f"题目数量 {len(questions)}，答案数量 {len(answers)}，请检查 OCR 是否漏题，或真题 PDF 与答案解析 PDF 是否对应。"
        )
    quality_warnings = [
        f"质量门禁未通过：{'；'.join(quality_gate['reasons'])}。请完成预览复核后再导入。"
    ] if quality_gate["reviewRequired"] else []
    stats = Counter(question["type"] for question in payload["questions"])
    ai_warnings: list[str] = []
    ai_debug: dict[str, Any] = {"enabled": False}
    if ai_api_base_url and ai_model:
        if progress_callback:
            progress_callback(0, 1, "ai_start")
        payload, ai_warnings, ai_debug = review_payload_with_ai(
            payload,
            api_base_url=ai_api_base_url,
            api_key=ai_api_key,
            model=ai_model,
            request_id=request_id,
            progress_callback=progress_callback,
        )
        stats = Counter(question["type"] for question in payload["questions"])
    validation_warnings = validate_payload(payload)
    return {
        "payload": payload,
        "stats": dict(stats),
        "warnings": quality_warnings + question_warnings + merge_warnings + ai_warnings + validation_warnings,
        "debug": {
            "requestId": request_id,
            "questionCount": len(payload["questions"]),
            "answerCount": len(answers),
            "answeredQuestionCount": quality_gate["answeredQuestionCount"],
            "pageCount": question_debug["pageCount"],
            "questionExtraction": question_debug,
            "answerExtraction": answer_debug,
            "qualityGate": quality_gate,
            "aiReview": ai_debug,
        },
    }


def run_parse_task(task_id: str, question_path: Path, answer_path: Path, meta: dict[str, Any]) -> None:
    started_at = time.time()
    logger.info("[%s] async parse started: %s", task_id, meta)

    def progress_callback(page_index: int, page_count: int, status: str) -> None:
        if status == "ai_start":
            set_task(task_id, status="running", stage="ai_review", progress=75, message="正在进行 AI 复核")
            add_task_event(task_id, "开始 AI 复核：OCR 纠错、题型复核、答案一致性检查")
            return
        base = 15
        span = 55
        stage = "ocr"
        if status in {"ai_running", "ai_done"}:
            base = 75
            span = 18
            stage = "ai_review"
        page_progress = int(base + span * (page_index - (0 if status in {"done", "ai_done"} else 1)) / max(page_count, 1))
        progress = min(93 if stage == "ai_review" else 70, max(base, page_progress))
        if stage == "ai_review":
            message = f"AI 复核第 {page_index}/{page_count} 组" + ("完成" if status == "ai_done" else "开始")
        else:
            message = f"OCR 第 {page_index}/{page_count} 页" + ("完成" if status == "done" else "开始")
        set_task(task_id, status="running", stage=stage, progress=progress, message=message)
        add_task_event(task_id, message)

    try:
        set_task(task_id, status="running", stage="render", progress=8, message="正在渲染 PDF 页面")
        add_task_event(task_id, "开始渲染 PDF 页面")
        result = parse_question_files(
            question_path=question_path,
            answer_path=answer_path,
            title=str(meta["title"]),
            year=int(meta["year"]),
            region_name=str(meta["region_name"]),
            owner_name=str(meta["owner_name"]),
            owner_type=str(meta["owner_type"]),
            course_name=str(meta.get("course_name") or ""),
            request_id=task_id,
            progress_callback=progress_callback,
            ai_api_base_url=str(meta.get("ai_api_base_url") or ""),
            ai_api_key=str(meta.get("ai_api_key") or ""),
            ai_model=str(meta.get("ai_model") or ""),
        )
        issue_report_paths: dict[str, str] = {}
        try:
            issue_report_paths = write_import_issue_report(
                task_id=task_id,
                task_path=question_path.parent,
                meta=meta,
                result=result,
                status="succeeded",
            )
            result["debug"]["issueReport"] = issue_report_paths
        except Exception:
            logger.exception("[%s] failed to write import issue report", task_id)
        set_task(
            task_id,
            status="succeeded",
            stage="done",
            progress=100,
            message="解析完成",
            payload=result["payload"],
            stats=result["stats"],
            warnings=result["warnings"],
            debug=result["debug"],
            finishedAt=time.time(),
        )
        if issue_report_paths:
            add_task_event(task_id, f"导入问题报告已写入：{issue_report_paths['text']}")
        add_task_event(task_id, f"解析完成：{result['debug']['questionCount']} 题，耗时 {time.time() - started_at:.2f}s")
        logger.info("[%s] async parse finished in %.2fs stats=%s warnings=%s", task_id, time.time() - started_at, result["stats"], len(result["warnings"]))
    except Exception as exc:
        logger.exception("[%s] async parse failed", task_id)
        try:
            write_import_issue_report(
                task_id=task_id,
                task_path=question_path.parent,
                meta=meta,
                result=None,
                status="failed",
                error=str(exc),
            )
        except Exception:
            logger.exception("[%s] failed to write failed import issue report", task_id)
        set_task(
            task_id,
            status="failed",
            stage="failed",
            progress=100,
            message="解析失败",
            error=str(exc),
            finishedAt=time.time(),
        )
        add_task_event(task_id, f"解析失败：{exc}")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/parse-question-paper")
async def parse_question_paper(
    question_pdf: UploadFile = File(...),
    answer_pdf: UploadFile = File(...),
    title: str = Form(...),
    year: int = Form(...),
    region_name: str = Form("江苏三年制"),
    owner_name: str = Form("计算机专业"),
    owner_type: str = Form("major"),
    course_name: str = Form(""),
    ai_api_base_url: str = Form(""),
    ai_api_key: str = Form(""),
    ai_model: str = Form(""),
) -> JSONResponse:
    request_id = uuid.uuid4().hex[:8]
    started_at = time.time()
    logger.info("[%s] parse started: title=%s year=%s owner=%s ownerType=%s", request_id, title, year, owner_name, owner_type)
    with tempfile.TemporaryDirectory() as temp_dir:
        temp = Path(temp_dir)
        question_path = temp / (question_pdf.filename or "question.pdf")
        answer_path = temp / (answer_pdf.filename or "answer.pdf")
        question_bytes = await question_pdf.read()
        answer_bytes = await answer_pdf.read()
        question_path.write_bytes(question_bytes)
        answer_path.write_bytes(answer_bytes)
        logger.info("[%s] uploads saved: question=%s bytes answer=%s bytes", request_id, len(question_bytes), len(answer_bytes))

        result = parse_question_files(
            question_path=question_path,
            answer_path=answer_path,
            title=title,
            year=year,
            region_name=region_name,
            owner_name=owner_name,
            owner_type=owner_type,
            course_name=course_name,
            request_id=request_id,
            ai_api_base_url=ai_api_base_url,
            ai_api_key=ai_api_key,
            ai_model=ai_model,
        )
        logger.info("[%s] parse finished in %.2fs stats=%s warnings=%s", request_id, time.time() - started_at, result["stats"], len(result["warnings"]))

        return JSONResponse(result)


@app.post("/parse-question-paper-tasks")
async def create_parse_task(
    background_tasks: BackgroundTasks,
    question_pdf: UploadFile = File(...),
    answer_pdf: UploadFile = File(...),
    title: str = Form(...),
    year: int = Form(...),
    region_name: str = Form("江苏三年制"),
    owner_name: str = Form("计算机专业"),
    owner_type: str = Form("major"),
    course_name: str = Form(""),
    ai_api_base_url: str = Form(""),
    ai_api_key: str = Form(""),
    ai_model: str = Form(""),
) -> JSONResponse:
    task_id = uuid.uuid4().hex[:12]
    task_path = TASK_DIR / task_id
    task_path.mkdir(parents=True, exist_ok=True)
    question_path = task_path / (question_pdf.filename or "question.pdf")
    answer_path = task_path / (answer_pdf.filename or "answer.pdf")
    question_bytes = await question_pdf.read()
    answer_bytes = await answer_pdf.read()
    question_path.write_bytes(question_bytes)
    answer_path.write_bytes(answer_bytes)
    created_at = time.time()
    remember_task(
        task_id,
        {
            "taskId": task_id,
            "status": "queued",
            "stage": "queued",
            "progress": 2,
            "message": "任务已创建，等待解析",
            "title": title,
            "year": year,
            "ownerName": owner_name,
            "createdAt": created_at,
            "updatedAt": created_at,
            "events": [{"time": created_at, "message": "任务已创建"}],
            "warnings": [],
            "stats": {},
            "debug": {
                "questionBytes": len(question_bytes),
                "answerBytes": len(answer_bytes),
            },
        },
    )
    meta = {
        "title": title,
        "year": year,
        "region_name": region_name,
        "owner_name": owner_name,
        "owner_type": owner_type,
        "course_name": course_name,
        "ai_api_base_url": ai_api_base_url,
        "ai_api_key": ai_api_key,
        "ai_model": ai_model,
    }
    background_tasks.add_task(run_parse_task, task_id, question_path, answer_path, meta)
    logger.info("[%s] async parse queued: title=%s year=%s owner=%s", task_id, title, year, owner_name)
    return JSONResponse(public_task(TASKS[task_id], include_payload=False))


@app.get("/parse-question-paper-tasks/{task_id}")
def get_parse_task(task_id: str) -> JSONResponse:
    with TASK_LOCK:
        task = TASKS.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        response = public_task(task, include_payload=True)
    return JSONResponse(response)


@app.get("/parse-question-paper-tasks")
def list_parse_tasks() -> JSONResponse:
    with TASK_LOCK:
        tasks = sorted(TASKS.values(), key=lambda item: item.get("createdAt", 0), reverse=True)
        response = [public_task(task, include_payload=False) for task in tasks[:30]]
    return JSONResponse({"tasks": response})


if __name__ == "__main__":
    print(json.dumps({"service": "Vibe Learning Question PDF Parser", "status": "ready"}, ensure_ascii=False))
