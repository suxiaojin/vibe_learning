# 2026-05-18 Vibe Learning Backend Handoff

## 1. 最初要解决的问题

本轮最初讨论的是：Vibe Learning MVP 后台原来只是一个临时的 `章节 -> 知识点 -> 题目` 管理后台，但现在已经拿到江苏专转本考试大纲和 2024/2025 高数真题，需要重新思考正式版后端怎么设计。

核心结论是：原 MVP 后台的账号、权限、基础页面框架可以继续用，但题库、考试大纲、学生选择、学习路径等核心模型不能继续按 MVP 的单层结构硬撑。

本轮先收敛到第一期基础配置模块，不继续扩题库/大纲：

- 区域管理：如江苏三年制、浙江三年制、山东五年制。
- 公共课管理：如高等数学、大学语文，并绑定适用区域。
- 专业课管理：这里按用户定义是“专业管理”，如计算机专业、财经专业、学前教育等，并绑定适用区域。

第一期目标是先把“学生注册/登录后要选择什么体系”这层后端基础打稳。

## 2. 最终修改了哪些内容

### 数据模型

已在远端 `/opt/vibe_code/prisma/schema.prisma` 新增：

- `RegionStatus`
- `Region`
- `PublicSubject`
- `Major`
- `RegionPublicSubject`
- `RegionMajor`
- `StudentProfile`

关系设计：

- `Region <-> PublicSubject` 是多对多。
- `Region <-> Major` 是多对多。
- `StudentProfile` 保存学生选择的 `regionId / publicSubjectId / majorId`。

远端已有迁移目录：

- `prisma/migrations/20260518050034_add_foundation_admin/`

### 后台管理能力

已修改远端 `/opt/vibe_code/src/app/admin/actions.ts`：

- 新增/编辑区域。
- 新增/编辑公共课。
- 新增/编辑专业。
- 区域状态点击切换：`active <-> inactive`。
- 公共课/专业状态点击轮转：`draft -> published -> archived -> draft`。
- 新增排序自动生成：取当前最大 `sortOrder + 1`。
- 区域名称自动生成：`省份 + 学制`，不再手动输入区域名称。

当前交互约定：

- 排序字段不在表单里手动输入。
- 区域新增/编辑只输入省份、学制、说明、状态。
- 公共课/专业新增/编辑仍可在表单里选择状态。
- 列表里的状态胶囊也可以直接点击切换。

### 后台页面

已新增/修改远端后台页面：

- `src/app/admin/regions/page.tsx`
- `src/app/admin/public-subjects/page.tsx`
- `src/app/admin/majors/page.tsx`
- `src/components/admin-shell.tsx`
- `src/app/admin/page.tsx`

后台布局已改成用户截图偏好的样式：

- 深色固定左侧栏。
- 顶部系统栏。
- 右侧内容区是标题操作、筛选区、表格列表。
- 页面可见语言已改为中文。

### 后端 API

用户后续明确说“目前不做前端页面，先主要把后端开发好”，所以已新增纯后端接口层：

- `src/lib/foundation.ts`
- `src/app/api/foundation/options/route.ts`
- `src/app/api/student/profile/route.ts`

接口能力：

- `GET /api/foundation/options`
  - 可传 `regionId`。
  - 返回启用区域、该区域下已发布公共课、已发布专业。
- `GET /api/student/profile`
  - 返回当前登录学生的基础选择画像。
- `POST /api/student/profile`
  - 保存当前登录学生的 `regionId / publicSubjectId / majorId`。
  - 校验公共课和专业必须属于所选区域，且必须已发布。

## 3. 已经验证了什么

验证都在远端 `/opt/vibe_code` 进行。用户明确说以后不需要本地校验，因此后续应继续以远端校验为准。

已通过：

```bash
cd /opt/vibe_code
npx prisma validate
npx prisma generate
npx tsc --noEmit
```

其中：

- Prisma schema 校验通过。
- Prisma Client 已生成。
- TypeScript 检查通过。

没有执行：

- 没有主动运行 `npm run build`。
- 没有主动运行 `docker compose up -d --build`，除非用户要求。
- 没有主动看 `docker logs`。
- 没有执行 `git push`。

用户偏好：

- 当后台页面已经改到“可以看见页面变化”时，提醒用户可以做 build。
- 不需要在本地校验。
- 远端 `/opt/vibe_code` 是源头。

## 4. 还有哪些未解决风险

### 迁移与线上状态

远端已有迁移目录，但当前窗口没有确认用户是否已经完整跑完 build/restart 后实际访问验证。继续开发前应确认：

```bash
cd /opt/vibe_code
git status --short
```

以及是否已经执行过：

```bash
docker compose up -d --build
```

### API 还未做端到端调用验证

`GET /api/foundation/options` 和 `GET/POST /api/student/profile` 已通过 TypeScript，但还没有通过浏览器或 curl 做实际 HTTP 调用验证。

后续可用登录态浏览器或接口工具验证：

- 未登录访问 `/api/student/profile` 是否正确跳转/拒绝。
- 已登录学生保存合法组合是否成功。
- 保存不属于该区域的公共课/专业是否返回 400。

### 状态流转是否符合最终业务

目前公共课/专业状态点击按 `草稿 -> 已发布 -> 停用 -> 草稿` 轮转。这个方便，但后续可能需要改成明确动作按钮，避免误点。

### 唯一约束可能过强

当前模型里：

- `Region.name` 唯一。
- `PublicSubject.name` 唯一。
- `PublicSubject.code` 唯一且可空。
- `Major.name` 唯一。

如果后续不同区域允许同名专业但含义不同，`Major.name @unique` 可能需要调整。

### 前端学生选择流程未做

用户最新明确说暂时不做前端页面。因此学生端 onboarding 页面、登录后强制选择、学习页按画像过滤等还没有实现。

### 旧 MVP 模型还未重构

旧的 `Subject / Chapter / KnowledgePoint / Question` 仍保留。第一期只新增基础配置和学生画像，没有改题库、大纲、真题试卷模型。

## 5. 新窗口继续时从哪里开始

建议新窗口从后端继续，不要先做前端页面。

第一步先确认远端状态：

```bash
ssh root@172.18.255.71
cd /opt/vibe_code
git status --short
npx tsc --noEmit
```

第二步建议补后端接口验证：

- 用已登录学生账号验证 `GET /api/student/profile`。
- 用 `GET /api/foundation/options` 验证区域、公共课、专业返回是否符合后台数据。
- 用 `POST /api/student/profile` 验证合法/非法组合。

第三步建议继续补“后端基础能力”：

- 增加专门的后端服务函数测试或脚本验证。
- 规范 API 错误返回格式。
- 增加学生画像是否完整的 helper，例如 `hasCompletedFoundationProfile(userId)`。
- 后续需要时再接登录/学习入口，不急着做页面。

继续开发时应优先查看这些文件：

- `/opt/vibe_code/prisma/schema.prisma`
- `/opt/vibe_code/src/app/admin/actions.ts`
- `/opt/vibe_code/src/lib/foundation.ts`
- `/opt/vibe_code/src/app/api/foundation/options/route.ts`
- `/opt/vibe_code/src/app/api/student/profile/route.ts`
- `/opt/vibe_code/src/app/admin/regions/page.tsx`
- `/opt/vibe_code/src/app/admin/public-subjects/page.tsx`
- `/opt/vibe_code/src/app/admin/majors/page.tsx`

协作注意：

- 不要在本地做校验，远端 `/opt/vibe_code` 为准。
- 不要主动执行 `npm run build`、`docker compose up -d --build`、`docker logs`、`git push`。
- 当页面变化已经值得查看时，提醒用户可以执行 `docker compose up -d --build`。
