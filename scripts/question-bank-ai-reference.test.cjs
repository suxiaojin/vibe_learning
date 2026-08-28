const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const root = process.cwd();

function load(file, overrides = {}, globals = {}) {
  const filename = path.join(root, file);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, process, ...globals,
    require(id) {
      if (id in overrides) return overrides[id];
      if (id.startsWith('@/')) return load(`src/${id.slice(2)}.ts`, overrides, globals);
      if (id.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(filename), `${id}.ts`)), overrides, globals);
      throw new Error(`Unexpected dependency: ${id}`);
    }
  }, { filename });
  return exports;
}

const plain = value => JSON.parse(JSON.stringify(value));
const reference = load('src/lib/question-bank-ai-reference.ts');
const item = (id, parentId = null) => ({ id, parentId, title: id, code: id, sortOrder: 0 });
const courses = [{ id: 'course', name: 'Economics', syllabusItems: [item('chapter'), item('section', 'chapter'), item('deep', 'section'), item('chapter2'), item('empty')] }];
const row = (id, type, ids) => ({ id, question: { type, knowledgeTags: ids.map(syllabusItemId => ({ syllabusItemId })) } });

test('chapter scope includes direct tags, sections, and deep descendants but not siblings', () => {
  const chapters = reference.buildAiReferenceChapters(courses);
  assert.deepEqual(plain(chapters[0].descendantIds), ['chapter', 'section', 'deep']);
  const tree = reference.buildAiReferenceKnowledgeTree(courses, [row('1', 'single_choice', ['chapter', 'section']), row('2', 'term_explanation', ['deep']), row('3', 'essay', ['chapter2'])]);
  assert.equal(tree[0].chapters[0].count, 2);
  assert.deepEqual(plain(tree[0].chapters[0].questionTypes), ['single_choice', 'term_explanation']);
  assert.equal(tree[0].count, 3);
  assert.equal(tree[0].chapters.find(chapter => chapter.id === 'empty').count, 0);
  assert.deepEqual(plain(reference.getAiReferenceQuestionTypes(tree[0].chapters)), ['single_choice', 'term_explanation', 'essay']);
  assert.deepEqual(plain(reference.getAiReferenceQuestionTypes([])), []);
});

const taskPath = 'src/app/api/admin/question-bank-ai-generations/tasks/route.ts';
const commitPath = 'src/app/api/admin/question-bank-ai-generations/commit/route.ts';
function fixture({ admin = true, chapterCount = 3, available = ['single_choice', 'term_explanation'], samplesPerType = 2, rows = courses } = {}) {
  const calls = { fetches: [], queries: [], imports: [] };
  const db = {
    region: { findUnique: async () => ({ name: 'Region' }) },
    major: { findUnique: async () => ({ name: 'Finance' }) },
    learningCourse: { findMany: async query => { calls.queries.push(query); return rows; } },
    examPaperQuestion: { count: async query => { calls.queries.push(query); return chapterCount; } },
    question: { findMany: async query => {
      calls.queries.push(query);
      return query.distinct ? available.map(type => ({ type })) : Array.from({ length: samplesPerType }, (_, i) => ({ id: `${query.where.type}-${i}`, type: query.where.type, knowledgeTags: [{ syllabusItemId: 'deep' }] }));
    } }
  };
  const overrides = {
    'next/server': { NextResponse: { json: (data, options) => ({ data: plain(data), status: options?.status || 200 }) } },
    'next/cache': { revalidatePath: () => {} },
    '@/lib/auth': { getCurrentAdmin: async () => admin ? { role: 'admin' } : null },
    '@/lib/prisma': { prisma: db },
    '@/lib/question-paper-import': {
      assertImportQuestionPaperPayload: () => {},
      getQuestionPaperImportStats: () => ({}),
      importQuestionPaperPayload: async payload => { calls.imports.push(plain(payload)); return { paperId: 'paper' }; }
    }
  };
  const globals = { fetch: async (url, request) => { calls.fetches.push(JSON.parse(request.body)); return { ok: true, json: async () => ({ taskId: 'test' }) }; } };
  return { calls, post: (file, body) => load(file, overrides, globals).POST({ json: async () => body }) };
}
const request = { ownerType: 'major', ownerId: 'owner', regionId: 'region', title: 'AI', count: 4, referenceChapterIds: ['chapter'] };

test('task forwards chapters and defaults to the actual chapter types', async () => {
  const f = fixture();
  assert.equal((await f.post(taskPath, request)).status, 200);
  const sent = f.calls.fetches[0];
  assert.deepEqual(sent.referenceChapterIds, ['chapter']);
  assert.deepEqual(sent.questionTypes, ['single_choice', 'term_explanation']);
  assert.equal(sent.referenceSectionIds, undefined);
  assert.deepEqual(sent.samples.map(row => row.type), ['single_choice', 'term_explanation', 'single_choice', 'term_explanation']);
  assert.deepEqual(sent.samples[0].referenceChapterIds, ['chapter']);
  const query = f.calls.queries.find(query => query.where?.question);
  assert.deepEqual(plain(query.where.question.knowledgeTags.some.syllabusItemId.in), ['chapter', 'section', 'deep']);
  assert.deepEqual(plain(query.where.paper), { ownerType: 'major', majorId: 'owner', regionId: 'region' });
});

for (const [name, changes, options] of [
  ['section ID', { referenceChapterIds: ['section'] }, {}],
  ['foreign chapter ID', { referenceChapterIds: ['foreign'] }, {}],
  ['foreign owner or region', {}, { rows: [] }],
  ['empty chapter', {}, { chapterCount: 0 }],
  ['type absent from chapter', { questionTypes: ['comprehensive'] }, {}],
  ['type count absent from chapter', { questionTypeCounts: { essay: 1 } }, {}],
  ['unknown type', { questionTypes: ['unknown'] }, {}],
  ['excess type counts', { questionTypeCounts: { term_explanation: 5 } }, {}],
  ['fractional count', { count: 1.5 }, {}],
  ['insufficient samples', {}, { samplesPerType: 1 }]
]) {
  test(`rejects ${name} before creating an AI task`, async () => {
    const f = fixture(options);
    assert.equal((await f.post(taskPath, { ...request, ...changes })).status, 400);
    assert.equal(f.calls.fetches.length, 0);
  });
}

test('subjective type and counts survive forwarding', async () => {
  const f = fixture({ samplesPerType: 3 });
  assert.equal((await f.post(taskPath, { ...request, questionTypes: ['term_explanation'], questionTypeCounts: { term_explanation: 4 } })).status, 200);
  assert.deepEqual(f.calls.fetches[0].questionTypeCounts, { term_explanation: 4 });
});

test('unauthenticated requests do not query data or create tasks', async () => {
  const f = fixture({ admin: false });
  assert.equal((await f.post(taskPath, request)).status, 401);
  assert.equal(f.calls.queries.length, 0);
});

test('commit normalizes both tag fields to validated chapters', async () => {
  const f = fixture();
  assert.equal((await f.post(commitPath, { ...request, payload: { title: 'AI', questions: [{ type: 'term_explanation', syllabusItemId: 'foreign', syllabusItemIds: ['chapter'] }, { type: 'essay', syllabusItemIds: ['section'] }] } })).status, 200);
  for (const question of f.calls.imports[0].questions) {
    assert.equal(question.syllabusItemId, 'chapter');
    assert.deepEqual(question.syllabusItemIds, ['chapter']);
  }
  assert.equal(f.calls.imports[0].questions[0].type, 'term_explanation');
});

test('commit rejects section IDs without writing', async () => {
  const f = fixture();
  assert.equal((await f.post(commitPath, { ...request, referenceChapterIds: ['section'] })).status, 400);
  assert.equal(f.calls.imports.length, 0);
});
