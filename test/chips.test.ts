/**
 * dsh-concise chips 单测（node --test --experimental-strip-types，零依赖）。
 * 固化 v0.8.5 路径 chip 契约：类型判定 + 摘要文本切分边界。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectPathKind, splitPathSegments, collectDeliverables } from '../src/client/chips.ts'

test('detectPathKind maps extensions and urls to typed info', () => {
  assert.equal(detectPathKind('/Users/demo/Desktop/L4.png').kind, 'image')
  assert.equal(detectPathKind('/Users/demo/report.pdf').kind, 'pdf')
  assert.equal(detectPathKind('/Users/demo/方案.docx').kind, 'word')
  assert.equal(detectPathKind('/Users/demo/数据.xlsx').kind, 'excel')
  assert.equal(detectPathKind('src/main/App.java').kind, 'code')
  assert.equal(detectPathKind('README.md').kind, 'markdown')
  assert.equal(detectPathKind('https://example.com/wiki/abc').kind, 'link')
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
  const text = '已复制到 /Users/demo/Desktop/L4.png 与 https://example.com/wiki/abc，详见 src/app.java 的实现。'
  const segs = splitPathSegments(text)
  const kinds = segs.map((s) => s.type)
  assert.deepEqual(kinds, ['text', 'file', 'text', 'url', 'text', 'file', 'text'])
  const file1 = segs[1]
  assert.equal(file1.value, '/Users/demo/Desktop/L4.png')
  const url = segs[3]
  assert.equal(url.value, 'https://example.com/wiki/abc')
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

test('collectDeliverables extracts reply files, excluding urls/folders/card-dupes', () => {
  // 复刻 autofill 会话实测形态：交付物表格里的相对路径 + 裸文件名 + SHA 截断片段
  const reply = [
    '图已交付。',
    '| L4 | var/diagrams/l4-approved-dfs-agent.html（规格 l4-approved-dfs-agent.dataflow.json，SHA-256 cfbc9d51…）|',
    '| L3 | var/diagrams/l3-experience-agent.html（规格 l3-experience-agent.dataflow.json，SHA-256 7e79a92e…）|',
    '参考 https://example.com/spec 与 var/diagrams/ 目录。',
  ].join('\n')
  const card = '摘要： 两张 showcase 级交互图已交付。'
  const files = collectDeliverables(reply, card, 8)
  assert.deepEqual(files, [
    'var/diagrams/l4-approved-dfs-agent.html',
    'l4-approved-dfs-agent.dataflow.json',
    'var/diagrams/l3-experience-agent.html',
    'l3-experience-agent.dataflow.json',
  ])
})

test('collectDeliverables dedupes, drops card-mentioned paths, and enforces limit', () => {
  const reply = [
    '产物 /tmp/a.report.md 与 /tmp/b.data.json 完成。',
    '摘要里已提过 /tmp/a.report.md 不应重复出现。',
    '/tmp/a.report.md 第二次出现也去重。',
  ].join('\n')
  const card = '摘要： 见 /tmp/a.report.md。'
  const files = collectDeliverables(reply, card, 8)
  assert.deepEqual(files, ['/tmp/b.data.json'])
  // 上限生效
  const many = Array.from({ length: 12 }, (_, i) => '/tmp/out-' + i + '.png').join(' ')
  assert.equal(collectDeliverables(many, '', 8).length, 8)
  // URL 不入列
  assert.deepEqual(collectDeliverables('见 https://example.com/a.pdf 页面。', '', 8), [])
})

test('resolveAbsolute resolves relative and tilde paths against cwd/home', async () => {
  const { resolveAbsolute } = await import('../src/client/chips.ts')
  const cwd = '/Users/demo/Desktop/AI/hyperaitools'
  const home = '/Users/demo'
  assert.equal(resolveAbsolute('/abs/x.md', cwd, home), '/abs/x.md')
  assert.equal(resolveAbsolute('var/scripts/L3.md', cwd, home), cwd + '/var/scripts/L3.md')
  assert.equal(resolveAbsolute('~/notes/a.md', cwd, home), '/Users/demo/notes/a.md')
})


test('isPreviewableKind marks browser-renderable kinds', async () => {
  const { isPreviewableKind } = await import('../src/client/chips.ts')
  assert.equal(isPreviewableKind('image'), true)
  assert.equal(isPreviewableKind('pdf'), true)
  assert.equal(isPreviewableKind('code'), true)
  assert.equal(isPreviewableKind('markdown'), true)
  assert.equal(isPreviewableKind('word'), false)
  assert.equal(isPreviewableKind('excel'), false)
  assert.equal(isPreviewableKind('archive'), false)
})

test('splitPathSegments never chips prose tildes like ~E or A~E (v0.9.1 regression)', async () => {
  const { splitPathSegments } = await import('../src/client/chips.ts')
  const segs = splitPathSegments('五组证据（A~E 📁，全部带文件：行号或 bugreport 日志）')
  const chips = segs.filter((x) => x.type !== 'text')
  assert.equal(chips.length, 0)
})

test('splitPathSegments still chips real tilde paths ~/x', async () => {
  const { splitPathSegments } = await import('../src/client/chips.ts')
  const segs = splitPathSegments('配置在 ~/.zshrc 里')
  const chips = segs.filter((x) => x.type !== 'text')
  assert.equal(chips.length, 1)
  assert.equal(chips[0].value, '~/.zshrc')
})

test('splitPathSegments never chips emails/domains with pseudo-extensions (v0.10.3 regression)', async () => {
  const { splitPathSegments } = await import('../src/client/chips.ts')
  // 用户实测（dsh-improve-prompt 会话）：hoyyang@users.noreply.github.com 被切成
  // 「hoyyang@」+ 假 chip「users.noreply.github.c」（域名尾部回溯出合法扩展名 c）+ 残段「om」
  const segs = splitPathSegments('身份全部重写为 hoyyang@users.noreply.github.com，历史清零。')
  assert.equal(segs.filter((x) => x.type !== 'text').length, 0, 'email must stay plain text')
  assert.equal(segs.length, 1, 'no residual fragments')
  // 裸域名同家族（.com/.cn/.ch → 回溯到单字母扩展名 c）一律不 chip；
  // 邮箱用例复用白名单公开身份（门 11 S1 不新增邮箱形态）
  assert.equal(splitPathSegments('仓库在 github.com 上托管').filter((x) => x.type !== 'text').length, 0)
  assert.equal(splitPathSegments('联系 hoyyang@users.noreply.github.com 即可').filter((x) => x.type !== 'text').length, 0)
})

test('splitPathSegments still chips real relative paths after word-boundary fix', async () => {
  const { splitPathSegments } = await import('../src/client/chips.ts')
  const segs = splitPathSegments('代码在 src/index.ts，报告见 README.md。图是 draw-code/e2e-l3.png')
  const chips = segs.filter((x) => x.type === 'file')
  assert.deepEqual(chips.map((c) => c.value), ['src/index.ts', 'README.md', 'draw-code/e2e-l3.png'])
})

