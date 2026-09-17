/**
 * dsh-concise chips 单测（node --test --experimental-strip-types，零依赖）。
 * 固化 v0.8.5 路径 chip 契约：类型判定 + 摘要文本切分边界。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectPathKind, splitPathSegments } from '../src/client/chips.ts'

test('detectPathKind maps extensions and urls to typed info', () => {
  assert.equal(detectPathKind('/Users/demo/Desktop/L4.png').kind, 'image')
  assert.equal(detectPathKind('/Users/demo/report.pdf').kind, 'pdf')
  assert.equal(detectPathKind('/Users/demo/方案.docx').kind, 'word')
  assert.equal(detectPathKind('/Users/demo/数据.xlsx').kind, 'excel')
  assert.equal(detectPathKind('src/main/App.java').kind, 'code')
  assert.equal(detectPathKind('README.md').kind, 'markdown')
  assert.equal(detectPathKind('https://feishu.cn/wiki/abc').kind, 'link')
  assert.equal(detectPathKind('http://example.com').kind, 'link')
  // 无扩展名的绝对路径 → 文件夹；未知扩展名 → 文件
  assert.equal(detectPathKind('/Users/demo/Desktop/DSH').kind, 'folder')
  assert.equal(detectPathKind('/tmp/data.xyz123').kind, 'file')
})

test('detectPathKind carries per-type color and label', () => {
  const pdf = detectPathKind('/a.pdf')
  assert.equal(pdf.color, '#EF4444')
  assert.ok(pdf.label.length > 0)
  const link = detectPathKind('https://a.com')
  assert.equal(link.color, '#D97757')
})

test('splitPathSegments splits mixed digest text into typed segments', () => {
  const text = '已复制到 /Users/demo/Desktop/L4.png 与 https://feishu.cn/wiki/abc，详见 src/app.java 的实现。'
  const segs = splitPathSegments(text)
  const kinds = segs.map((s) => s.type)
  assert.deepEqual(kinds, ['text', 'file', 'text', 'url', 'text', 'file', 'text'])
  const file1 = segs[1]
  assert.equal(file1.value, '/Users/demo/Desktop/L4.png')
  const url = segs[3]
  assert.equal(url.value, 'https://feishu.cn/wiki/abc')
  // 中文逗号不被吞进路径
  assert.ok(segs[2].value.startsWith(' 与 '))
})

test('splitPathSegments strips trailing sentence punctuation from paths', () => {
  const segs = splitPathSegments('报告在 /tmp/report.pdf。')
  const file = segs.find((s) => s.type === 'file')
  assert.ok(file, 'file segment exists')
  assert.equal(file.value, '/tmp/report.pdf')
})

test('splitPathSegments returns single text for plain prose (no false positives)', () => {
  const segs = splitPathSegments('这是一个没有任何路径的普通句子。')
  assert.equal(segs.length, 1)
  assert.equal(segs[0].type, 'text')
})

test('resolveAbsolute resolves relative and tilde paths against cwd/home', async () => {
  const { resolveAbsolute } = await import('../src/client/chips.ts')
  const cwd = '/Users/demo/Desktop/AI/hyperaitools'
  const home = '/Users/demo'
  assert.equal(resolveAbsolute('/abs/x.md', cwd, home), '/abs/x.md')
  assert.equal(resolveAbsolute('var/scripts/L3.md', cwd, home), cwd + '/var/scripts/L3.md')
  assert.equal(resolveAbsolute('~/notes/a.md', cwd, home), '/Users/demo/notes/a.md')
})

test('ideSchemeUrl picks first detected IDE and encodes file path', async () => {
  const { ideSchemeUrl } = await import('../src/client/chips.ts')
  assert.equal(ideSchemeUrl(['finder', 'cursor', 'vscode'], '/Users/demo/x.md'), 'cursor://file/Users/demo/x.md')
  assert.equal(ideSchemeUrl(['finder'], '/Users/demo/x.md'), null)
})

