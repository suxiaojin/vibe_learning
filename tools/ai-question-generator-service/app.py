from __future__ import annotations

import json
import logging
import os
import re
import shutil
import threading
import time
import uuid
from collections import Counter
from pathlib import Path
from typing import Any

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse


app = FastAPI(title="Vibe Learning AI Question Generator")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
logger = logging.getLogger("vibe_ai_question_generator")

TASK_DIR = Path(os.getenv("VIBE_AI_QUESTION_TASK_DIR", "/data/vibe_ai_question_generator_tasks"))
TASK_LIMIT = int(os.getenv("VIBE_AI_QUESTION_TASK_LIMIT", "80"))
AI_GENERATION_TIMEOUT = float(os.getenv("VIBE_AI_QUESTION_TIMEOUT", "120"))
MAX_SAMPLE_QUESTIONS = int(os.getenv("VIBE_AI_QUESTION_SAMPLE_LIMIT", "50"))
AI_RESPONSE_FORMAT_ENABLED = os.getenv("VIBE_AI_QUESTION_RESPONSE_FORMAT", "true").lower() != "false"
BASE_DIR = Path(__file__).resolve().parent
PROMPT_DIR = Path(os.getenv("VIBE_AI_QUESTION_PROMPT_DIR", str(BASE_DIR / "prompts")))
SYSTEM_PROMPT_PATH = Path(os.getenv("VIBE_AI_QUESTION_SYSTEM_PROMPT_PATH", str(PROMPT_DIR / "system_prompt.txt")))
USER_PROMPT_PATH = Path(os.getenv("VIBE_AI_QUESTION_USER_PROMPT_PATH", str(PROMPT_DIR / "user_prompt.txt")))
TASKS: dict[str, dict[str, Any]] = {}
TASK_LOCK = threading.Lock()

QUESTION_TYPE_ORDER = ["single_choice", "multiple_choice", "true_false", "fill_blank", "calculation", "proof", "comprehensive", "term_explanation", "calculation_analysis", "practical_writing", "short_answer", "essay", "comprehensive_analysis", "material_analysis", "operation_record", "practical_operation", "application", "question_answer", "handwriting", "reading_comprehension", "poetry_appreciation", "classical_chinese_translation", "writing", "legal_document", "chinese_character_writing", "language_expression", "teaching_design", "comprehensive_essay"]
QUESTION_TYPES = set(QUESTION_TYPE_ORDER)
DIFFICULTIES = {"easy", "medium", "hard"}
QUESTION_TYPE_LABELS = {
    "single_choice": "单选",
    "multiple_choice": "多选",
    "true_false": "判断",
    "fill_blank": "填空",
    "calculation": "计算",
    "proof": "证明",
    "comprehensive": "综合",
    "term_explanation": "名词解释",
    "calculation_analysis": "计算分析",
    "practical_writing": "应用文写作",
    "short_answer": "简答",
    "essay": "论述",
    "comprehensive_analysis": "综合分析",
    "material_analysis": "材料分析",
    "operation_record": "操作记录",
    "practical_operation": "实际操作",
    "application": "应用",
    "question_answer": "问答",
    "handwriting": "书写",
    "reading_comprehension": "阅读理解",
    "poetry_appreciation": "古诗词鉴赏",
    "classical_chinese_translation": "文言文翻译",
    "writing": "写作",
    "legal_document": "法律文书",
    "chinese_character_writing": "汉字书写",
    "language_expression": "语言表达",
    "teaching_design": "教学设计",
    "comprehensive_essay": "综合（论述）"
}

DIFFICULTY_LABELS = {
    "easy": "简单",
    "medium": "中等",
    "hard": "困难",
}

DEFAULT_SYSTEM_PROMPT = "你是江苏专转本考试题库教研老师，只输出严格 JSON。"

DEFAULT_USER_PROMPT_TEMPLATE = (
    "请根据下面的生成任务和样题生成新题。不得照抄样题，不得只替换数字。"
    "输出必须是 JSON 对象，格式为："
    "{\"questions\":[{\"type\":\"single_choice\",\"stem\":\"题干\","
    "\"options\":[{\"key\":\"A\",\"text\":\"选项\"}],\"answer\":[\"A\"],"
    "\"analysis\":\"解析\",\"difficulty\":\"medium\"}]}。"
    "生成任务：{{REQUEST_JSON}}\n样题：{{SAMPLES_JSON}}"
)


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
    TASK_DIR.mkdir(parents=True, exist_ok=True)
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


def normalize_text(text: Any) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def normalize_for_match(text: Any) -> str:
    return re.sub(r"[\W_]+", "", str(text or "").lower())


def truncate_text(text: Any, limit: int) -> str:
    value = normalize_text(text)
    return value if len(value) <= limit else f"{value[:limit]}..."


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


def write_task_artifact(task_id: str, filename: str, content: str) -> str:
    task_path = TASK_DIR / task_id
    task_path.mkdir(parents=True, exist_ok=True)
    path = task_path / filename
    path.write_text(content, encoding="utf-8")
    return str(path)


def compact_sample(sample: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": sample.get("type"),
        "referenceChapterIds": sample.get("referenceChapterIds") or [],
        "stem": truncate_text(sample.get("stem"), 360),
        "options": sample.get("options") if isinstance(sample.get("options"), list) else [],
        "answer": sample.get("answer") if isinstance(sample.get("answer"), list) else sample.get("answer"),
        "analysis": truncate_text(sample.get("analysis"), 420),
        "source": sample.get("source"),
        "sourceType": sample.get("sourceType"),
        "difficulty": sample.get("difficulty"),
    }


def read_prompt_template(path: Path, fallback: str) -> str:
    try:
        text = path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return fallback
    return text or fallback


def build_system_prompt() -> str:
    return read_prompt_template(SYSTEM_PROMPT_PATH, DEFAULT_SYSTEM_PROMPT)


def build_user_prompt(meta: dict[str, Any], samples: list[dict[str, Any]]) -> str:
    requested_types = meta.get("questionTypes") or QUESTION_TYPE_ORDER
    type_text = "、".join(QUESTION_TYPE_LABELS.get(item, item) for item in requested_types)
    difficulty = str(meta.get("difficulty") or "medium")
    request_payload = {
        "province": "江苏",
        "exam": "专转本",
        "ownerName": meta.get("ownerName"),
        "regionName": meta.get("regionName"),
        "questionBankTitle": meta.get("title"),
        "referenceChapters": meta.get("referenceChapters") or [],
        "count": meta.get("count"),
        "questionTypes": requested_types,
        "questionTypeCounts": meta.get("questionTypeCounts") or {},
        "questionTypeLabels": type_text,
        "generationPlan": build_generation_plan(meta, int(meta.get("count") or 10)),
        "difficulty": difficulty,
        "difficultyLabel": DIFFICULTY_LABELS.get(difficulty, difficulty),
        "sourceLabel": meta.get("sourceLabel") or "AI模拟真题",
    }
    samples_json = json.dumps([compact_sample(sample) for sample in samples[:MAX_SAMPLE_QUESTIONS]], ensure_ascii=False)
    template = read_prompt_template(USER_PROMPT_PATH, DEFAULT_USER_PROMPT_TEMPLATE)
    if "{{REQUEST_JSON}}" not in template:
        template = f"{template.rstrip()}\n\n生成任务：{{{{REQUEST_JSON}}}}\n样题：{{{{SAMPLES_JSON}}}}"
    return (
        template.replace("{{REQUEST_JSON}}", json.dumps(request_payload, ensure_ascii=False))
        .replace("{{SAMPLES_JSON}}", samples_json)
    )


def call_openai_compatible_chat(
    api_base_url: str,
    api_key: str,
    model: str,
    messages: list[dict[str, str]],
    *,
    response_format: bool = False,
) -> str:
    url = f"{api_base_url.rstrip('/')}/chat/completions"
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.55,
        "stream": False,
    }
    if response_format and AI_RESPONSE_FORMAT_ENABLED:
        payload["response_format"] = {"type": "json_object"}
    with httpx.Client(timeout=AI_GENERATION_TIMEOUT) as client:
        response = client.post(url, headers=headers, json=payload)
        if response.status_code >= 400 and response_format and AI_RESPONSE_FORMAT_ENABLED:
            payload.pop("response_format", None)
            response = client.post(url, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()
    return str(data["choices"][0]["message"]["content"])


def repair_json_with_ai(*, content: str, api_base_url: str, api_key: str, model: str, task_id: str) -> str:
    repair_messages = [
        {
            "role": "system",
            "content": "你是 JSON 修复器。只输出严格 JSON，不要 Markdown，不要解释。",
        },
        {
            "role": "user",
            "content": (
                "下面内容本应是题目 JSON，但格式不合法。请只修复 JSON 语法，不要新增题目，不要改写题意。"
                "目标格式为 {\"questions\":[...]}。\n\n"
                f"{content}"
            ),
        },
    ]
    repaired = call_openai_compatible_chat(
        api_base_url,
        api_key,
        model,
        repair_messages,
        response_format=True,
    )
    write_task_artifact(task_id, "ai_response_repaired.txt", repaired)
    return repaired


def sanitize_options(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    options: list[dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        key = str(item.get("key", "")).strip().upper()[:1]
        text = normalize_text(item.get("text"))
        if key in {"A", "B", "C", "D"} and text:
            options.append({"key": key, "text": text})
    option_map = {item["key"]: item["text"] for item in options}
    return [{"key": key, "text": option_map[key]} for key in ("A", "B", "C", "D") if key in option_map]


def sanitize_answer(value: Any) -> list[str]:
    if isinstance(value, str):
        items = re.split(r"[、,\s]+", value.strip())
    elif isinstance(value, list):
        items = [str(item).strip() for item in value]
    else:
        items = []
    answer: list[str] = []
    for item in items:
        if item and item not in answer:
            answer.append(item.upper() if len(item) == 1 else item)
    return answer


def choose_question_type(value: Any, requested_types: list[str]) -> str:
    if isinstance(value, str) and value in QUESTION_TYPES and (not requested_types or value in requested_types):
        return value
    return requested_types[0] if requested_types else "single_choice"


def parse_question_type_counts(value: Any) -> dict[str, int]:
    if not isinstance(value, dict):
        return {}
    counts: dict[str, int] = {}
    for question_type in QUESTION_TYPE_ORDER:
        try:
            amount = int(value.get(question_type) or 0)
        except (TypeError, ValueError):
            amount = 0
        if amount > 0:
            counts[question_type] = amount
    return counts


def build_target_question_types(meta: dict[str, Any], expected_count: int) -> list[str]:
    requested_types = [item for item in meta.get("questionTypes", []) if item in QUESTION_TYPES] or QUESTION_TYPE_ORDER
    requested_type_set = set(requested_types)
    question_type_counts = parse_question_type_counts(meta.get("questionTypeCounts"))
    target_types: list[str] = []

    for question_type in QUESTION_TYPE_ORDER:
        amount = question_type_counts.get(question_type, 0)
        if amount <= 0 or (requested_type_set and question_type not in requested_type_set):
            continue
        target_types.extend([question_type] * min(amount, max(0, expected_count - len(target_types))))
        if len(target_types) >= expected_count:
            return target_types

    filler_types = requested_types or QUESTION_TYPE_ORDER
    index = 0
    while len(target_types) < expected_count:
        target_types.append(filler_types[index % len(filler_types)])
        index += 1
    return target_types


def build_target_reference_chapters(meta: dict[str, Any], expected_count: int) -> list[dict[str, Any]]:
    raw_chapters = meta.get("referenceChapters") or []
    chapters = [item for item in raw_chapters if isinstance(item, dict) and normalize_text(item.get("id"))]
    if not chapters:
        chapters = [{"id": normalize_text(item)} for item in meta.get("referenceChapterIds", []) if normalize_text(item)]
    target_types = build_target_question_types(meta, expected_count)
    result: list[dict[str, Any]] = []
    for index, question_type in enumerate(target_types):
        eligible = [chapter for chapter in chapters if not chapter.get("questionTypes") or question_type in chapter["questionTypes"]]
        if eligible:
            result.append(eligible[index % len(eligible)])
        elif chapters:
            raise ValueError(f"No reference chapter contains question type: {question_type}")
    return result


def build_generation_plan(meta: dict[str, Any], expected_count: int) -> list[dict[str, Any]]:
    types = build_target_question_types(meta, expected_count)
    chapters = build_target_reference_chapters(meta, expected_count)
    return [
        {"number": index + 1, "type": question_type, "referenceChapterId": chapters[index]["id"] if index < len(chapters) else ""}
        for index, question_type in enumerate(types)
    ]


def sanitize_generated_question(
    item: Any,
    *,
    number: int,
    meta: dict[str, Any],
    sample_stems: list[str],
    expected_type: str | None = None,
    expected_section: dict[str, str] | None = None,
) -> tuple[dict[str, Any] | None, list[str]]:
    warnings: list[str] = []
    if not isinstance(item, dict):
        return None, [f"第 {number} 道生成结果不是对象，已丢弃。"]

    requested_types = [item for item in meta.get("questionTypes", []) if item in QUESTION_TYPES]
    question_type = expected_type if expected_type in QUESTION_TYPES else choose_question_type(item.get("type"), requested_types)
    if expected_type and item.get("type") != expected_type:
        return None, [f"第 {number} 道生成题题型不符合生成计划，已丢弃，请重新生成。"]
    if expected_section and item.get("referenceChapterId") and item["referenceChapterId"] != expected_section["id"]:
        return None, [f"第 {number} 道生成题章节不符合生成计划，已丢弃，请重新生成。"]
    stem = normalize_text(item.get("stem"))
    analysis = normalize_text(item.get("analysis"))
    answer = sanitize_answer(item.get("answer"))
    options = sanitize_options(item.get("options"))
    difficulty = str(item.get("difficulty") or meta.get("difficulty") or "medium")
    if difficulty not in DIFFICULTIES:
        difficulty = str(meta.get("difficulty") or "medium")

    if question_type == "true_false":
        options = [{"key": "A", "text": "正确"}, {"key": "B", "text": "错误"}]
        answer = [item for item in answer if item in {"A", "B"}][:1]
    elif question_type not in {"single_choice", "multiple_choice"}:
        options = []
        answer = [item for item in answer if item]
    else:
        option_keys = {option["key"] for option in options}
        answer = [item for item in answer if item in option_keys]
        if question_type == "single_choice":
            answer = answer[:1]

    if not stem:
        return None, [f"第 {number} 道生成题题干为空，已丢弃。"]
    if not answer:
        warnings.append(f"第 {number} 题答案为空，请预览确认。")
    if not analysis:
        warnings.append(f"第 {number} 题解析为空，请预览确认。")
    if question_type in {"single_choice", "multiple_choice"} and len(options) != 4:
        warnings.append(f"第 {number} 题选项数量为 {len(options)}，请预览确认。")
    if question_type == "multiple_choice" and len(answer) < 2:
        warnings.append(f"第 {number} 题多选答案少于 2 个，请预览确认。")

    normalized_stem = normalize_for_match(stem)
    for sample_stem in sample_stems:
        normalized_sample = normalize_for_match(sample_stem)
        if len(normalized_stem) >= 18 and normalized_stem == normalized_sample:
            warnings.append(f"第 {number} 题疑似照抄样题，请重点检查。")
            break

    question = {
        "number": number,
        "type": question_type,
        "stem": stem,
        "options": options,
        "answer": answer,
        "analysis": analysis,
        "source": meta.get("sourceLabel") or "AI模拟真题",
        "sourceType": "ai_generated",
        "sourceYear": int(meta.get("year") or time.localtime().tm_year),
        "difficulty": difficulty,
    }
    if expected_section and expected_section.get("id"):
        question["syllabusItemId"] = expected_section["id"]
        question["syllabusItemIds"] = [expected_section["id"]]
        question["referenceChapterTitle"] = expected_section.get("title") or expected_section["id"]

    return (question, warnings)


def build_payload(meta: dict[str, Any], questions: list[dict[str, Any]]) -> dict[str, Any]:
    owner_type = str(meta.get("ownerType") or "major")
    owner_name = str(meta.get("ownerName") or "")
    payload: dict[str, Any] = {
        "title": meta.get("title"),
        "year": int(meta.get("year") or time.localtime().tm_year),
        "paperType": "practice_set",
        "regionName": meta.get("regionName") or "江苏三年制",
        "courseName": meta.get("courseName") or owner_name,
        "chapterTitle": "AI生成题",
        "knowledgePointTitle": "AI模拟真题",
        "questions": questions,
    }
    if owner_type == "public_subject":
        payload["publicSubjectName"] = owner_name
        payload["subjectName"] = owner_name
    else:
        payload["majorName"] = owner_name
        payload["subjectName"] = owner_name.replace("专业", "")
    return payload


def generate_questions(meta: dict[str, Any], task_id: str) -> dict[str, Any]:
    samples = meta.get("samples") if isinstance(meta.get("samples"), list) else []
    sample_stems = [str(sample.get("stem") or "") for sample in samples if isinstance(sample, dict)]
    messages = [
        {"role": "system", "content": build_system_prompt()},
        {"role": "user", "content": build_user_prompt(meta, samples)},
    ]
    write_task_artifact(task_id, "ai_request_messages.json", json.dumps(messages, ensure_ascii=False, indent=2))
    api_base_url = str(meta.get("aiApiBaseUrl") or "")
    api_key = str(meta.get("aiApiKey") or "")
    model = str(meta.get("aiModel") or "")
    content = call_openai_compatible_chat(
        api_base_url,
        api_key,
        model,
        messages,
        response_format=True,
    )
    write_task_artifact(task_id, "ai_response_raw.txt", content)
    parse_warnings: list[str] = []
    try:
        raw = extract_json_object(content)
    except json.JSONDecodeError as exc:
        parse_warnings.append(f"AI 首次返回 JSON 格式不合法，已自动尝试修复：{exc}")
        add_task_event(task_id, "AI 首次返回 JSON 格式不合法，正在请求模型修复 JSON")
        repaired = repair_json_with_ai(
            content=content,
            api_base_url=api_base_url,
            api_key=api_key,
            model=model,
            task_id=task_id,
        )
        raw = extract_json_object(repaired)
    raw_questions = raw.get("questions")
    if not isinstance(raw_questions, list):
        raise ValueError("AI response JSON missing questions array")

    warnings: list[str] = parse_warnings
    questions: list[dict[str, Any]] = []
    expected_count = int(meta.get("count") or 10)
    target_question_types = build_target_question_types(meta, expected_count)
    target_reference_sections = build_target_reference_chapters(meta, expected_count)
    for index, raw_question in enumerate(raw_questions[: expected_count + 5], start=1):
        expected_type = target_question_types[len(questions)] if len(questions) < len(target_question_types) else None
        expected_section = target_reference_sections[len(questions)] if len(questions) < len(target_reference_sections) else None
        question, question_warnings = sanitize_generated_question(
            raw_question,
            number=len(questions) + 1,
            meta=meta,
            sample_stems=sample_stems,
            expected_type=expected_type,
            expected_section=expected_section,
        )
        warnings.extend(question_warnings)
        if question:
            questions.append(question)
        if len(questions) >= expected_count:
            break

    if not questions:
        raise ValueError("AI did not return any usable questions")
    if len(questions) < expected_count:
        warnings.append(f"AI 返回可用题目 {len(questions)} 道，少于请求的 {expected_count} 道。")

    payload = build_payload(meta, questions)
    stats = Counter(question["type"] for question in questions)
    return {
        "payload": payload,
        "stats": dict(stats),
        "warnings": warnings,
        "debug": {
            "requestId": task_id,
            "model": meta.get("aiModel"),
            "sampleCount": len(samples),
            "generatedCount": len(questions),
            "referenceChapters": meta.get("referenceChapters") or [],
            "questionTypeCounts": meta.get("questionTypeCounts") or {},
            "promptPaths": {
                "system": str(SYSTEM_PROMPT_PATH),
                "user": str(USER_PROMPT_PATH),
            },
            "artifacts": {
                "requestMessages": str(TASK_DIR / task_id / "ai_request_messages.json"),
                "rawResponse": str(TASK_DIR / task_id / "ai_response_raw.txt"),
                "repairedResponse": str(TASK_DIR / task_id / "ai_response_repaired.txt"),
            },
        },
    }


def run_generation_task(task_id: str, meta: dict[str, Any]) -> None:
    started_at = time.time()
    logger.info("[%s] AI question generation started: %s", task_id, {key: meta.get(key) for key in ("title", "ownerName", "count", "questionTypes")})
    try:
        set_task(task_id, status="running", stage="prompt", progress=12, message="正在整理样题和提示词")
        add_task_event(task_id, f"已读取 {len(meta.get('samples') or [])} 道样题")
        set_task(task_id, status="running", stage="ai_generation", progress=35, message="正在调用 AI 生成题目")
        add_task_event(task_id, "开始调用 AI 生题服务")
        result = generate_questions(meta, task_id)
        set_task(task_id, status="running", stage="validation", progress=88, message="正在校验生成结果")
        add_task_event(task_id, "AI 结果已返回，正在校验题型、答案和解析")
        set_task(
            task_id,
            status="succeeded",
            stage="done",
            progress=100,
            message="AI 生题完成",
            payload=result["payload"],
            stats=result["stats"],
            warnings=result["warnings"],
            debug=result["debug"],
            finishedAt=time.time(),
        )
        add_task_event(task_id, f"AI 生题完成：{result['debug']['generatedCount']} 题，耗时 {time.time() - started_at:.2f}s")
        logger.info("[%s] AI question generation finished in %.2fs", task_id, time.time() - started_at)
    except Exception as exc:
        logger.exception("[%s] AI question generation failed", task_id)
        set_task(
            task_id,
            status="failed",
            stage="failed",
            progress=100,
            message="AI 生题失败",
            error=str(exc),
            finishedAt=time.time(),
        )
        add_task_event(task_id, f"AI 生题失败：{exc}")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/generate-question-bank-tasks")
async def create_generation_task(request: Request, background_tasks: BackgroundTasks) -> JSONResponse:
    body = await request.json()
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Request body must be a JSON object")

    samples = body.get("samples")
    if not isinstance(samples, list) or len(samples) < 3:
        raise HTTPException(status_code=400, detail="At least 3 sample questions are required")

    ai_api_base_url = normalize_text(body.get("aiApiBaseUrl"))
    ai_model = normalize_text(body.get("aiModel"))
    if not ai_api_base_url or not ai_model:
        raise HTTPException(status_code=400, detail="aiApiBaseUrl and aiModel are required")

    question_types = body.get("questionTypes") if isinstance(body.get("questionTypes"), list) else []
    question_types = [str(item) for item in question_types if str(item) in QUESTION_TYPES]
    count = max(1, min(50, int(body.get("count") or 10)))
    question_type_counts = parse_question_type_counts(body.get("questionTypeCounts"))
    if sum(question_type_counts.values()) > count:
        raise HTTPException(status_code=400, detail="questionTypeCounts total must not exceed count")
    question_types = list(dict.fromkeys([*question_types, *question_type_counts.keys()]))
    if not question_types:
        question_types = list(dict.fromkeys(sample.get("type") for sample in samples if isinstance(sample, dict) and sample.get("type") in QUESTION_TYPES))
    if not question_types:
        raise HTTPException(status_code=400, detail="No supported question types in reference samples")
    difficulty = str(body.get("difficulty") or "medium")
    if difficulty not in DIFFICULTIES:
        difficulty = "medium"

    task_id = uuid.uuid4().hex[:12]
    created_at = time.time()
    meta = {
        "ownerType": body.get("ownerType") or "major",
        "ownerId": body.get("ownerId") or "",
        "ownerName": normalize_text(body.get("ownerName")),
        "regionId": body.get("regionId") or "",
        "regionName": normalize_text(body.get("regionName")) or "江苏三年制",
        "courseName": normalize_text(body.get("courseName")),
        "title": normalize_text(body.get("title")) or f"AI生成题库-{time.strftime('%Y-%m-%d')}",
        "year": int(body.get("year") or time.localtime().tm_year),
        "count": count,
        "questionTypes": question_types,
        "questionTypeCounts": question_type_counts,
        "difficulty": difficulty,
        "sourceLabel": normalize_text(body.get("sourceLabel")) or "AI模拟真题",
        "referenceChapterIds": body.get("referenceChapterIds") if isinstance(body.get("referenceChapterIds"), list) else body.get("referenceSectionIds", []),
        "referenceChapters": body.get("referenceChapters") if isinstance(body.get("referenceChapters"), list) else body.get("referenceSections", []),
        "aiApiBaseUrl": ai_api_base_url,
        "aiApiKey": str(body.get("aiApiKey") or ""),
        "aiModel": ai_model,
        "samples": samples[:MAX_SAMPLE_QUESTIONS],
    }
    remember_task(
        task_id,
        {
            "taskId": task_id,
            "status": "queued",
            "stage": "queued",
            "progress": 2,
            "message": "任务已创建，等待 AI 生题",
            "title": meta["title"],
            "year": meta["year"],
            "ownerName": meta["ownerName"],
            "createdAt": created_at,
            "updatedAt": created_at,
            "events": [{"time": created_at, "message": "AI 生题任务已创建"}],
            "warnings": [],
            "stats": {},
            "debug": {
                "sampleCount": len(meta["samples"]),
                "model": ai_model,
            },
        },
    )
    background_tasks.add_task(run_generation_task, task_id, meta)
    logger.info("[%s] AI question generation queued: title=%s owner=%s", task_id, meta["title"], meta["ownerName"])
    return JSONResponse(public_task(TASKS[task_id], include_payload=False))


@app.get("/generate-question-bank-tasks/{task_id}")
def get_generation_task(task_id: str) -> JSONResponse:
    with TASK_LOCK:
        task = TASKS.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        response = public_task(task, include_payload=True)
    return JSONResponse(response)


@app.get("/generate-question-bank-tasks")
def list_generation_tasks() -> JSONResponse:
    with TASK_LOCK:
        tasks = sorted(TASKS.values(), key=lambda item: item.get("createdAt", 0), reverse=True)
        response = [public_task(task, include_payload=False) for task in tasks[:30]]
    return JSONResponse({"tasks": response})


if __name__ == "__main__":
    print(json.dumps({"service": "Vibe Learning AI Question Generator", "status": "ready"}, ensure_ascii=False))
