# Vibe Learning PDF Parser Service

This service receives a question PDF and an answer PDF, extracts questions and answers, optionally asks an OpenAI-compatible model to review the parsed result, and returns the JSON payload consumed by the admin question-bank importer.

## API

`GET /health`

`POST /parse-question-paper`

Synchronous parsing endpoint kept for quick tests.

`POST /parse-question-paper-tasks`

Creates an async parsing task and immediately returns:

```json
{
  "taskId": "abc123",
  "status": "queued",
  "progress": 2,
  "message": "task queued"
}
```

`GET /parse-question-paper-tasks/{taskId}`

Returns task progress, parser events, warnings, and the final payload when `status` is `succeeded`.

`GET /parse-question-paper-tasks`

Returns recent task history kept in memory by the parser process.

Multipart fields:

- `question_pdf`: question paper PDF
- `answer_pdf`: answer/explanation PDF
- `title`: exam paper title
- `year`: exam year
- `region_name`: region display name
- `owner_name`: major/public-subject display name
- `owner_type`: `major` or `public_subject`
- `course_name`: usually same as `owner_name`
- `ai_api_base_url`: OpenAI-compatible base URL, for example `http://10.138.12.88:30001/v1`
- `ai_model`: model name, for example `qwen3.5-35B-A3B`
- `ai_api_key`: optional API key

## AI Review

The AI review runs after OCR and rule parsing. It is intentionally conservative:

- fixes obvious OCR typos and line breaks
- checks question type
- checks answer and option consistency
- checks whether answer and analysis conclusion conflict
- adds warnings when it is unsure

Environment switches:

```bash
export VIBE_AI_REVIEW_ENABLED=true
export VIBE_AI_REVIEW_CHUNK_SIZE=12
export VIBE_AI_REVIEW_TIMEOUT=90
export VIBE_AI_REVIEW_MIN_CONFIDENCE=0.74
export VIBE_AI_PROMPT_DIR=/opt/vibe_pdf_parser/prompts
```

Set `VIBE_AI_REVIEW_ENABLED=false` to disable AI review without changing Web code.

AI prompts are loaded from text files so they can be adjusted without editing `app.py`:

```text
prompts/ai_review_system_prompt.txt
prompts/ai_review_user_prompt.txt
```

The user prompt should keep the `{{QUESTIONS_JSON}}` placeholder. The parser replaces it with the current batch of parsed questions. It also replaces `{{MIN_CONFIDENCE}}` with `VIBE_AI_REVIEW_MIN_CONFIDENCE`.

You can override the default file paths:

```bash
export VIBE_AI_REVIEW_SYSTEM_PROMPT_PATH=/opt/vibe_pdf_parser/prompts/ai_review_system_prompt.txt
export VIBE_AI_REVIEW_USER_PROMPT_PATH=/opt/vibe_pdf_parser/prompts/ai_review_user_prompt.txt
```

## Run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

## Logs

When running under systemd:

```bash
journalctl -u vibe-pdf-parser -f
journalctl -u vibe-pdf-parser -n 200
```
