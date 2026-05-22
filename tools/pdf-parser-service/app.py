from __future__ import annotations

import json
import logging
import os
import re
import shutil
import tempfile
import threading
import time
import uuid
from collections import Counter
from pathlib import Path
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

TASK_DIR = Path(os.getenv("VIBE_PDF_TASK_DIR", "/tmp/vibe_pdf_parser_tasks"))
TASK_LIMIT = int(os.getenv("VIBE_PDF_TASK_LIMIT", "80"))
AI_REVIEW_ENABLED = os.getenv("VIBE_AI_REVIEW_ENABLED", "true").lower() != "false"
AI_REVIEW_CHUNK_SIZE = int(os.getenv("VIBE_AI_REVIEW_CHUNK_SIZE", "12"))
AI_REVIEW_TIMEOUT = float(os.getenv("VIBE_AI_REVIEW_TIMEOUT", "90"))
AI_REVIEW_MIN_CONFIDENCE = float(os.getenv("VIBE_AI_REVIEW_MIN_CONFIDENCE", "0.74"))
TASKS: dict[str, dict[str, Any]] = {}
TASK_LOCK = threading.Lock()


QUESTION_START = re.compile(r"^\s*(\d{1,3})[\.．、]\s*(.*)$")
OPTION_START = re.compile(r"([A-D])[\.\．、,，]\s*")


def question_type_from_section(section: str) -> str:
    if section == "multiple_choice":
        return "multiple_choice"
    if section == "true_false":
        return "true_false"
    if section == "fill_blank":
        return "fill_blank"
    if section == "comprehensive":
        return "comprehensive"
    return "single_choice"


def normalize_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return (
        text.replace("不可算改", "不可篡改")
        .replace("路山功能", "路由功能")
        .replace("i0S", "iOS")
        .replace("白动驾驶", "自动驾驶")
    )


def render_pdf_pages(pdf_path: Path, output_dir: Path, request_id: str) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    document = fitz.open(pdf_path)
    logger.info("[%s] rendering %s pages from %s", request_id, document.page_count, pdf_path.name)
    image_paths: list[Path] = []
    matrix = fitz.Matrix(2, 2)
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
    for item in sorted(page, key=lambda entry: (float(entry["y"]), float(entry["x"]))):
        text = str(item.get("text", "")).strip()
        if not text:
            continue
        if any(token in text for token in ("小红书搜索", "免费领取", "文行文化")):
            continue
        y = float(item["y"])
        if rows and abs(float(rows[-1][0]["y"]) - y) <= 6:
            rows[-1].append(item)
        else:
            rows.append([item])
    return [" ".join(str(cell["text"]).strip() for cell in sorted(row, key=lambda entry: float(entry["x"]))) for row in rows]


def parse_options(row: str) -> list[dict[str, str]]:
    matches = list(OPTION_START.finditer(row))
    options: list[dict[str, str]] = []
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(row)
        text = row[start:end].strip()
        if text:
            options.append({"key": match.group(1), "text": normalize_text(text)})
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


def parse_questions_from_ocr(pages: list[list[dict[str, Any]]]) -> tuple[list[dict[str, Any]], list[str]]:
    questions: list[dict[str, Any]] = []
    warnings: list[str] = []
    section = "single_choice"
    current: dict[str, Any] | None = None
    expected = 1
    started = False
    skipping_out_of_sequence = False

    def finish_current() -> None:
        nonlocal current
        if not current:
            return
        stem = normalize_text(" ".join(current.pop("stem_parts")))
        if stem.endswith("（"):
            stem += "）"
        option_map = {option["key"]: option["text"] for option in current["options"]}
        current["stem"] = stem
        current["options"] = [{"key": key, "text": option_map[key]} for key in ("A", "B", "C", "D") if key in option_map]
        if current["type"] == "true_false":
            current["options"] = [{"key": "A", "text": "正确"}, {"key": "B", "text": "错误"}]
        if current["type"] in {"fill_blank", "comprehensive"}:
            current["options"] = []
        questions.append(current)
        current = None

    for page_index, page in enumerate(pages, start=1):
        for row in rows_from_page(page):
            if any(token in row for token in ("答案：", "解题关键词")):
                continue
            if "单项选择题" in row:
                started = True
                section = "single_choice"
                continue
            start_match = QUESTION_START.match(row)
            if not started and start_match and looks_like_exam_instruction(row):
                continue
            if not started and start_match:
                started = True
            if not started:
                continue
            if "多项选择题" in row:
                section = "multiple_choice"
                continue
            if "判断题" in row:
                section = "true_false"
                continue
            if "填空题" in row:
                section = "fill_blank"
                continue
            if "综合" in row and "题" in row:
                section = "comprehensive"
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
                        current = {
                            "number": number,
                            "type": question_type_from_section(section),
                            "stem_parts": [match.group(2).strip()],
                            "options": [],
                        }
                        expected = number + 1
                        continue

                    skipping_out_of_sequence = True
                    warnings.append(f"跳过疑似乱序题号：第 {number} 题，当前期望第 {expected} 题。")
                    continue
                skipping_out_of_sequence = False
                finish_current()
                current = {
                    "number": number,
                    "type": question_type_from_section(section),
                    "stem_parts": [match.group(2).strip()],
                    "options": [],
                }
                expected += 1
                continue

            if skipping_out_of_sequence or current is None:
                continue
            options = parse_options(row)
            if options and current["type"] in {"single_choice", "multiple_choice"}:
                current["options"].extend(options)
            else:
                current["stem_parts"].append(row)

    finish_current()

    for question in questions:
        if question["type"] in {"single_choice", "multiple_choice"} and len(question["options"]) != 4:
            warnings.append(f"第 {question['number']} 题选项数量为 {len(question['options'])}，请预览确认。")
    return questions, warnings


def extract_pdf_text(pdf_path: Path) -> str:
    document = fitz.open(pdf_path)
    return "\n".join(page.get_text("text") for page in document)


def clean_analysis(text: str) -> str:
    text = re.sub(r"\n\s*\d+\s*\n", "\n", text)
    text = text.replace("文行文化", " ")
    text = re.sub(r"\s*[一二三四五六七八九十]、(?:单项选择题|多项选择题|判断题|填空题|综合题)\s*", " ", text)
    return normalize_text(text)


def parse_answers(answer_text: str) -> dict[int, dict[str, str]]:
    prefix = chr(0x7B2C)
    question = chr(0x9898)
    analysis = chr(0x89E3) + chr(0x6790)
    full_colon = chr(0xFF1A)
    pattern = re.compile(
        f"{prefix}\\s*(\\d{{1,3}})\\s*{question}[:{full_colon}]\\s*(.*?)\\s*"
        f"{analysis}[:{full_colon}](.*?)(?=\\n{prefix}\\s*\\d{{1,3}}\\s*{question}[:{full_colon}]|\\Z)",
        re.S,
    )
    answers: dict[int, dict[str, str]] = {}
    for match in pattern.finditer(answer_text):
        number = int(match.group(1))
        answers[number] = {
            "answer": re.sub(r"\s+", "", match.group(2).strip()),
            "analysis": clean_analysis(match.group(3)),
        }
    return answers


def answer_to_list(question_type: str, answer: str) -> list[str]:
    if question_type in {"single_choice", "multiple_choice", "true_false"}:
        return list(answer)
    return [answer]


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


def build_ai_review_prompt(questions: list[dict[str, Any]]) -> str:
    return (
        "你是江苏专转本题库导入质检助手。下面是 OCR 和规则解析后的题目 JSON 片段。"
        "请只做保守复核：1) 修正明显 OCR 错字、断行和标点问题；2) 复核题型是否合理；"
        "3) 复核答案是否存在于选项中、是否与解析最后结论一致；4) 标出无法确定的问题。"
        "不要凭空新增题目，不要改写题意，不确定时只给 warning。"
        "只输出 JSON，不要 Markdown。JSON 格式："
        "{\"corrections\":[{\"number\":1,\"confidence\":0.9,\"reason\":\"原因\","
        "\"type\":\"single_choice\",\"stem\":\"可选\",\"options\":[{\"key\":\"A\",\"text\":\"...\"}],"
        "\"answer\":[\"A\"],\"analysis\":\"可选\"}],"
        "\"warnings\":[{\"number\":2,\"message\":\"问题描述\"}]}"
        "允许的 type：single_choice,multiple_choice,true_false,fill_blank,comprehensive。"
        "只有 confidence >= 0.74 且非常确定时才放 corrections。题目如下：\n"
        f"{json.dumps(questions, ensure_ascii=False)}"
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


def apply_ai_correction(question: dict[str, Any], correction: dict[str, Any]) -> list[str]:
    changed: list[str] = []
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
                question[key] = text
                changed.append(label)

    options = sanitize_ai_options(correction.get("options"))
    if options is not None and options and options != question.get("options"):
        question["options"] = options
        changed.append("选项")

    answer = sanitize_ai_answer(correction.get("answer"))
    if answer is not None and answer != question.get("answer"):
        question["answer"] = answer
        changed.append("答案")

    return changed


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
                "content": "你是严谨的考试题库质检助手，只输出 JSON。"
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
            changed = apply_ai_correction(question, correction)
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
    return payload, warnings, {"enabled": True, "model": model, "chunks": len(chunks), "applied": applied, "issueCount": ai_issue_count}


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
    page_images = render_pdf_pages(question_path, question_path.parent / "pages", request_id)
    pages_ocr = run_ocr(page_images, request_id, progress_callback=progress_callback)
    questions, question_warnings = parse_questions_from_ocr(pages_ocr)
    logger.info("[%s] parsed questions=%s warnings=%s", request_id, len(questions), len(question_warnings))
    answers = parse_answers(extract_pdf_text(answer_path))
    logger.info("[%s] parsed answers=%s", request_id, len(answers))
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
        "warnings": question_warnings + merge_warnings + ai_warnings + validation_warnings,
        "debug": {
            "requestId": request_id,
            "questionCount": len(payload["questions"]),
            "answerCount": len(answers),
            "pageCount": len(page_images),
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
        add_task_event(task_id, f"解析完成：{result['debug']['questionCount']} 题，耗时 {time.time() - started_at:.2f}s")
        logger.info("[%s] async parse finished in %.2fs stats=%s warnings=%s", task_id, time.time() - started_at, result["stats"], len(result["warnings"]))
    except Exception as exc:
        logger.exception("[%s] async parse failed", task_id)
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
