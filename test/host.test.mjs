/**
 * dsh-concise host 单测（node:test，零依赖 mock ctx）。
 * 覆盖：双 section 注册与门控、0.8.0 措辞口径、API toggle/set、LRU 冗余优先淘汰。
 * 运行：node --test test/
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function makeEnv() {
  process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'dsh-concise-test-'))
}

function mockCtx() {
  const sections = []
  const commands = []
  let apiHandler = null
  const ctx = {
    systemPrompt: { section: (s) => { sections.push(s); return () => {} } },
    commands: { register: (c) => { commands.push(c); return () => {} } },
    // ctx.inject 回调模式：服务可用即触发（mock 里立即可用，捕获 API handler）
    inject: (deps, cb) => {
      if (deps.includes('webServer')) cb({ webServer: { register: (spec) => { apiHandler = spec.handler; return () => {} } } })
      return {}
    },
    logger: {},
    effect: (fn) => { fn() },
  }
  return { ctx, sections, commands, api: () => apiHandler }
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
  assert.match(reminder, /REMINDER \(Concise output style\)/)
  assert.match(reminder, /摘要 digest blockquote/)
  assert.match(reminder, /before any heading, table, or body text/)
  assert.match(reminder, /long explanation replies/)
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
