/**
 * dsh-concise host 单测（node:test，零依赖 mock ctx）。
 * 覆盖：双 section 注册与门控、0.8.0 措辞口径、API toggle/set、LRU 冗余优先淘汰。
 * 运行：node --test test/
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

function makeEnv() {
  process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'dsh-concise-test-'))
}

function mockCtx() {
  const sections = []
  const commands = []
  const listeners = {}
  let apiHandler = null
  const ctx = {
    systemPrompt: { section: (s) => { sections.push(s); return () => {} } },
    commands: { register: (c) => { commands.push(c); return () => {} } },
    // ctx.inject 回调模式：服务可用即触发（mock 里立即可用，捕获 API handler）
    inject: (deps, cb) => {
      if (deps.includes('webServer')) cb({ webServer: { register: (spec) => { apiHandler = spec.handler; return () => {} } } })
      return {}
    },
    on: (event, listener) => {
      listeners[event] = listener
      return () => { delete listeners[event] }
    },
    logger: {},
    effect: (fn) => { fn() },
  }
  return { ctx, sections, commands, listeners, api: () => apiHandler }
}

async function callApi(handler, method, url, body) {
  const chunks = body === undefined ? [] : [JSON.stringify(body)]
  const req = { method, url, on: (event, cb) => { if (event === 'data') chunks.forEach((c) => cb(c)); if (event === 'end') cb() } }
  let status = null
  let payload = null
  const res = { writeHead: (code) => { status = code }, end: (b) => { payload = JSON.parse(b) } }
  await handler(req, res)
  return { status, payload }
}

const readState = () => JSON.parse(readFileSync(join(process.env.DSH_HOME, 'dsh-concise', 'state.json'), 'utf8'))

test('registers style + reminder sections with per-session gating', async () => {
  makeEnv()
  const { ctx, sections, api } = mockCtx()
  const { apply } = await import('../lib/index.js')
  apply(ctx)
  const names = sections.map((s) => s.name)
  assert.deepEqual(names, ['dsh-concise:style', 'dsh-concise:reminder'])
  assert.equal(sections[0].order, 40)
  assert.equal(sections[1].order, 900)
  // 默认关闭（无 state.json）→ 空串被渲染层丢弃
  assert.equal(sections[0].text({ agent: { session: { id: 's1' } } }), '')
  assert.equal(sections[1].text({ agent: { session: { id: 's1' } } }), '')
  // 打开 default → 两个 section 都下发
  await callApi(api(), 'POST', '/dsh-concise/api/toggle', {})
  const style = sections[0].text({ agent: { session: { id: 's1' } } })
  const reminder = sections[1].text({ agent: { session: { id: 's1' } } })
  assert.match(style, /user-facing final reply/)
  assert.doesNotMatch(style, /every reply, no exceptions/)
  assert.match(style, /\*\*摘要：\*\*/)
  // 0.8.1：长解释型回复是已实证的失效模式（L4 会话 seq388/464），style 与 reminder 都必须点名
  assert.match(style, /Length and structure are NOT exemptions/)
  assert.match(style, /long explanation replies/)
  assert.match(style, /Task-completion reports/)
  // 0.11.0：摘要卡书写风格（caveman × humanizer 精华）——结论前置 + 电报体密度 + 去 AI 套话
  assert.match(style, /Digest content style \(caveman × humanizer\)/)
  assert.match(style, /first sentence IS the conclusion/)
  assert.match(style, /rule-of-three/)
  assert.match(style, /不是X而是Y/)
  assert.match(style, /vague attribution/)
  assert.match(reminder, /REMINDER \(Concise output style\)/)
  assert.match(reminder, /摘要 digest blockquote/)
  // 0.8.3 自检清单式 reminder：点名交付汇报型与长解释型两大失效模式
  assert.match(reminder, /SELF-CHECK/)
  assert.match(reminder, /NEVER carries to the final reply/)
  assert.match(reminder, /Task-completion reports and long explanations/)
  // 0.10.0：拍板提问型回复点名（最常漏摘要的场景）
  assert.match(style, /ask_user_question/)
  assert.match(reminder, /ask_user_question/)
  // 0.10.0：上一条回复缺摘要 → style 最开头插首屏警告
  const missCtx = { agent: { session: { id: 's1', deriveMessages: () => [{ role: 'assistant', content: [{ type: 'text', text: '## 全部完成' }] }] } } }
  const styleMiss = sections[0].text(missCtx)
  assert.ok(styleMiss.startsWith('⚠️ COMPLIANCE ALERT'), 'banner prepended to style on miss')
  assert.ok(styleMiss.indexOf('COMPLIANCE ALERT') < styleMiss.indexOf('lead with the result'), 'banner before style body')
  // 干净回复 → 无 banner
  const cleanCtx = { agent: { session: { id: 's1', deriveMessages: () => [{ role: 'assistant', content: [{ type: 'text', text: '> **摘要：** ok' }] }] } } }
  assert.doesNotMatch(sections[0].text(cleanCtx), /COMPLIANCE ALERT/)
})

test('LRU evicts redundant-default entries first, preserves explicit user intent', async () => {
  makeEnv()
  const { ctx, api } = mockCtx()
  const { apply } = await import('../lib/index.js')
  apply(ctx)
  // 先把 default 翻为 true：此时 enabled:true 是冗余条目、enabled:false 是显式用户意图
  await callApi(api(), 'POST', '/dsh-concise/api/toggle', {})
  // 写入 502 个 enabled:true 条目（冗余）
  for (let i = 0; i < 502; i++) {
    const r = await callApi(api(), 'POST', '/dsh-concise/api/set', { sessionId: 'session-tmp-' + i, enabled: true })
    assert.equal(r.status, 200)
  }
  // 5 个会话显式关闭（用户意图）
  for (let i = 0; i < 5; i++) {
    await callApi(api(), 'POST', '/dsh-concise/api/set', { sessionId: 'session-off-' + i, enabled: false })
  }
  const state = readState()
  assert.ok(Object.keys(state.sessions).length <= 500, 'cap enforced')
  for (let i = 0; i < 5; i++) {
    assert.equal(state.sessions['session-off-' + i]?.enabled, false, 'explicit-off survives eviction')
  }
  await callApi(api(), 'POST', '/dsh-concise/api/toggle', { sessionId: 'session-tmp-501' })
})

test('legacy 说人话 digest prefix is accepted by client matcher regex', async () => {
  // client MATCHER 与 lib 内联正则保持一致的契约测试
  const MARK_RE = /^(摘要：|说人话：)/
  assert.ok(MARK_RE.test('摘要： 结论如下'))
  assert.ok(MARK_RE.test('说人话： 老会话输出'))
  assert.ok(!MARK_RE.test('普通引用： 不打卡片'))
  assert.ok(!MARK_RE.test('摘要'))
})

test('verify-paths filters nonexistent example paths, keeps real ones (v0.10.1)', async () => {
  makeEnv()
  const { ctx, api } = mockCtx()
  const { apply } = await import('../lib/index.js')
  apply(ctx)
  await callApi(api(), 'POST', '/toggle', {})
  const stateAbs = join(process.env.DSH_HOME, 'dsh-concise', 'state.json')
  const r = await callApi(api(), 'POST', '/verify-paths', {
    paths: [stateAbs, 'no-such-example-xyz.png', 'package.json', 'package.json', 'x.png'],
  })
  assert.equal(r.status, 200)
  // stateAbs = 绝对路径存在；package.json = 相对 cwd（测试进程）存在；其余（示例假路径）过滤
  assert.deepEqual(r.payload.existing, [stateAbs, 'package.json'])
  // v0.10.2：resolved 回传解析出的绝对路径（点击打开的直接依据）
  assert.equal(r.payload.resolved[stateAbs], stateAbs)
  assert.equal(r.payload.resolved['package.json'], join(process.cwd(), 'package.json'))
  assert.equal(r.payload.resolved['no-such-example-xyz.png'], undefined)
  // 超量拒绝（fail loud）
  const tooMany = await callApi(api(), 'POST', '/verify-paths', { paths: Array.from({ length: 33 }, (_, i) => 'f' + i + '.txt') })
  assert.equal(tooMany.status, 400)
})

test('verify-paths resolves recursive-only relative paths to absolute (v0.10.2 click-open fix)', async () => {
  makeEnv()
  const { ctx, api } = mockCtx()
  const { apply } = await import('../lib/index.js')
  apply(ctx)
  // 复刻用户实测失效形态：相对路径从任何候选 cwd 直连都拼不出来，但 basename 在候选 cwd 树下
  // 真实存在（test/host.test.mjs）。0.10.1 只回 existing（chip 能渲染）而丢弃找到的路径 →
  // 点击直连全 400 → 降级复制；0.10.2 起 resolved 回传递归解析出的绝对路径，点击即可打开。
  const r = await callApi(api(), 'POST', '/verify-paths', {
    paths: ['no-such-dir-xyz/host.test.mjs', 'draw-code/e2e-really-missing.png'],
  })
  assert.equal(r.status, 200)
  assert.deepEqual(r.payload.existing, ['no-such-dir-xyz/host.test.mjs'])
  assert.equal(r.payload.resolved['no-such-dir-xyz/host.test.mjs'], join(process.cwd(), 'test', 'host.test.mjs'))
  assert.equal(r.payload.resolved['draw-code/e2e-really-missing.png'], undefined)
})

test('isDigestMissing: detects missing/clean/fresh/unjudgeable session shapes', async () => {
  makeEnv()
  const { isDigestMissing, DIGEST_MARK } = await import('../lib/index.js')
  assert.equal(DIGEST_MARK, '> **摘要：**')
  // 缺摘要（交付汇报型开场）→ true
  assert.equal(isDigestMissing({ id: 'a', deriveMessages: () => [{ role: 'assistant', content: [{ type: 'text', text: '全部完成：交付物如下。' }] }] }), true)
  // 以摘要块开头（含前置空白）→ false
  assert.equal(isDigestMissing({ id: 'b', deriveMessages: () => [{ role: 'assistant', content: [{ type: 'text', text: '  > **摘要：** 结论在前。' }] }] }), false)
  // 多 content 块拼接后判定 → false
  assert.equal(isDigestMissing({ id: 'c', deriveMessages: () => [{ role: 'assistant', content: [{ type: 'text', text: '>' }, { type: 'text', text: ' **摘要：** ok' }] }] }), false)
  // v0.10.5：首轮无 assistant 历史 → false（无先前最终回复可判，误告警即告警疲劳源头；
  // style 段的 MANDATORY 契约不依赖警告，全程有效）
  assert.equal(isDigestMissing({ id: 'd', deriveMessages: () => [] }), false)
  // 最后一条是 user（assistant 在更早）→ 只看最后一条「无 tool-call 的 assistant」
  assert.equal(isDigestMissing({ id: 'e', deriveMessages: () => [
    { role: 'assistant', content: [{ type: 'text', text: '> **摘要：** ok' }] },
    { role: 'user', content: [{ type: 'text', text: '继续' }] },
  ] }), false)
  // v0.10.5 工具环判别：最后一条 assistant 带 tool-call（回合中途）→ 跳过它，看更早的最终回复
  assert.equal(isDigestMissing({ id: 'h', deriveMessages: () => [
    { role: 'assistant', content: [{ type: 'text', text: '全部完成：交付物如下。' }] },
    { role: 'user', content: [{ type: 'tool-result', text: 'ok' }] },
    { role: 'assistant', content: [{ type: 'text', text: '收到，定位中' }, { type: 'tool-call', callId: 'c1' }] },
    { role: 'user', content: [{ type: 'tool-result', text: 'ok' }] },
  ] }), true, 'intermediate tool-call messages must not mask the previous final reply miss')
  assert.equal(isDigestMissing({ id: 'i', deriveMessages: () => [
    { role: 'assistant', content: [{ type: 'text', text: '> **摘要：** ok' }] },
    { role: 'user', content: [{ type: 'tool-result', text: 'ok' }] },
    { role: 'assistant', content: [{ type: 'tool-call', callId: 'c1' }] },
    { role: 'user', content: [{ type: 'tool-result', text: 'ok' }] },
  ] }), false, 'compliant final reply stays compliant across mid-turn tool loops')
  // 纯工具环（无任何纯文本 assistant）→ false（无最终回复可判）
  assert.equal(isDigestMissing({ id: 'j', deriveMessages: () => [
    { role: 'assistant', content: [{ type: 'tool-call', callId: 'c1' }] },
    { role: 'user', content: [{ type: 'tool-result', text: 'ok' }] },
  ] }), false)
  // 不可判形态：无 session / 无 deriveMessages / 抛异常 → false（不告警不阻断）
  assert.equal(isDigestMissing(undefined), false)
  assert.equal(isDigestMissing(null), false)
  assert.equal(isDigestMissing({ id: 'f' }), false)
  assert.equal(isDigestMissing({ id: 'g', deriveMessages: () => { throw new Error('boom') } }), false)
})

test('reminder section embeds compliance warning when previous final reply missed the digest', async () => {
  makeEnv()
  const { ctx, sections, api } = mockCtx()
  const { apply } = await import('../lib/index.js')
  apply(ctx)
  await callApi(api(), 'POST', '/toggle', {})
  const reminder = sections[1]
  const context = { agent: { session: { id: 'session-w1', deriveMessages: () => [{ role: 'assistant', content: [{ type: 'text', text: '## 全部完成' }] }] } } }
  const warned = reminder.text(context)
  assert.match(warned, /REMINDER \(Concise output style\)/)
  assert.match(warned, /COMPLIANCE WARNING/)
  assert.ok(warned.indexOf('REMINDER') < warned.indexOf('COMPLIANCE WARNING'), 'warning appended after reminder')
  // 干净回复 → 只有 reminder，无警告
  const clean = { agent: { session: { id: 'session-w2', deriveMessages: () => [{ role: 'assistant', content: [{ type: 'text', text: '> **摘要：** ok' }] }] } } }
  assert.doesNotMatch(reminder.text(clean), /COMPLIANCE WARNING/)
  // 开关关闭 → 空串（门控优先）
  await callApi(api(), 'POST', '/set', { sessionId: 'session-w3', enabled: false })
  const offCtx = { agent: { session: { id: 'session-w3', deriveMessages: () => [] } } }
  assert.equal(reminder.text(offCtx), '')
})
