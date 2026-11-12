"""English V1 upload tasks and conversion to the question-bank import payload."""

import logging
import re
import shutil
import time
from concurrent.futures import ThreadPoolExecutor
from html import escape
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Lock
from uuid import uuid4

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile


logger = logging.getLogger(__name__)
SECTION_LABELS = {
    "reading": "阅读理解",
    "cloze": "完形填空",
    "judgment": "阅读理解（判断）",
    "translation_choice": "翻译选择",
    "word_selection": "选词填空",
    "translation": "英汉互译",
    "correction": "短文改错",
    "writing": "写作",
}


def paragraphs(text):
    return "".join(f"<p>{escape(line)}</p>" for line in text.splitlines() if line.strip())


def make_question(section, kind, score, number, stem, item, analysis="", context=""):
    heading = f"<p><strong>{SECTION_LABELS[section]}</strong></p>"
    answer = item.get("answer")
    return {
        "number": number, "type": kind, "englishSection": section, "score": score,
        "stem": heading + paragraphs(context) + paragraphs(stem) if context.strip() or stem.strip() else "",
        "options": [{"key": key, "text": escape(text)} for key, text in item.get("options", {}).items()],
        "answer": [paragraphs(answer) if kind in {"short_answer", "question_answer", "writing"} else answer] if answer else [],
        "analysis": paragraphs(analysis),
    }


def translation_stems(section):
    return {int(number): text for number, text in re.findall(r"^(\d+)\. (.+)$", section["stem"], re.M)}


def import_questions(reading, cloze, judgment, translations, corrections, writing_stem, writing_answer):
    questions, warnings = [], []
    for group in reading:
        for item in group["questions"]:
            questions.append(make_question("reading", "single_choice", 2, item["number"], item["prompt"], item, context=group["stem"]))
    for item in cloze["questions"]:
        number = item["number"]
        questions.append(make_question("cloze", "single_choice", 1, number, f"第 {number} 空", item, context=cloze["stem"]))
    for item in judgment["questions"]:
        questions.append(make_question("judgment", "true_false", 2, item["number"], item["prompt"], item, context=judgment["stem"]))

    for group, section, kind in zip(translations, ("translation_choice", "word_selection", "translation"),
                                    ("single_choice", "single_choice", "short_answer")):
        warnings.extend(group.get("warnings", []))
        stems = translation_stems(group) if section != "word_selection" else {}
        for item in group["questions"]:
            number = item["number"]
            context = group["stem"] if section == "word_selection" else ""
            stem = (f"第 {number} 空" if context.strip() else "") if section == "word_selection" else stems.get(number, "")
            questions.append(make_question(section, kind, 2 if section == "translation_choice" else 3, number, stem, item, context=context))

    for group in corrections:
        number = group["number"]
        item = group["questions"][0] if group["questions"] else {}
        if group["stemIssue"] or item.get("answerIssue"):
            warnings.append(f"第 {number} 题请对照原卷或答案 PDF 核对改错标记和参考答案。")
        letter, replacement = item.get("answer"), item.get("correction")
        answer = f"{letter}. {replacement}" if letter and replacement else ""
        questions.append(make_question("correction", "question_answer", 2, number, group["stem"], {"answer": answer}, item.get("explanation", "")))

    numbers = [question["number"] for question in questions]
    if not numbers or numbers != list(range(1, len(numbers) + 1)):
        raise ValueError("原卷题号不连续，请检查是否上传了英语 V1 对应版式的完整试卷。")
    questions.append(make_question("writing", "writing", 20, numbers[-1] + 1, writing_stem, {"answer": writing_answer}))
    return questions, warnings


def import_task_router(parse_paper, require_host):
    router = APIRouter()
    lock = Lock()
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="english-v1-import")
    tasks = {}

    def update(task_id, status, stage, progress, message, **extra):
        with lock:
            task = tasks[task_id]
            task.update(status=status, stage=stage, progress=progress, message=message, **extra)
            task["events"].append({"time": time.time(), "message": message})
            finished = [key for key, value in tasks.items() if value["status"] in {"succeeded", "failed"}]
            for key in finished[:-30]:
                del tasks[key]

    def run(task_id, upload_dir, answer_uploaded, meta):
        try:
            with upload_dir as path:
                directory = Path(path)
                result = parse_paper(directory / "question.pdf", directory / "answer.pdf" if answer_uploaded else None,
                                     meta, lambda *stage: update(task_id, "running", *stage))
            update(task_id, "succeeded", "finished", 100, "英语 V1 解析完成", finishedAt=time.time(), **result)
        except ValueError as error:
            update(task_id, "failed", "failed", 100, "英语 V1 解析失败", finishedAt=time.time(), error=str(error))
        except Exception:
            logger.exception("English V1 parse task %s failed", task_id)
            update(task_id, "failed", "failed", 100, "英语 V1 解析失败", finishedAt=time.time(),
                   error="无法读取试卷 PDF 或完成识别，请核对文件后重试。")

    @router.post("/parse-question-paper-tasks", status_code=202)
    def create_task(request: Request, question_pdf: UploadFile = File(...), answer_pdf: UploadFile | None = File(None),
                    title: str = Form(...), year: int = Form(...), region_name: str = Form(...),
                    owner_name: str = Form(...), owner_type: str = Form(...), course_name: str = Form("")):
        require_host(request)
        if not all(value.strip() for value in (title, region_name, owner_name)) or owner_type not in {"public_subject", "major"}:
            raise HTTPException(400, "请填写题库名称、区域和科目或专业。")
        meta = {"title": title, "year": year, "regionName": region_name, "courseName": course_name or owner_name}
        meta["publicSubjectName" if owner_type == "public_subject" else "majorName"] = owner_name
        upload_dir = TemporaryDirectory(prefix="vibe-english-v1-")
        task_id = uuid4().hex[:12]
        task = {"taskId": task_id, "status": "queued", "stage": "queued", "progress": 2,
                "message": "等待英语 V1 解析", "createdAt": time.time(), "events": []}
        try:
            for upload, name in ((question_pdf, "question.pdf"), (answer_pdf, "answer.pdf")):
                if upload is None:
                    continue
                if b"%PDF-" not in upload.file.read(1024):
                    raise HTTPException(400, "请上传有效的 PDF 文件。")
                upload.file.seek(0)
                with (Path(upload_dir.name) / name).open("wb") as target:
                    shutil.copyfileobj(upload.file, target)
            with lock:
                tasks[task_id] = task.copy()
            executor.submit(run, task_id, upload_dir, answer_pdf is not None, meta)
        except Exception:
            upload_dir.cleanup()
            with lock:
                tasks.pop(task_id, None)
            raise
        return task

    @router.get("/parse-question-paper-tasks/{task_id}")
    def get_task(request: Request, task_id: str):
        require_host(request)
        with lock:
            task = tasks.get(task_id)
            if task is None:
                raise HTTPException(404, "解析任务已过期，请重新上传。")
            return {**task, "events": list(task["events"]),
                    "elapsedSeconds": int((task.get("finishedAt") or time.time()) - task["createdAt"])}

    return router
