from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import app


EXPECTED: dict[str, dict[str, Any]] = {
    "bf160a9346a9": {
        "questions": 52,
        "answers": 52,
        "stats": {"single_choice": 15, "multiple_choice": 10, "true_false": 15, "comprehensive": 12},
    },
    "cf65848d8659": {
        "questions": 25,
        "answers": 25,
        "stats": {"single_choice": 8, "fill_blank": 6, "comprehensive": 11},
    },
    "4915e0254849": {
        "questions": 30,
        "answers": 30,
        "stats": {"single_choice": 21, "comprehensive": 9},
    },
    "a45623d40997": {
        "questions": 42,
        "answers": 42,
        "stats": {"single_choice": 15, "multiple_choice": 10, "true_false": 10, "comprehensive": 7},
    },
}


def pdf_pair(task_dir: Path) -> tuple[Path, Path]:
    pdfs = sorted(task_dir.glob("*.pdf"))
    answer = next((path for path in pdfs if "答案" in path.name), None)
    question = next((path for path in pdfs if path != answer), None)
    if not question or not answer:
        raise FileNotFoundError(f"Question/answer PDF pair not found in {task_dir}")
    return question, answer


def run_case(task_dir: Path) -> dict[str, Any]:
    question_path, answer_path = pdf_pair(task_dir)
    result = app.parse_question_files(
        question_path=question_path,
        answer_path=answer_path,
        title=question_path.stem,
        year=2026,
        region_name="江苏三年制",
        owner_name="回归测试",
        owner_type="major",
        course_name="回归测试",
        request_id=f"regression-{task_dir.name}",
    )
    debug = result["debug"]
    return {
        "taskId": task_dir.name,
        "questionCount": debug["questionCount"],
        "answerCount": debug["answerCount"],
        "answeredQuestionCount": debug["answeredQuestionCount"],
        "stats": result["stats"],
        "questionMethod": debug["questionExtraction"]["method"],
        "answerMethod": debug["answerExtraction"]["method"],
        "qualityGate": debug["qualityGate"],
        "warningCount": len(result["warnings"]),
        "warnings": result["warnings"],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("task_root", type=Path)
    parser.add_argument("--task-id", action="append", dest="task_ids")
    args = parser.parse_args()
    task_ids = args.task_ids or list(EXPECTED)
    reports: list[dict[str, Any]] = []
    failed = False
    for task_id in task_ids:
        report = run_case(args.task_root / task_id)
        expected = EXPECTED.get(task_id)
        if expected:
            report["expected"] = expected
            report["passed"] = (
                report["questionCount"] == expected["questions"]
                and report["answeredQuestionCount"] == expected["answers"]
                and report["stats"] == expected["stats"]
            )
            failed = failed or not report["passed"]
        reports.append(report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
