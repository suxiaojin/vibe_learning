const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const root = process.argv[2] || process.cwd();
const localRequire = createRequire(path.join(root, 'package.json'));
const ts = localRequire('typescript');
const React = localRequire('react');
const { renderToStaticMarkup } = localRequire('react-dom/server');

// Run real source modules with explicit boundary doubles; never connect to a
// database, a Next.js server or a browser from this regression suite.
function load(relativePath, mocks = {}, globals = {}) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require: (id) => Object.hasOwn(mocks, id) ? mocks[id] : localRequire(id),
    console: { error() {} },
    ...globals,
  }, { filename });
  return module.exports;
}
const themes = load('src/lib/learning-path-theme.ts');
const settings = load('src/lib/system-settings.ts', { '@/lib/prisma': { prisma: {} } });
const plain = (value) => JSON.parse(JSON.stringify(value));
const cn = (...values) => values.filter(Boolean).join(' ');
const { LearningPath } = load('src/components/learning-path.tsx', {
  '@/lib/learning-path-theme': themes,
  '@/lib/utils': { cn },
  'next/link': ({ children, ...props }) => React.createElement('a', props, children),
});
const props = {
  course: { id: 'course-1', title: '经济学基础', courseType: 'major' },
  path: { passedCount: 1, points: [
    { id: 'passed', title: '已通过章节', status: 'passed', questionCount: 6 },
    { id: 'unlocked', title: '可闯关章节', status: 'unlocked', questionCount: 9 },
    { id: 'locked', title: '锁定章节', status: 'locked', questionCount: 7 },
  ] },
};

function luminance(hex) {
  return hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255)
    .reduce((sum, v, i) => sum + (v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i], 0);
}

for (const theme of themes.learningPathThemes) {
  test(`render ${theme.key}: scoped colors, neutral lock, unchanged links`, () => {
    assert.equal(themes.isLearningPathThemeKey(theme.key), true);
    const style = themes.getLearningPathThemeStyle(theme.key);
    const html = renderToStaticMarkup(React.createElement(LearningPath, { ...props, themeKey: theme.key }));
    assert.ok(html.includes(`--challenge-primary:${theme.primary}`));
    assert.ok(html.includes(`--challenge-strong:${theme.strong}`));
    assert.ok(html.includes(`--challenge-ring:${style['--challenge-ring']}`));
    assert.ok(html.includes('ring-[var(--challenge-ring)]'));
    assert.ok(html.includes('href="/learn/unlocked"'));
    assert.ok(html.includes('href="/learn/unlocked/guide"'));
    assert.ok(html.includes('已通过章节') && html.includes('可闯关章节'));
    const lockedHtml = html.slice(html.indexOf('id="point-locked"'));
    assert.ok(lockedHtml.includes('border-slate-300 bg-slate-200 text-slate-400'));
    assert.ok(!lockedHtml.includes('bg-[var(--challenge-primary)]'));
    assert.ok(!html.includes('bg-success'));
    if (theme.key !== 'default') {
      assert.ok(1.05 / (luminance(theme.primary) + .05) >= 4.5, 'white on the new solid theme color must remain readable');
    }
  });
}

test('unknown configuration falls back to the unchanged default green', () => {
  for (const key of [undefined, null, '', 'unknown', 'toString', 'url(javascript:alert(1))', '#FF0000']) {
    assert.equal(themes.getLearningPathTheme(key).key, 'default');
    assert.equal(themes.isLearningPathThemeKey(key), false);
  }
  assert.deepEqual(plain(themes.getLearningPathThemeStyle()), {
    '--challenge-primary': '#58CC02', '--challenge-strong': '#45A000', '--challenge-ring': '#58CC0233',
    '--challenge-muted': '#EFFBE7', '--challenge-icon-muted': '#58CC0226', '--challenge-accent': '#1F9D8A',
  });
  assert.equal(settings.systemSettingsDefaults.learningPathTheme, 'default');
});

function actionFixture({ denied = false, failed = false, exists = true } = {}) {
  const calls = [];
  const invalidated = [];
  let row = exists ? { id: 'default', learningPathTheme: 'mist-blue', customerServiceEmail: 'keep@example.com', profileHomepageBackgroundImageUrl: '/keep.png' } : null;
  const { updateLearningPathThemeSettings } = load('src/app/admin/settings/learning-path-theme-actions.ts', {
    'next/cache': { revalidatePath: (...args) => invalidated.push(args) },
    '@/lib/auth': { requireAdmin: async () => { if (denied) throw new Error('ADMIN_REQUIRED'); } },
    '@/lib/learning-path-theme': themes,
    '@/lib/system-settings': settings,
    '@/lib/prisma': { prisma: { systemSetting: { upsert: async (args) => {
      calls.push(plain(args));
      if (failed) throw new Error('database unavailable');
      row = row ? { ...row, ...args.update } : plain(args.create);
      return row;
    } } } },
  });
  return {
    calls, invalidated, row: () => row,
    submit: (key) => {
      const data = new FormData();
      if (key !== undefined) data.set('learningPathTheme', key);
      return updateLearningPathThemeSettings({ status: 'idle', message: '' }, data);
    },
  };
}

for (const theme of themes.learningPathThemes) {
  test(`save ${theme.key}: only this setting changes, all affected routes invalidated`, async () => {
    const fixture = actionFixture();
    const result = await fixture.submit(theme.key);
    assert.equal(result.status, 'success');
    assert.equal(result.savedThemeKey, theme.key);
    assert.deepEqual(fixture.calls[0].update, { learningPathTheme: theme.key });
    assert.equal(fixture.row().customerServiceEmail, 'keep@example.com');
    assert.equal(fixture.row().profileHomepageBackgroundImageUrl, '/keep.png');
    assert.deepEqual(fixture.invalidated, [
      ['/admin/settings'],
      ['/learn'],
      ['/learn/stages'],
      ['/learn/[id]/guide', 'page'],
      ['/learn/[id]', 'page'],
      ['/learn/[id]/result', 'page'],
    ]);
  });
}

test('administrator authorization is enforced before saving', async () => {
  const fixture = actionFixture({ denied: true });
  await assert.rejects(fixture.submit('sage'), /ADMIN_REQUIRED/);
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.invalidated.length, 0);
});

test('invalid or missing theme cannot be saved', async () => {
  for (const key of [undefined, '', 'SAGE', '#62796B', 'constructor', 'url(evil)']) {
    const fixture = actionFixture();
    assert.equal((await fixture.submit(key)).status, 'error');
    assert.equal(fixture.calls.length, 0);
  }
});

test('database failure does not report success or invalidate pages', async () => {
  const fixture = actionFixture({ failed: true });
  assert.equal((await fixture.submit('sage')).status, 'error');
  assert.equal(fixture.row().learningPathTheme, 'mist-blue');
  assert.equal(fixture.invalidated.length, 0);
});

test('a missing settings row is created with defaults and the chosen theme', async () => {
  const fixture = actionFixture({ exists: false });
  assert.equal((await fixture.submit('warm-clay')).status, 'success');
  assert.equal(fixture.row().learningPathTheme, 'warm-clay');
  assert.equal(fixture.row().loginHeroImageUrl, settings.systemSettingsDefaults.loginHeroImageUrl);
});

test('all colors including pink and red appear with the restore action in the administrator form', () => {
  const { AdminLearningPathThemeSettings } = load('src/components/admin-learning-path-theme-settings.tsx', {
    '@/app/admin/settings/learning-path-theme-actions': { updateLearningPathThemeSettings: async () => {} },
    '@/lib/learning-path-theme': themes,
    '@/lib/utils': { cn },
  });
  const html = renderToStaticMarkup(React.createElement(AdminLearningPathThemeSettings, { currentThemeKey: 'sage' }));
  for (const theme of themes.learningPathThemes) assert.ok(html.includes(`value="${theme.key}"`));
  assert.ok(html.includes('雾粉') && html.includes('陶红'));
  assert.ok(html.includes('恢复默认绿色') && html.includes('确认保存'));
  assert.ok(html.includes('当前已保存：鼠尾草绿'));
  assert.ok(html.includes('尚未保存') === false);
});

test('retry submits the controlled preview color without native form reset', () => {
  let submitted;
  let prevented = false;
  const { AdminLearningPathThemeSettings } = load('src/components/admin-learning-path-theme-settings.tsx', {
    react: {
      ...React,
      useState: () => ['mist-blue', () => {}],
      useEffect() {},
      useActionState: () => [{ status: 'error', message: 'failed' }, (form) => { submitted = form.get('learningPathTheme'); }, false],
      startTransition: (callback) => callback(),
    },
    '@/app/admin/settings/learning-path-theme-actions': { updateLearningPathThemeSettings: async () => {} },
    '@/lib/learning-path-theme': themes,
    '@/lib/utils': { cn },
  }, {
    FormData: class extends FormData {
      constructor() { super(); this.set('learningPathTheme', 'default'); }
    },
  });
  const tree = AdminLearningPathThemeSettings({ currentThemeKey: 'default' });
  const form = tree.props.children;
  const formElement = form.find((node) => node.type === 'form');
  assert.equal(formElement.props.action, undefined);
  formElement.props.onSubmit({ preventDefault() { prevented = true; }, currentTarget: {} });
  assert.equal(prevented, true);
  assert.equal(submitted, 'mist-blue');
});

const stageGroup = {
  key: 'major', sectionIds: ['passed', 'partial', 'unlocked', 'locked'],
  courses: [{ id: 'course-1', title: '计算机应用基础', chapters: [
    { id: 'completed', title: '已完成章节', sections: [{ id: 'passed', status: 'passed', questionCount: 6 }] },
    { id: 'current', title: '计算机硬件', sections: [{ id: 'partial', status: 'passed', questionCount: 6 }, { id: 'unlocked', status: 'unlocked', questionCount: 6 }] },
    { id: 'locked', title: '计算机软件', sections: [{ id: 'locked', status: 'locked', questionCount: 9 }] },
  ] }],
};
const guideAccess = {
  locked: false, group: { key: 'major' }, course: { title: '计算机应用基础' },
  chapter: { id: 'current', title: '计算机硬件', description: '常见设备和基本原理\n信息的表示方式' },
  section: { id: 'unlocked', title: '计算机硬件', questionCount: 6 },
};

function studentPagesFixture(themeKey, { group = stageGroup, access = guideAccess } = {}) {
  const calls = [];
  let settingsReads = 0;
  const boundaries = {
    'next/link': ({ children, ...props }) => React.createElement('a', props, children),
    'next/navigation': { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } },
    '@/components/student-page-shell': { StudentPageShell: ({ children }) => React.createElement('main', null, children) },
    '@/lib/auth': { requireUser: async () => ({ id: 'student-1' }) },
    '@/lib/learning-path-theme': themes,
    '@/lib/system-settings': { getSystemSettings: async () => { settingsReads++; return { learningPathTheme: themeKey }; } },
    '@/lib/syllabus-learning': {
      getStudentLearningPath: async (...args) => { calls.push(args); return { selectedGroup: group }; },
      getSyllabusSectionForStudent: async (...args) => { calls.push(args); return access; },
    },
  };
  const stages = load('src/app/learn/stages/page.tsx', boundaries);
  const guide = load('src/app/learn/[id]/guide/page.tsx', boundaries);
  return {
    calls, settingsReads: () => settingsReads,
    stages: async () => renderToStaticMarkup(await stages.default({ searchParams: Promise.resolve({ course: 'major' }) })),
    guide: async () => renderToStaticMarkup(await guide.default({ params: Promise.resolve({ id: 'unlocked' }) })),
  };
}

for (const theme of [...themes.learningPathThemes, { key: 'unknown' }]) {
  test(`stages and guide ${theme.key}: saved theme, tints, controls and access links`, async () => {
    const fixture = studentPagesFixture(theme.key);
    const style = themes.getLearningPathThemeStyle(theme.key);
    const stages = await fixture.stages();
    const guide = await fixture.guide();
    for (const html of [stages, guide]) {
      for (const [token, value] of Object.entries(style)) assert.ok(html.includes(`${token}:${value}`));
      assert.ok(html.includes('bg-[var(--challenge-primary)] hover:bg-[var(--challenge-strong)]'));
      assert.ok(html.includes('text-[var(--challenge-accent)]'));
      assert.ok(!/bg-success|text-success|text-teal/.test(html));
    }
    assert.ok(stages.includes('bg-[var(--challenge-muted)]'));
    assert.ok(stages.includes('width:50%') && stages.includes('width:100%'));
    assert.ok(stages.includes('href="/learn?course=major&amp;chapter=current"'));
    assert.ok(stages.includes('href="/learn/partial/guide"'));
    const locked = stages.slice(stages.indexOf('id="chapter-locked"'));
    assert.ok(locked.includes('bg-surface-muted') && locked.includes('text-slate-400'));
    assert.ok(locked.includes('disabled=""'));
    assert.ok(!locked.includes('href='));
    assert.ok(guide.includes('bg-[var(--challenge-icon-muted)] text-[var(--challenge-primary)]'));
    assert.ok(guide.includes('href="/learn/unlocked"'));
    assert.ok(guide.includes('href="/learn/stages?course=major#chapter-current"'));
    assert.ok(guide.includes('常见设备和基本原理\n信息的表示方式'));
    assert.deepEqual(fixture.calls, [['student-1', 'major'], ['student-1', 'unlocked']]);
    assert.equal(fixture.settingsReads(), 2);
    if (theme.key !== 'default' && theme.key !== 'unknown') {
      const contrast = (luminance(style['--challenge-muted']) + .05) / (luminance(style['--challenge-accent']) + .05);
      assert.ok(contrast >= 4.5, 'accent text on the tinted card stays readable');
    }
  });
}

test('missing and locked guide access still redirect before loading settings', async () => {
  for (const access of [null, { ...guideAccess, locked: true }]) {
    const fixture = studentPagesFixture('clay-red', { access });
    await assert.rejects(fixture.guide(), /REDIRECT:\/learn/);
    assert.equal(fixture.settingsReads(), 0);
  }
});

test('stages with no published content retain the empty state and back link', async () => {
  const html = await studentPagesFixture('mist-pink', { group: null }).stages();
  assert.ok(html.includes('当前没有已发布的闯关内容。'));
  assert.ok(html.includes('href="/learn"'));
  assert.ok(!html.includes('id="chapter-'));
});

test('quiz and result routes load and scope the saved challenge theme', () => {
  const quizPage = fs.readFileSync(path.join(root, 'src/app/learn/[id]/page.tsx'), 'utf8');
  const resultPage = fs.readFileSync(path.join(root, 'src/app/learn/[id]/result/page.tsx'), 'utf8');
  for (const source of [quizPage, resultPage]) {
    assert.ok(source.includes('getSystemSettings'));
    assert.ok(source.includes('getLearningPathThemeStyle(settings.learningPathTheme)'));
  }
  assert.ok(quizPage.includes('style={getLearningPathThemeStyle(settings.learningPathTheme)}'));
  assert.ok(resultPage.includes('<div style={getLearningPathThemeStyle(settings.learningPathTheme)}>'));
});

test('quiz runner themes neutral controls while preserving answer-state colors', () => {
  const source = fs.readFileSync(path.join(root, 'src/components/quiz-runner.tsx'), 'utf8');
  for (const token of ['--challenge-primary', '--challenge-strong', '--challenge-ring', '--challenge-muted', '--challenge-accent']) {
    assert.ok(source.includes(`var(${token})`));
  }
  assert.ok(source.includes('bg-success transition-[width]'));
  assert.ok(source.includes('border-success bg-success-muted'));
  assert.ok(source.includes('border-coral bg-coral/10'));
  assert.ok(source.includes('text-coral'));
  assert.ok(!source.includes('border-success-strong bg-success px-5'));
});

test('result actions theme objective AI controls and hide them for ungraded or advanced math attempts', () => {
  const resultPage = fs.readFileSync(path.join(root, 'src/app/learn/[id]/result/page.tsx'), 'utf8');
  const ai = fs.readFileSync(path.join(root, 'src/components/wrong-question-ai.tsx'), 'utf8');
  assert.ok(resultPage.includes('themedPrimaryButtonClass'));
  assert.ok(resultPage.includes('themedSecondaryButtonClass'));
  assert.ok(resultPage.includes('themedAiButtonClass'));
  assert.ok(resultPage.includes('const ungraded = tone === "ungraded";'));
  assert.ok(resultPage.includes('const hideAiExplanation = isAdvancedMathPublicSubject(access.group.key, access.group.name);'));
  assert.ok(resultPage.includes('{!ungraded && !hideAiExplanation ? (\n        <WrongQuestionAi'));
  assert.ok(resultPage.includes('followUpButtonClassName={themedPrimaryButtonClass}'));
  assert.ok(resultPage.includes('passed ? "bg-success p-6 text-white" : "bg-coral p-6 text-white"'));
  assert.ok(resultPage.includes('passed ? "bg-success" : "bg-coral"'));
  assert.ok(ai.includes('followUpButtonClassName = "primary-button"'));
  assert.ok(ai.includes('className={`${followUpButtonClassName} sm:w-24'));
});
