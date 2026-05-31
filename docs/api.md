# Vibe Learning API 文档

> 本文档是项目接口变更的同步记录。后续只要新增、修改或删除 API，都需要在同一轮修改里同步更新本文档。

## 通用返回格式

### 成功

```json
{
  "ok": true,
  "data": {}
}
```

### 失败

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error message."
  }
}
```

## 认证

当前登录态通过 HTTP-only Cookie `vl_session` 保存。

### POST `/api/auth/register`

学生注册接口。当前服务于页面表单提交，返回 `303` 跳转，不使用通用 JSON 返回格式。

Content-Type：`application/x-www-form-urlencoded`

请求字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `username` | string | 是 | 用户名，至少 3 个字符 |
| `password` | string | 是 | 密码，至少 6 个字符 |

成功：

- 创建 `student` 用户。
- 设置 HTTP-only Cookie `vl_session`。
- `303` 跳转到 `/learn`。

失败：

| 场景 | 返回 |
| --- | --- |
| 用户名或密码长度不合法 | `303` 跳转到 `/register?error=Username%20must%20be%203%2B%20chars%20and%20password%206%2B%20chars` |
| 用户名已存在 | `303` 跳转到 `/register?error=Username%20already%20exists` |

### POST `/api/auth/login`

登录接口。当前服务于页面表单提交，返回 `303` 跳转，不使用通用 JSON 返回格式。

Content-Type：`application/x-www-form-urlencoded`

请求字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `username` | string | 是 | 用户名 |
| `password` | string | 是 | 密码 |

成功：

- 更新 `lastLoginAt`。
- 设置 HTTP-only Cookie `vl_session`。
- 管理员跳转 `/admin`。
- 学生跳转 `/learn`。

失败：

| 场景 | 返回 |
| --- | --- |
| 用户名或密码错误 | `303` 跳转到 `/login?error=Invalid%20username%20or%20password` |

### POST `/api/auth/logout`

退出登录接口。当前服务于页面表单提交，返回 `303` 跳转，不使用通用 JSON 返回格式。

成功：

- 清除 `vl_session`。
- `303` 跳转到 `/login`。

## Foundation 基础配置

### GET `/api/foundation/options`

获取学生基础选择所需的区域、公共课、专业选项。

Query 参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `regionId` | string | 否 | 指定区域 ID；不传时默认使用排序最靠前的启用区域 |

成功返回：

```json
{
  "ok": true,
  "data": {
    "regions": [
      {
        "id": "region_id",
        "name": "江苏三年制",
        "province": "江苏",
        "studySystem": "三年制",
        "description": null
      }
    ],
    "selectedRegionId": "region_id",
    "publicSubjects": [
      {
        "id": "public_subject_id",
        "name": "高等数学",
        "code": null,
        "description": null
      }
    ],
    "majors": [
      {
        "id": "major_id",
        "name": "计算机专业",
        "description": null
      }
    ]
  }
}
```

错误返回：

| HTTP 状态 | code | 说明 |
| --- | --- | --- |
| 400 | `FOUNDATION_REGION_UNAVAILABLE` | 传入的 `regionId` 不存在或区域未启用 |

规则：

- 只返回 `active` 区域。
- 公共课和专业只返回所选区域下 `published` 状态的数据。
- 如果显式传入 `regionId`，该区域必须存在且状态为 `active`。

## Student 学生画像

### GET `/api/student/profile`

获取当前登录学生的基础选择画像。

认证：需要登录。

未登录返回：

```json
{
  "ok": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required."
  }
}
```

成功返回：

```json
{
  "ok": true,
  "data": {
    "profile": {
      "id": "profile_id",
      "userId": "user_id",
      "regionId": "region_id",
      "publicSubjectId": "public_subject_id",
      "majorId": "major_id",
      "region": {},
      "publicSubject": {},
      "major": {},
      "createdAt": "2026-05-18T00:00:00.000Z",
      "updatedAt": "2026-05-18T00:00:00.000Z"
    },
    "completed": true,
    "missingFields": []
  }
}
```

说明：

- `profile` 可能为 `null`。
- `completed` 表示 `regionId / publicSubjectId / majorId` 是否都已选择。
- `missingFields` 返回尚未完成选择的字段名，可能包含 `regionId`、`publicSubjectId`、`majorId`。

### POST `/api/student/profile`

保存当前登录学生的基础选择画像。

认证：需要登录。

请求体：

```json
{
  "regionId": "region_id",
  "publicSubjectId": "public_subject_id",
  "majorId": "major_id"
}
```

成功返回：

```json
{
  "ok": true,
  "data": {
    "profile": {
      "id": "profile_id",
      "userId": "user_id",
      "regionId": "region_id",
      "publicSubjectId": "public_subject_id",
      "majorId": "major_id",
      "region": {},
      "publicSubject": {},
      "major": {},
      "createdAt": "2026-05-18T00:00:00.000Z",
      "updatedAt": "2026-05-18T00:00:00.000Z"
    },
    "completed": true,
    "missingFields": []
  }
}
```

错误返回：

| HTTP 状态 | code | 说明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登录 |
| 400 | `INVALID_PROFILE_SELECTION` | 请求体缺少必要字段或字段为空 |
| 400 | `FOUNDATION_SELECTION_UNAVAILABLE` | 区域不可用，或公共课/专业不属于该区域，或未发布 |

校验规则：

- `regionId` 必须存在且区域状态为 `active`。
- `publicSubjectId` 必须属于所选区域且状态为 `published`。
- `majorId` 必须属于所选区域且状态为 `published`。

## Progress 学习进度

### GET `/api/learning/entry`

获取当前登录学生是否可以进入学习流程。当前主要用于判断基础画像是否完整，为后续 onboarding/强制选择流程提供后端依据。

认证：需要登录。

成功返回：

```json
{
  "ok": true,
  "data": {
    "canStartLearning": false,
    "foundationProfile": {
      "completed": false,
      "missingFields": ["regionId", "publicSubjectId", "majorId"]
    }
  }
}
```

错误返回：

| HTTP 状态 | code | 说明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登录 |

### GET `/api/learning/courses`

根据当前登录学生的基础画像，返回可用学习课程列表。

认证：需要登录。

成功返回：

```json
{
  "ok": true,
  "data": {
    "courses": [
      {
        "id": "course_id",
        "name": "高等数学",
        "courseType": "public_subject",
        "description": null,
        "sortOrder": 0,
        "region": {
          "id": "region_id",
          "name": "江苏三年制"
        },
        "publicSubject": {
          "id": "public_subject_id",
          "name": "高等数学"
        },
        "major": null,
        "_count": {
          "chapters": 0,
          "syllabusItems": 0,
          "examPapers": 0
        }
      }
    ]
  }
}
```

错误返回：

| HTTP 状态 | code | 说明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登录 |

规则：

- 只返回 `published` 课程。
- 公共课课程必须匹配学生画像里的 `regionId + publicSubjectId`。
- 专业课课程必须匹配学生画像里的 `regionId + majorId`。

### GET `/api/learning/path`

获取当前登录学生的闯关路径。路径数据来源于新的大纲体系：`LearningCourse` 表示课程，`SyllabusItem` 的一级节点表示章，二级节点表示节，题目数量通过 `QuestionKnowledgeTag` 统计。

认证：需要登录。

Query 参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `courseType` | string | 否 | `public_subject` 或 `major`；不传时默认优先返回专业课 |
| `course` | string | 否 | `courseType` 的兼容别名 |

成功返回：

```json
{
  "ok": true,
  "data": {
    "completed": true,
    "groups": [
      {
        "key": "major",
        "name": "计算机专业",
        "ownerId": "major_id",
        "sectionIds": ["section_id"],
        "courses": [
          {
            "id": "course_id",
            "title": "计算机应用基础",
            "courseType": "major",
            "description": null,
            "sortOrder": 0,
            "chapters": [
              {
                "id": "chapter_syllabus_item_id",
                "title": "计算机硬件",
                "description": null,
                "sortOrder": 1,
                "passedCount": 0,
                "sections": [
                  {
                    "id": "section_syllabus_item_id",
                    "title": "计算机基本原理",
                    "description": null,
                    "sortOrder": 1,
                    "questionCount": 11,
                    "status": "unlocked",
                    "bestScore": 0,
                    "passedAt": null
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    "selectedGroup": {}
  }
}
```

错误返回：

| HTTP 状态 | code | 说明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登录 |

规则：

- 学生未完成省份、公共课、专业课选择时，`completed` 为 `false`，路径为空。
- 只返回当前学生画像匹配的 `published` 课程和 `published` 大纲项。
- 只展示有已发布题目的节；题目数量按 `question_knowledge_tags` 去重统计。
- 进度写入 `user_syllabus_progress`，第一节默认解锁，通过一节后解锁下一节。

### GET `/api/learning/sections/{sectionId}/questions`

获取当前登录学生可访问的某个节下的已发布题目。该接口不返回答案和解析。

认证：需要登录。

成功返回：

```json
{
  "ok": true,
  "data": {
    "course": {
      "id": "course_id",
      "title": "计算机应用基础",
      "courseType": "major"
    },
    "chapter": {
      "id": "chapter_syllabus_item_id",
      "title": "计算机硬件"
    },
    "section": {
      "id": "section_syllabus_item_id",
      "title": "计算机基本原理",
      "questionCount": 11,
      "status": "unlocked"
    },
    "questions": [
      {
        "id": "question_id",
        "type": "single_choice",
        "stem": "题干",
        "options": [
          {
            "key": "A",
            "text": "选项 A"
          }
        ],
        "source": "2024年江苏专转本《计算机理论》",
        "sourceType": "ai_generated",
        "sourceYear": 2024,
        "difficulty": "medium"
      }
    ]
  }
}
```

错误返回：

| HTTP 状态 | code | 说明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登录 |
| 404 | `SYLLABUS_SECTION_NOT_FOUND` | 节不存在、未发布、不属于当前学生画像或尚未解锁 |

### GET `/api/learning/courses/{courseId}`

获取当前登录学生可访问的单个课程详情。

认证：需要登录。

成功返回：

```json
{
  "ok": true,
  "data": {
    "course": {
      "id": "course_id",
      "name": "高等数学",
      "courseType": "public_subject",
      "description": null,
      "status": "published",
      "sortOrder": 0,
      "region": {
        "id": "region_id",
        "name": "江苏三年制"
      },
      "publicSubject": {
        "id": "public_subject_id",
        "name": "高等数学"
      },
      "major": null
    }
  }
}
```

错误返回：

| HTTP 状态 | code | 说明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登录 |
| 404 | `LEARNING_COURSE_NOT_FOUND` | 课程不存在、未发布或不属于当前学生画像 |

### GET `/api/learning/courses/{courseId}/outline`

获取当前登录学生可访问课程的目录概览，包括章节、知识点、大纲条目、试卷概览。

认证：需要登录。

成功返回：

```json
{
  "ok": true,
  "data": {
    "course": {},
    "chapters": [
      {
        "id": "chapter_id",
        "title": "函数",
        "sortOrder": 1,
        "points": [
          {
            "id": "point_id",
            "title": "函数概念",
            "summary": "知识点摘要",
            "estimatedMinutes": 8,
            "sortOrder": 1,
            "syllabusItemId": "syllabus_item_id",
            "_count": {
              "questions": 10
            }
          }
        ]
      }
    ],
    "syllabusItems": [
      {
        "id": "syllabus_item_id",
        "parentId": null,
        "code": "1.1",
        "title": "函数",
        "description": null,
        "requirement": "master",
        "sortOrder": 1
      }
    ],
    "examPapers": [
      {
        "id": "paper_id",
        "title": "2025 江苏专转本高数真题",
        "year": 2025,
        "paperType": "real_exam",
        "description": null,
        "sortOrder": 1,
        "_count": {
          "questions": 20
        }
      }
    ]
  }
}
```

错误返回：

| HTTP 状态 | code | 说明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登录 |
| 404 | `LEARNING_COURSE_NOT_FOUND` | 课程不存在、未发布或不属于当前学生画像 |

### GET `/api/learning/knowledge-points/{pointId}`

获取当前登录学生可访问的知识点详情。

认证：需要登录。

成功返回：

```json
{
  "ok": true,
  "data": {
    "point": {
      "id": "point_id",
      "title": "函数概念",
      "summary": "摘要",
      "content": "正文",
      "estimatedMinutes": 8,
      "sortOrder": 1,
      "syllabusItem": {
        "id": "syllabus_item_id",
        "code": "1.1",
        "title": "函数",
        "requirement": "master"
      },
      "chapter": {
        "id": "chapter_id",
        "title": "函数",
        "sortOrder": 1,
        "course": {
          "id": "course_id",
          "name": "高等数学",
          "courseType": "public_subject"
        }
      },
      "_count": {
        "questions": 10
      }
    }
  }
}
```

错误返回：

| HTTP 状态 | code | 说明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登录 |
| 404 | `LEARNING_POINT_NOT_FOUND` | 知识点不存在、未发布或不属于当前学生画像 |

### GET `/api/learning/knowledge-points/{pointId}/questions`

获取当前登录学生可访问知识点下的已发布题目。该接口不返回答案和解析。

认证：需要登录。

成功返回：

```json
{
  "ok": true,
  "data": {
    "point": {},
    "questions": [
      {
        "id": "question_id",
        "type": "single_choice",
        "stem": "题干",
        "options": [
          {
            "key": "A",
            "text": "选项 A"
          }
        ],
        "source": "2025 江苏专转本高数真题",
        "sourceType": "real_exam",
        "sourceYear": 2025,
        "difficulty": "medium",
        "syllabusItem": {
          "id": "syllabus_item_id",
          "code": "1.1",
          "title": "函数"
        }
      }
    ]
  }
}
```

错误返回：

| HTTP 状态 | code | 说明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登录 |
| 404 | `LEARNING_POINT_NOT_FOUND` | 知识点不存在、未发布或不属于当前学生画像 |

### POST `/api/progress/submit`

提交某个节的答题结果，记录答题尝试、错题本、学习统计，并在通过时解锁下一个节。

认证：需要登录。

请求体：

```json
{
  "sectionId": "section_syllabus_item_id",
  "answers": {
    "question_id_1": ["A"],
    "question_id_2": ["A", "C"]
  }
}
```

成功返回：

```json
{
  "ok": true,
  "data": {
    "score": 80,
    "passed": true,
    "correct": 4,
    "total": 5,
    "wrongAttemptIds": ["attempt_id"],
    "resultPath": "/learn/section_syllabus_item_id/result?attemptIds=attempt_id&score=80&correct=4&total=5&submittedAt=2026-05-18T00%3A00%3A00.000Z"
  }
}
```

错误返回：

| HTTP 状态 | code | 说明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登录 |
| 400 | `INVALID_PROGRESS_SUBMISSION` | 请求体缺少 `sectionId` 或 `answers` |
| 403 | `SYLLABUS_SECTION_LOCKED` | 节未解锁、不可访问或未发布 |

规则：

- 答题正确率达到 `80%` 时视为通过。
- 未通过的题目会写入或更新错题本。
- 通过后会尝试解锁同一课程组里的下一个节。

## AI 讲解

### POST `/api/ai/explain`

对学生自己的错题生成 AI 讲解，并记录对话。

认证：需要登录。

请求体：

```json
{
  "questionId": "question_id",
  "prompt": "请再解释一下为什么选 A"
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `questionId` | string | 是 | 要讲解的题目 ID |
| `prompt` | string | 否 | 学生追问；不传时使用默认讲解提示 |

成功返回：

```json
{
  "ok": true,
  "data": {
    "answer": "AI 讲解内容"
  }
}
```

错误返回：

| HTTP 状态 | code | 说明 |
| --- | --- | --- |
| 401 | `UNAUTHORIZED` | 未登录 |
| 400 | `MISSING_QUESTION_ID` | 缺少题目 ID |
| 403 | `QUESTION_EXPLANATION_FORBIDDEN` | 只能讲解当前学生自己的错题 |
| 404 | `QUESTION_NOT_FOUND` | 题目不存在或未发布 |
| 503 | `AI_SERVICE_UNAVAILABLE` | Qwen/AI 服务调用失败 |

规则：

- 只允许讲解当前登录学生自己的错题。
- 问题必须存在且状态为 `published`。
