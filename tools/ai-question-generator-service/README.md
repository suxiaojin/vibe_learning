# Vibe Learning AI Question Generator Service

This service is intentionally separate from the PDF parser service. It receives sample questions from the 71 Next.js backend, calls the internal OpenAI-compatible Qwen/VLLM API, and returns an editable question-bank payload.

## API

`GET /health`

`POST /generate-question-bank-tasks`

Creates an async AI generation task and immediately returns task metadata.

Request body:

```json
{
  "ownerType": "major",
  "ownerId": "xxx",
  "ownerName": "计算机专业",
  "regionId": "xxx",
  "regionName": "江苏三年制",
  "courseName": "计算机专业",
  "title": "AI生成题库-计算机专业-2026-05-23",
  "year": 2026,
  "count": 10,
  "referencePapers": [{"id": "paper_id_1", "title": "2024年真题"}],
  "questionTypes": ["single_choice", "multiple_choice"],
  "difficulty": "medium",
  "sourceLabel": "AI模拟真题",
  "aiApiBaseUrl": "http://10.138.12.88:30001/v1",
  "aiApiKey": "",
  "aiModel": "qwen3.5-35B-A3B",
  "samples": []
}
```

`GET /generate-question-bank-tasks/{taskId}`

Returns task progress, events, warnings, and the final payload when `status` is `succeeded`.

`GET /generate-question-bank-tasks`

Returns recent task history kept in memory by this process.

## Environment

```bash
export VIBE_AI_QUESTION_TASK_DIR=/data/vibe_ai_question_generator_tasks
export VIBE_AI_QUESTION_TASK_LIMIT=80
export VIBE_AI_QUESTION_TIMEOUT=120
export VIBE_AI_QUESTION_SAMPLE_LIMIT=50
export VIBE_AI_QUESTION_PROMPT_DIR=/opt/vibe_ai_question_generator/prompts
```

## Prompts

Prompts are loaded from text files so they can be adjusted without editing `app.py`:

```text
prompts/system_prompt.txt
prompts/user_prompt.txt
```

The user prompt should keep these placeholders:

```text
{{REQUEST_JSON}}
{{SAMPLES_JSON}}
```

You can override the default file paths:

```bash
export VIBE_AI_QUESTION_SYSTEM_PROMPT_PATH=/opt/vibe_ai_question_generator/prompts/system_prompt.txt
export VIBE_AI_QUESTION_USER_PROMPT_PATH=/opt/vibe_ai_question_generator/prompts/user_prompt.txt
```

## Run

Recommended port is `8001` so this service does not share the PDF parser interface.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8001
```

The 71 Next.js app should point to this service with:

```bash
QUESTION_AI_GENERATOR_URL=http://172.18.255.14:8001
```
