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

test('splitPathSegments stops absolute paths at full-width punctuation (v0.10.4: deliverable png omitted)', () => {
  // 用户实测（AutofillService 会话）：成品图行渲染后 <code> 内路径与后续中文正文在
  // textContent 里无界粘连——旧负向排除表漏掉（）：、，整段吞进路径 → detectPathKind 判
  // folder → collectDeliverables 排除目录 → 交付物漏列成品图。
  const line = '成品图：/Users/demo/repo/draw-code/autofillservice-解析实现全景-l0-mu9d14h5.png（已通过视觉核验：双入口、四工序，全部落位）'
  const segs = splitPathSegments(line)
  const file = segs.find((s) => s.type === 'file')
  assert.ok(file, 'file segment exists')
  assert.equal(file.value, '/Users/demo/repo/draw-code/autofillservice-解析实现全景-l0-mu9d14h5.png')
  assert.equal(detectPathKind(file.value).kind, 'image')
  // 正文无损保留为 text 段（切分必须可往返拼回原文）
  assert.equal(segs.map((s) => s.value).join(''), line)
})

test('splitPathSegments boundary stops across the full-width punctuation family', () => {
  const png = '/Users/demo/out/autofillservice-全景-l0.png'
  for (const tail of ['，已核验', '。', '：说明', '、其余', '？', '！', '（已通过', '）', '《图》', '【附】', '「注」', '；另见', '…', '——']) {
    const segs = splitPathSegments('成品 ' + png + tail)
    const file = segs.find((s) => s.type === 'file')
    assert.ok(file, 'file exists for tail ' + JSON.stringify(tail))
    assert.equal(file.value, png, 'clean stop before tail ' + JSON.stringify(tail))
  }
})

test('collectDeliverables lists artifact png + prompt md end-to-end (reported session repro)', () => {
  // 复刻 AutofillService 会话最终回复的 blockAwareText 形态（code span 反引号在
  // textContent 中消失，路径与相邻正文/表行按块级边界连接）
  const reply = [
    '摘要：已按 L0 生图路线完成全景信息图，成品 1536×1024 PNG 已生成并核验。',
    '成品图：/Users/demo/repo/draw-code/autofillservice-解析实现全景-l0-mu9d14h5.png（已通过视觉核验：双入口、四工序，全部落位）',
    '工单：/Users/demo/repo/draw-code/autofillservice-解析实现全景-l0-mu9d14h5.l0.prompt.md',
    '图中元素 真实实现',
    '「帮我填充 / 帮我保存」双入口 AutofillService.onFillRequest / onSaveRequest',
    '三线索交叉定身份 控件自述 × 网页标注（AutofillHintsHelper） × 来源应用',
  ].join('\n')
  const card = '摘要：已按 L0 生图路线完成全景信息图，成品 1536×1024 PNG 已生成并核验。'
  const files = collectDeliverables(reply, card, 8)
  assert.ok(files.some((f) => f.endsWith('autofillservice-解析实现全景-l0-mu9d14h5.png')), 'png must be listed')
  assert.ok(files.some((f) => f.endsWith('.l0.prompt.md')), 'prompt md must be listed')
  assert.equal(files.length, 2, 'no false positives from table prose')
})

test('trimProseTail re-anchors CJK-glued tails to the last known extension', async () => {
  const { trimProseTail } = await import('../src/client/chips.ts')
  // 无标点直接粘连：回锚到扩展名，吞进去的正文被截掉
  assert.equal(trimProseTail('/a/b/全景-l0.png已生成并核验'), '/a/b/全景-l0.png')
  assert.equal(trimProseTail('/a/b/report.pdf见附件'), '/a/b/report.pdf')
  // 干净候选原样保留
  assert.equal(trimProseTail('/a/b/全景-l0.png'), '/a/b/全景-l0.png')
  assert.equal(trimProseTail('/Users/demo/截图汇总'), '/Users/demo/截图汇总')
  assert.equal(trimProseTail('/Users/demo/截图汇总/'), '/Users/demo/截图汇总/')
  // 纯 ASCII（含未知扩展名/无扩展名）不参与回锚
  assert.equal(trimProseTail('/tmp/data.xyz123'), '/tmp/data.xyz123')
  assert.equal(trimProseTail('/Users/demo/Desktop/DSH'), '/Users/demo/Desktop/DSH')
})

test('splitPathSegments re-anchors direct CJK tails without punctuation', () => {
  const segs = splitPathSegments('图已存 /Users/demo/out/全景.png请查收')
  const file = segs.find((s) => s.type === 'file')
  assert.ok(file)
  assert.equal(file.value, '/Users/demo/out/全景.png')
  assert.equal(segs.map((s) => s.value).join(''), '图已存 /Users/demo/out/全景.png请查收')
})

test('splitPathSegments matches dir-qualified relative paths with CJK basenames (v0.10.6: L4 artifact omitted)', () => {
  // 用户实测（autofill-ai-parser-L3/L4 会话）：表格里的相对路径含中文文件名，旧 ASCII 类在
  // CJK 处断裂回切出碎片 -l4-mu9j2r4n.html（碎片不存在 → verify 过滤 → 交付物漏列）
  const line = 'draw-code/l3-解析-agent-喂什么-做什么-出什么-l4-mu9j2r4n.html'
  const segs = splitPathSegments('叙事卡 HTML（已自动打开）\n' + line)
  const file = segs.find((s) => s.type === 'file')
  assert.ok(file)
  assert.equal(file.value, line)
  // html 在 EXT_KIND 无专属类型 → 'file'（历史口径，浏览器预览走 file 通道）
  assert.equal(detectPathKind(file.value).kind, 'file')
  // 多段目录 + 双扩展名（.narrative.json）
  const spec = 'var/diagrams/v2/解析全景-l4.narrative.json'
  const segs2 = splitPathSegments('结构 spec：' + spec)
  const file2 = segs2.find((s) => s.type === 'file')
  assert.ok(file2)
  assert.equal(file2.value, spec)
})

test('collectDeliverables lists L4 html + narrative json from table cells (reported session repro)', () => {
  const reply = [
    '摘要：已按 L4 叙事卡画出 L3 解析 Agent 全貌……HTML 已生成并在浏览器打开。',
    '交付：',
    '产物 路径',
    '叙事卡 HTML（已自动打开）',
    'draw-code/l3-解析-agent-喂什么-做什么-出什么-l4-mu9j2r4n.html',
    '结构 spec（可复用/改词重渲）',
    'draw-code/l3-解析-agent-喂什么-做什么-出什么-l4-mu9j2r4n.narrative.json',
  ].join('\n')
  const card = '摘要：已按 L4 叙事卡画出 L3 解析 Agent 全貌……'
  const files = collectDeliverables(reply, card, 8)
  assert.deepEqual(files, [
    'draw-code/l3-解析-agent-喂什么-做什么-出什么-l4-mu9j2r4n.html',
    'draw-code/l3-解析-agent-喂什么-做什么-出什么-l4-mu9j2r4n.narrative.json',
  ])
})

test('CJK relative branch requires a dir segment (prose-glue guard)', () => {
  // 纯正文（无 /）不进 CJK 分支：前缀不粘连、裸中文文件名不误切
  assert.deepEqual(splitPathSegments('见图 diagram.png，详见说明').filter((s) => s.type === 'file').map((s) => s.value), ['diagram.png'])
  assert.deepEqual(splitPathSegments('报告report.pdf 已归档').filter((s) => s.type === 'file').map((s) => s.value), ['report.pdf'])
  // 裸中文文件名（无目录）保持不支持——宁可漏不可错切（正文歧义）
  assert.deepEqual(splitPathSegments('产物是 解析全景.html，已交付').filter((s) => s.type === 'file').map((s) => s.value), [])
  // ASCII 相对路径行为完全不变
  assert.deepEqual(splitPathSegments('代码在 src/index.ts').filter((s) => s.type === 'file').map((s) => s.value), ['src/index.ts'])
})

test('splitPathSegments url branch stops at full-width punctuation too', () => {
  const segs = splitPathSegments('文档见 https://example.com/docs/page（第二节）与下文')
  const url = segs.find((s) => s.type === 'url')
  assert.ok(url)
  assert.equal(url.value, 'https://example.com/docs/page')
})

test('splitPathSegments keeps CJK folder paths and mac-style paren filenames chippable', () => {
  const segs = splitPathSegments('输出到 /Users/demo/汇总目录，再看 /Users/demo/Copy(2).png 两个位置')
  const files = segs.filter((s) => s.type === 'file')
  assert.deepEqual(files.map((f) => f.value), ['/Users/demo/汇总目录', '/Users/demo/Copy(2).png'])
})

