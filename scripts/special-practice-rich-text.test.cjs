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

function load(relativePath, mocks = {}) {
  const filename = path.join(root, relativePath);
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: (id) => Object.hasOwn(mocks, id) ? mocks[id] : localRequire(id),
  }, { filename });
  return module.exports;
}

const { RichTextContent } = load('src/components/rich-text-content.tsx', {
  '@/lib/utils': { cn: (...values) => values.filter(Boolean).join(' ') },
});

function render(value) {
  return renderToStaticMarkup(React.createElement(RichTextContent, { value }));
}

test('plain text remains text and preserves line breaks', () => {
  const html = render('第一行\n第二行');
  assert.ok(html.startsWith('<p'));
  assert.ok(html.includes('第一行\n第二行'));
});

test('HTML line breaks and containers render as markup instead of source text', () => {
  const html = render('<div>第一问<br>第二问</div>');
  assert.match(html, /<div>第一问<br\/?>(?:第二问)<\/div>/);
  assert.ok(!html.includes('&lt;br'));
  assert.ok(!html.includes('&lt;div'));
});

test('standalone whitespace entities render without exposing encoded source', () => {
  const html = render('供给&nbsp;与需求');
  assert.ok(html.includes('供给&nbsp;与需求'));
  assert.ok(!html.includes('&amp;nbsp;'));
});

test('embedded images remain responsive rich content', () => {
  const html = render('<img src="data:image/png;base64,AAAA" alt="题图">');
  assert.ok(html.includes('src="data:image/png;base64,AAAA"'));
  assert.ok(html.includes('_img]:max-w-full'));
  assert.ok(!html.includes('&lt;img'));
});

test('special practice stem, options, answer and analysis share rich-text rendering', () => {
  const source = fs.readFileSync(path.join(root, 'src/app/mock-tests/special/[sectionId]/special-practice-runner.tsx'), 'utf8');
  assert.ok(source.includes('value={`${currentIndex + 1}、${question.stem}`}'));
  assert.ok(source.includes('value={option.text}'));
  assert.ok(source.includes('value={answerText(correctAnswer) || "暂无"}'));
  assert.ok(source.includes('value={question.analysis || "暂无解析。"}'));
  assert.ok(!source.includes('{currentIndex + 1}、{question.stem}'));
});
