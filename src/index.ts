/**
 * dsh-concise host：
 * 1) 注册系统提示词 section（dsh-concise:style）——text 为函数，每次模型组装时按"当前会话"的开关状态求值；
 *    关闭时返回空串，渲染层自动丢弃该 section（对 prompt 的增删即时生效）。
 * 2) 会话级状态：每个会话独立开关，互不影响；新会话取 default（config defaultEnabled）。
 * 3) 本地 HTTP API（/dsh-concise/api）：GET /state、POST /toggle、POST /set，均支持 sessionId。
 * 4) host 命令 `/concise [on|off|status]`：作用于当前会话。
 * 5) 状态持久化：$DSH_HOME（缺省 ~/.dsh）/dsh-concise/state.json，原子写（tmp + rename），跨重启保留。
 * 6) 自定义风格：$DSH_HOME/dsh-concise/style.md 存在时覆盖内置文本（按 mtime 缓存，改完下轮生效）。
 *
 * 风格定义对齐 Claude Code 内置 "Concise" output style：
 * 「Claude leads with results and skips preamble and narration, while doing the work just as thoroughly.」
 */
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import z from '@deepseek-ai/schemastery'

/** Cordis plugin name. */
export const name = 'dsh-concise'

/** Required services: the system prompt registry and the host command registry.
 *  webServer 不列入 inject：headless/CLI 等 profile 没有该服务，硬性等待会导致插件永远 pending。
 *  apply() 内对 ctx.webServer 做防御性判空（缺失时仅降级 API，风格注入不受影响）。 */
export const inject = ['systemPrompt', 'commands']

/** Runtime schema（预留扩展位；当前无必填配置）。 */
export const Config = z.object({
  /** 新会话的默认状态（默认关闭，与 Claude Code 默认输出风格一致）。 */
  defaultEnabled: z.boolean().default(false),
})

export type ConfigType = { defaultEnabled?: boolean }

/** Concise 输出风格正文：注入 system prompt 的实际内容（无 style.md 覆盖时使用）。 */
export const CONCISE_STYLE_TEXT = [
  'Concise output style (active): lead with the result. Put the answer, the decision, or the finished artifact in the first sentence or two; explanation follows only as needed.',
  '- MANDATORY on every user-facing final reply (the reply that ends the turn and answers the user — intermediate step narration between tool calls is exempt): BEGIN with the digest block in EXACTLY this blockquote format, then continue with the normal answer:\n> **摘要：** <2-3 plain, jargon-free sentences restating this turn\'s conclusion, with the 2-4 key words or numbers bolded via **…**>\nThe digest may ONLY restate conclusions already present in the reply body — never introduce facts, trade-offs, or analogies the body does not contain; give any unavoidable term a short plain-language gloss in parentheses. However short the answer, the digest block is always present (it is not a recap — it precedes the answer).\nLength and structure are NOT exemptions: long explanation replies, step-by-step walkthroughs, and table-heavy documents are where the digest gets skipped most often — such replies must still OPEN with the digest block, before any heading, table, or body text.\nURLs, file paths, and code spans stay bare in the digest (or use [label](url) markdown) — bold (**) is for words and numbers only; bolding a URL corrupts the rendered link.\nTask-completion reports (openers like 全部完成 / 已实施 / 方案已落盘 / 交付物清单) are NOT a substitute for the digest — such replies MUST still BEGIN with the digest block.\nA heading opener like ## 结论 / ## 方案 is also NOT the digest — the digest block precedes any heading, however the reply is structured. A digest blockquote buried mid-reply (e.g. after an opening paragraph or table) is still a violation — the digest must be the very first non-empty line of the reply.',
  '- Monitoring / progress-broadcast replies (openers like 【进度】 / 账目对上了 / 确认无误 / 明白) and 账目 / 清单 / 最终汇总 summaries are user-facing final replies too: a short confirmation is NOT an exemption — the digest block still opens the reply (third most-skipped family, measured in long device-driving sessions).',
  '- Digest content style (caveman × humanizer): the first sentence IS the conclusion — the answer, the decision, or the finished artifact, never background or process recap. Keep only facts and numbers, compressed telegraphically (pleasantries and connective filler cut). NO empty-summary phrases (综上所述 / in summary), NO rule-of-three parallelism, NO 「不是X而是Y」 rhetorical framing, NO vague attribution (专家认为 / experts say), NO inflated significance (标志着 / 赋能 / milestone). Call each thing by ONE name and mention it ONCE — never state anything the body does not prove.',
  '- Never open by restating the question or with pleasantries ("Sure", "Great question", "好的", "当然可以") — the first line is already the answer or the key finding.',
  '- Skip filler closers: no recap of what you just did, no "In summary" restating the response, no boilerplate apologies or hedges, no closing offers ("需要我…吗？") unless a decision is genuinely required.',
  '- For enumerable facts prefer a table or a tight list over paragraphs — structure is not verbosity; compact and structured beats long and prosy.',
  '- Keep every load-bearing detail: constraints, risks, exact commands, file paths, and next actions are content, not filler — compress wording, never omit substance.',
  '- No narration between steps: report what changed, not what you are about to do ("Let me check...", "I\'ll now...").',
  '- Thoroughness of the work is unchanged: investigate, verify, and double-check exactly as you otherwise would; only the reporting is compressed.',
  '- When you made a choice, state it with a one-line reason; surface alternatives only when they are viable and materially different.',
  "- Replies that end by asking the user a question or requesting a decision (e.g. via the ask_user_question tool) are user-facing final replies too - the question panel does NOT exempt the text: they MUST still OPEN with the digest block. This is the most-skipped case in practice.",
  '- Skill-driven delivery talk-tracks (openers like 「交付：…」「图已生成…」「报告如下」, artifact-path lists from draw-code / archify / HTML 工坊 etc.) are ALSO user-facing final replies - a skill template orders its content AFTER the digest block and never replaces or postpones it: OPEN with the digest block first, then follow the skill template. This is the second most-skipped case in practice.',
].join('\n')

/** Prompt section 名（同层重名会冲突，带插件前缀）。 */
const SECTION_NAME = 'dsh-concise:style'
/** Persona=0 之后、越靠前模型越早读到；40 安全避开 harness(-100)/persona(0)。 */
const SECTION_ORDER = 40
/** 尾部提醒 section：system prompt 末尾再敲一次「最终回复必附摘要」，对冲长 prompt 下的遵循衰减。 */
const REMINDER_SECTION_NAME = 'dsh-concise:reminder'
const REMINDER_SECTION_ORDER = 900
const REMINDER_TEXT = 'REMINDER (Concise output style): before ending this turn, SELF-CHECK the final user-facing text block - its first characters must be the 摘要 digest blockquote exactly as defined in the Concise output style section above. Intermediate step narration between tool calls stays exempt, but the exemption NEVER carries to the final reply: after the last tool call, restart the digest discipline. Task-completion reports and long explanations are the most common violations, and replies that end with a user-facing question/decision prompt (ask_user_question) or that follow a skill delivery template (「交付：…」「图已生成…」 openers from draw-code etc.) are equally NOT exempt - the skill template comes after the digest block. Short monitoring/进度 confirmations (明白 / 确认无误 / 【进度】) and 账目/清单 summaries count as final replies too.'
// v0.10.0 的静态 DIGEST_MISS_BANNER / MISS_WARNING 常量在 0.11.1 升级为 missAlert() 构造器
// （见 apply() 内）：泛化警告在 80K+ system prompt 的监控型会话被模型持续无视（实测「autofill 打点」
// 会话 9 次漏卡中 7 次警告在场仍漏）——0.11.1 起警告点名违规回复的开场原句并按连击升级。

/** 会话条目上限：超出时按最近使用淘汰，防 state.json 无界增长。 */
const MAX_SESSION_ENTRIES = 500

interface SessionEntry {
  enabled: boolean
  at: number
}

interface StateStore {
  /** 新会话默认状态（无会话上下文的组装、以及不带 sessionId 的 API 调用落到这里）。 */
  default: boolean
  /** 每会话覆盖。 */
  sessions: Record<string, SessionEntry>
}

function pluginDir(): string {
  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(dshHome, 'dsh-concise')
}

function stateFile(): string {
  return join(pluginDir(), 'state.json')
}

/** 自定义风格文件：存在且非空时覆盖内置文本（对齐 Claude Code /output-style:new 的自定义能力）。 */
function styleFile(): string {
  return join(pluginDir(), 'style.md')
}

function loadState(defaultEnabled: boolean): StateStore {
  try {
    const raw = JSON.parse(readFileSync(stateFile(), 'utf8')) as {
      default?: unknown
      enabled?: unknown
      sessions?: Record<string, unknown>
    }
    const sessions: Record<string, SessionEntry> = {}
    for (const [sid, value] of Object.entries(raw.sessions ?? {})) {
      if (typeof value === 'boolean') {
        sessions[sid] = { enabled: value, at: 0 }
        continue
      }
      if (value && typeof value === 'object' && typeof (value as SessionEntry).enabled === 'boolean') {
        sessions[sid] = { enabled: (value as SessionEntry).enabled === true, at: Number((value as SessionEntry).at) || 0 }
      }
    }
    return {
      // 0.2.0 旧格式的 enabled 字段迁移为 default
      default: raw.default === true || (raw.default === undefined && raw.enabled === true),
      sessions,
    }
  } catch {
    return { default: defaultEnabled === true, sessions: {} }
  }
}

function saveState(state: StateStore): void {
  // 淘汰最旧的会话条目，防无界增长；先淘汰与 default 同值的冗余条目，
  // 显式翻转过用户意图的条目（enabled ≠ default）尽量保留，避免静默回退到默认态
  const entries = Object.entries(state.sessions)
  if (entries.length > MAX_SESSION_ENTRIES) {
    const byOldest = (a: [string, SessionEntry], b: [string, SessionEntry]): number => (a[1].at || 0) - (b[1].at || 0)
    const meaningful = entries.filter(([, v]) => v.enabled !== state.default).sort(byOldest).slice(0, MAX_SESSION_ENTRIES)
    const room = MAX_SESSION_ENTRIES - meaningful.length
    const redundant = room > 0 ? entries.filter(([, v]) => v.enabled === state.default).sort(byOldest).slice(0, room) : []
    state.sessions = Object.fromEntries(meaningful.concat(redundant))
  }
  const file = stateFile()
  mkdirSync(dirname(file), { recursive: true })
  const tmp = file + '.tmp-' + process.pid
  writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8')
  renameSync(tmp, file)
}

/** style.md 的 mtime 缓存：文件未变时不重复读盘，改完保存即在下一次组装生效。 */
let styleCache: { mtimeMs: number; text: string | null } = { mtimeMs: 0, text: null }

function customStyleText(): string | null {
  try {
    const mtimeMs = statSync(styleFile()).mtimeMs
    if (mtimeMs === styleCache.mtimeMs) return styleCache.text
    const raw = readFileSync(styleFile(), 'utf8').trim()
    styleCache = { mtimeMs, text: raw.length > 0 ? raw : null }
    return styleCache.text
  } catch {
    if (styleCache.text !== null) styleCache = { mtimeMs: 0, text: null }
    return null
  }
}

/** 当前生效的风格正文与来源（built-in = 内置；custom = style.md 覆盖）。 */
function activeStyle(): { text: string; source: 'built-in' | 'custom' } {
  const custom = customStyleText()
  return custom === null
    ? { text: CONCISE_STYLE_TEXT, source: 'built-in' }
    : { text: custom, source: 'custom' }
}

/**
 * 用 OS 默认应用打开路径（文件或目录）：macOS open / Windows start / Linux xdg-open。
 * spawn detached 不阻塞；失败抛出（调用方自行降级）。
 */
function openWithDefaultApp(path: string): void {
  const opts = { detached: true, stdio: 'ignore' } as const
  if (process.platform === 'darwin') spawn('open', [path], opts).unref()
  else if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', path], { ...opts, windowsVerbatimArguments: true }).unref()
  else spawn('xdg-open', [path], opts).unref()
}

/** 校验 open 目标：绝对路径 + 存在。非法返回 null。 */
function validateOpenTarget(path: string): string | null {
  if (typeof path !== 'string' || path.length === 0 || path.length > 1024) return null
  if (path.includes(' ') || !path.startsWith('/')) return null
  return existsSync(path) ? path : null
}

interface RouteRequest {
  method?: string
  url?: string
  headers?: Record<string, string | string[] | undefined>
  on: (event: string, fn: (chunk: unknown) => void) => void
}
interface RouteResponse {
  writeHead: (code: number, headers: Record<string, string>) => void
  end: (body: string) => void
}
interface WebServerLike {
  register: (spec: { kind: 'prefix'; path: string; handler: (req: RouteRequest, res: RouteResponse) => void | Promise<void> }) => () => void
}
interface SystemPromptLike {
  section: (section: { name: string; order: number; text: string | ((context?: unknown) => string) }) => () => void
}
interface CommandInvocation {
  rawInput: string
  agent?: { session?: { id?: unknown } }
}
interface CommandsLike {
  register: (command: {
    name: string
    description: string
    input?: { hint?: string; images?: boolean }
    handler: (invocation: CommandInvocation) => { kind: 'success' | 'error'; text: string }
  }) => () => void
}
/** Minimal duck type of the live session object reachable from assemble context. */
interface SessionLike {
  id: unknown
  header?: { cwd?: string }
  deriveMessages?: () => unknown
}
/** 摘要块起始标记（生成契约口径：措辞要求模型精确输出的形态）。 */
export const DIGEST_MARK = '> **摘要：**'

/**
 * 摘要块「检测」正则（host 判定口径）——必须与 client MARK_RE（blockquote textContent 前缀
 * /^(摘要：|说人话：)/）渲染口径同源：client 渲染成卡的形态 = blockquote 行以可选粗体的
 * 摘要：/说人话： 开头。0.11.0 及之前 host 只认严格 '> **摘要：**'，会把 client 已渲染成卡的
 * 变体（'> 摘要：…'、'> **说人话：**…'）误判为缺卡 → 误告警（实测「autofill 打点」会话 t0 即说人话卡）。
 */
export const DIGEST_DETECT_RE = /^>\s*\*{0,2}(?:摘要|说人话)\*{0,2}[：:]/

/** 上一条最终回复的摘要判定结论。indeterminate = 上下文不可判（无 session/deriveMessages/异常/首轮）。 */
export type DigestVerdict = 'ok' | 'misplaced' | 'missing' | 'indeterminate'
export interface DigestFinding {
  verdict: DigestVerdict
  /** missing/misplaced 时：违规最终回复的首行（截 80 字符），供警告点名引用。 */
  opener?: string
  /** missing/misplaced 时：整条回复的稳定签名（长度+首行）——miss 连击按签名去重计数。 */
  sig?: string
}

/**
 * 判定会话派生历史里「最后一条最终回复」的摘要合规性（纯函数，供 section 求值与单测共用）。
 * 向前找「最后一条不含 tool-call 块的 assistant 消息」= 最后一条最终回复（0.10.5 口径：回合中途的
 * 工具环消息不是 user-facing final reply，把它们当最终回复判定会让 miss 警告在 agentic 会话常驻）。
 * ok = 以摘要块开头（含可选粗体/说人话变体，渲染口径见 DIGEST_DETECT_RE）；
 * misplaced = 摘要块存在但不在第一行（卡片有渲染，但契约要求 digest 先于一切）；
 * missing = 没有任何摘要块；indeterminate = 无先前最终回复或上下文不可判（不告警不阻断组装）。
 */
export function digestFinding(session: SessionLike | undefined | null): DigestFinding {
  if (!session || typeof session.deriveMessages !== 'function') return { verdict: 'indeterminate' }
  try {
    const msgs = (session.deriveMessages() ?? []) as Array<{ role?: string; content?: Array<{ type?: string; text?: string }> }>
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i]
      if (m?.role !== 'assistant') continue
      const content = m.content ?? []
      if (content.some((c) => c.type === 'tool-call' || c.type === 'tool_use' || c.type === 'toolCalls')) continue
      const lastFinal = content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
      const trimmed = lastFinal.trimStart()
      if (DIGEST_DETECT_RE.test(trimmed)) return { verdict: 'ok' }
      const opener = (trimmed.split('\n').find((l) => l.trim().length > 0) ?? '').trim().slice(0, 80)
      const sig = String(trimmed.length) + '|' + opener
      if (trimmed.length === 0) return { verdict: 'missing', sig }
      if (trimmed.split('\n').some((l) => DIGEST_DETECT_RE.test(l.trimStart()))) {
        return { verdict: 'misplaced', opener, sig }
      }
      return { verdict: 'missing', opener, sig }
    }
    return { verdict: 'indeterminate' }
  } catch {
    return { verdict: 'indeterminate' }
  }
}

/** 兼容口径：缺摘要（missing 或 misplaced 都算违反「digest 必须第一行」契约）。不可判 → false。 */
export function isDigestMissing(session: SessionLike | undefined | null): boolean {
  const v = digestFinding(session).verdict
  return v === 'missing' || v === 'misplaced'
}

interface HostContext {
  systemPrompt?: SystemPromptLike
  commands?: CommandsLike
  logger?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void; error?: (...args: unknown[]) => void }
  effect: (fn: () => unknown | (() => void), label?: string) => void
  /** cordis registry：服务可用时才执行回调（可选服务装配；headless 下 webServer 永不出现、回调不触发）。 */
  inject: (deps: string[], callback: (scoped: { webServer: WebServerLike }) => unknown) => unknown
}

/** 从模型组装上下文 / 命令调用里提取会话 id（对齐 dsh-plan-mode 的 context.agent.session 访问路径）。 */
function sessionIdOf(source: unknown): string | null {
  const sid = (source as { agent?: { session?: { id?: unknown } } } | undefined)?.agent?.session?.id
  return typeof sid === 'string' && sid.length > 0 && sid.length <= 512 ? sid : null
}

/** v0.10.0：node:zlib 的 zstdDecompressSync（Node >= 22.15）。不可用返回 null（磁盘兜底自动降级）。 */
let zstdDecompressSyncFn: ((b: Buffer) => Buffer) | null | undefined
async function zstdFn(): Promise<((b: Buffer) => Buffer) | null> {
  if (zstdDecompressSyncFn !== undefined) return zstdDecompressSyncFn
  try {
    const z = (await import('node:zlib')) as unknown as { zstdDecompressSync?: (b: Buffer) => Buffer }
    zstdDecompressSyncFn = typeof z.zstdDecompressSync === 'function' ? z.zstdDecompressSync.bind(z) : null
  } catch { zstdDecompressSyncFn = null }
  return zstdDecompressSyncFn
}

/** 从会话转写首行 JSON 解出 cwd；文件超 8MB 跳过（兜底路径，不做增量索引）。 */
function parseCwdFromSessionFile(file: string, decompress: (b: Buffer) => Buffer): string | null {
  try {
    if (statSync(file).size > 8 * 1024 * 1024) return null
    const buf = decompress(readFileSync(file))
    const nl = buf.indexOf(10)
    const first = JSON.parse(buf.subarray(0, nl > 0 ? nl : buf.length).toString('utf8')) as { cwd?: unknown }
    const cwd = first?.cwd
    return typeof cwd === 'string' && cwd.startsWith('/') ? cwd : null
  } catch { return null }
}

/** 无缓存可用的会话（如插件重装后查看历史消息）：按 mtime 取最近 count 个会话转写解出 cwd 候选。 */
let recentSessionCwdsCache: { at: number; cwds: string[] } | null = null
/** 60s TTL：recentSessionCwds 需解压转写（数 MB），verify/cwd 高频调用不得反复解。 */
async function recentSessionCwdsCached(count: number): Promise<string[]> {
  if (recentSessionCwdsCache && Date.now() - recentSessionCwdsCache.at < 60_000) return recentSessionCwdsCache.cwds
  const cwds = await recentSessionCwdsUncached(count)
  recentSessionCwdsCache = { at: Date.now(), cwds }
  return cwds
}
async function recentSessionCwdsUncached(count: number): Promise<string[]> {
  try {
    const decompress = await zstdFn()
    if (!decompress) return []
    const base = process.env.DSH_HOME || join(homedir(), '.dsh')
    const root = join(base, 'sessions')
    const files: Array<{ file: string; mtime: number }> = []
    for (const grp of readdirSync(root)) {
      const grpDir = join(root, grp)
      let entries: string[] = []
      try { entries = readdirSync(grpDir) } catch { continue }
      for (const sid of entries) {
        const file = join(grpDir, sid, 'session.v3.jsonl.zstd')
        try { files.push({ file, mtime: statSync(file).mtimeMs }) } catch { continue }
      }
    }
    files.sort((a, b) => b.mtime - a.mtime)
    const out: string[] = []
    for (const f of files.slice(0, count)) {
      const cwd = parseCwdFromSessionFile(f.file, decompress)
      if (cwd) out.push(cwd)
    }
    return out
  } catch { return [] }
}

const WALK_SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.cache'])
/** cwd 直下不存在时按 basename 递归查找，返回找到的绝对路径（深度 4、条目预算 4000、跳依赖/构建目录）。 */
function findInDir(dir: string, base: string, budget: { n: number }, depth: number): string | null {
  if (depth > 4 || budget.n <= 0) return null
  let entries: string[] = []
  try { entries = readdirSync(dir) } catch { return null }
  for (const name of entries) {
    if (budget.n <= 0) return null
    budget.n -= 1
    const full = join(dir, name)
    let isDir = false
    try { isDir = statSync(full).isDirectory() } catch { continue }
    if (!isDir && name === base) return full
    if (isDir && !WALK_SKIP_DIRS.has(name) && !name.startsWith('.')) {
      const found = findInDir(full, base, budget, depth + 1)
      if (found) return found
    }
  }
  return null
}

/**
 * 解析出真实存在的绝对路径；找不到返回 null（v0.10.2）。
 * 相对路径先按 cwd 直解，找不到再按 basename 递归——递归命中的绝对路径必须回传调用方：
 * 0.10.1 只回 boolean、把找到的路径丢弃，导致「聚合区能渲染、点击只能复制」的不对称
 * （实测 draw-code/e2e-*.png 真身在 dsh-draw-code/draw-code/ 下，任何 cwd 直连都拼不出来）。
 */
async function resolveExistingPath(candidates: Set<string>, p: string): Promise<string | null> {
  if (p.startsWith('/')) return existsSync(p) ? p : null
  if (p.startsWith('~')) {
    const abs = join(homedir(), p.slice(1))
    return existsSync(abs) ? abs : null
  }
  const base = basename(p)
  for (const c of candidates) {
    const direct = c.replace(/\/?$/, '/') + p
    if (existsSync(direct)) return direct
  }
  for (const c of candidates) {
    const found = findInDir(c, base, { n: 4000 }, 0)
    if (found) return found
  }
  return null
}



function sessionIdLooksSafe(sessionId: string): boolean {
  return /^session-[A-Za-z0-9-]{1,120}$/.test(sessionId)
}

async function readJsonBody(req: RouteRequest): Promise<Record<string, unknown>> {
  const chunks: unknown[] = []
  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve())
    req.on('error', (error) => reject(error))
  })
  try {
    const text = chunks.map((c) => String(c)).join('')
    return text.length > 0 ? (JSON.parse(text) as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * 挂载 Concise 输出风格：提示词 section + 会话级开关 + API + host 命令 + 持久化。
 * @param ctx - host 根上下文。
 * @param config - 插件配置（defaultEnabled 决定新会话默认状态）。
 */
export function apply(ctx: HostContext, config: ConfigType = {}): void {
  const state = loadState(config.defaultEnabled ?? false)
  const log = ctx.logger ?? {}

  const isEnabled = (sessionId: string | null): boolean =>
    sessionId === null ? state.default : (state.sessions[sessionId]?.enabled ?? state.default)

  const setEnabled = (sessionId: string | null, enabled: boolean): void => {
    if (sessionId === null) {
      state.default = enabled
    } else {
      state.sessions[sessionId] = { enabled, at: Date.now() }
    }
    try {
      saveState(state)
    } catch (error) {
      log.warn?.('[dsh-concise] persist state failed: ' + String(error))
    }
  }

  // 1) 系统提示词 section：text 每次组装求值，按"正在组装的会话"取开关；关闭时空串被渲染层丢弃
  if (ctx.systemPrompt) {
    ctx.effect(() => ctx.systemPrompt!.section({
      name: SECTION_NAME,
      order: SECTION_ORDER,
      text: (context) => {
        const sid = sessionIdOf(context)
        if (!isEnabled(sid)) return ''
        // v0.10.0：上一条最终回复缺摘要 → 首屏警告插在最前（尾部 reminder 另有 WARNING 双保险）。
        // v0.11.1：警告点名违规回复的开场原句并按连击升级（0.10.5 实证泛化警告被无视）。
        const base = activeStyle().text
        const session = (context as { agent?: { session?: SessionLike } } | undefined)?.agent?.session
        const alert = missAlert(sid, digestFinding(session), 'banner')
        return alert !== null ? alert + '\n\n' + base : base
      },
    }), 'dsh-concise: prompt section')
    ctx.effect(() => ctx.systemPrompt!.section({
      name: REMINDER_SECTION_NAME,
      order: REMINDER_SECTION_ORDER,
      text: (context) => {
        const sid = sessionIdOf(context)
        if (!isEnabled(sid)) return ''
        // v0.9.2 miss 闭环：每轮组装在此求值（section 通道可达性经真机实证），检查上一条
        // 最终回复是否缺摘要；缺失（或首轮无 assistant 历史）时在尾部提醒后附合规警告。
        // v0.8.4 的 system-prompt/assemble waterfall 通道废弃：事件可达且判定正确（探针实证），
        // 但 assemble payload 形状是 { sections, tools, variables }，没有 system/developer 字符串，
        // appendWarning 静默丢弃警告（真机 web 从未生效；staging 通过系 mock 形状失真）。
        return REMINDER_TEXT + complianceWarning(context)
      },
    }), 'dsh-concise: reminder section')
  } else {
    log.warn?.('[dsh-concise] systemPrompt service missing — style injection disabled')
  }

  /** v0.11.1：miss 警告构造器——引用违规回复的开场原句 + 连击升级。
   *  连击按（会话, 回复签名）去重计数（同一回复在本回合多次组装求值不重复计数），合规即清零。
   *  内存态：进程重启清零可接受——警告是软反馈，不承载状态正确性。
   *  kind = banner（style 段最前，模型最先读到）/ warning（尾部 reminder 追加），双通道同一事实源。 */
  const missStreak = new Map<string, { sig: string; n: number }>()
  function missAlert(sid: string | null, finding: DigestFinding, kind: 'banner' | 'warning'): string | null {
    if (finding.verdict !== 'missing' && finding.verdict !== 'misplaced') {
      if (sid !== null) missStreak.delete(sid)
      return null
    }
    const sig = finding.sig ?? ''
    const prev = sid !== null ? missStreak.get(sid) : undefined
    const n = prev && prev.sig === sig ? prev.n : (prev?.n ?? 0) + 1
    if (sid !== null) missStreak.set(sid, { sig, n })
    const opener = finding.opener ? '「' + finding.opener + '」' : ''
    const core = finding.verdict === 'misplaced'
      ? 'your PREVIOUS final reply buried its 摘要 digest block mid-reply' + (opener ? ' after opening with ' + opener : '') + ' — a digest the user sees mid-text is not the contract; it must BE the first line'
      : opener
        ? 'your PREVIOUS final reply opened with ' + opener + ' and has NO 摘要 digest card'
        : 'your PREVIOUS final reply has NO 摘要 digest card'
    const repeat = n >= 2 ? ' REPEAT OFFENSE x' + n + ': consecutive final replies keep violating the first-line digest rule — break the pattern on THIS reply.' : ''
    if (kind === 'banner') {
      return '⚠️ COMPLIANCE ALERT: ' + core + '. THIS reply MUST BEGIN with "> **摘要：** ..." as its very first characters - before any heading, table, list, or body text. No exceptions.' + repeat
    }
    return 'COMPLIANCE WARNING: ' + core + '. THIS reply MUST begin with the digest block — no exceptions.' + repeat
  }

  /** 上一条最终回复缺摘要时返回追加到尾部提醒后的合规警告；无法判定返回空串。
   *  顺带刷新会话 cwd 缓存（每轮组装至少经过此处一次；v0.9.2 起这是 cwd 唯一刷新点）。 */
  function complianceWarning(context: unknown): string {
    try {
      const session = (context as { agent?: { session?: SessionLike } } | undefined)?.agent?.session
      const rawId = session?.id
      const sid = typeof rawId === 'function' ? String(rawId()) : typeof rawId === 'string' ? rawId : null
      const cwd = session?.header?.cwd
      if (sid !== null && typeof cwd === 'string' && cwd.length > 0) { cwdBySession.set(sid, cwd); lastKnownCwd = cwd }
      const finding = digestFinding(session)
      const alert = missAlert(sid, finding, 'warning')
      if (alert === null) return ''
      log.info?.('[dsh-concise] previous final reply violated the digest contract (' + finding.verdict + ') - compliance warning attached for session ' + (sid ?? ''))
      return '\n\n' + alert
    } catch {
      return ''
    }
  }


  // v0.8.7：会话 cwd 缓存（v0.9.2 起在 complianceWarning 每轮求值时从 session.header.cwd 刷新；
  // client chip 解析相对路径用）
  const cwdBySession = new Map<string, string>()
  let lastKnownCwd = ''

  // 2) host 命令 /concise：作用于当前会话
  if (ctx.commands) {
    ctx.effect(() => ctx.commands!.register({
      name: 'concise',
      description: 'toggle the Concise output style for this session (results first, no filler)',
      input: { hint: '[on|off|status]', images: false },
      handler: (invocation: CommandInvocation) => {
        const sid = sessionIdOf(invocation)
        const arg = invocation.rawInput.trim().toLowerCase()
        const statusText = (): string => {
          const style = activeStyle()
          return 'Concise output style: ' + (isEnabled(sid) ? 'ON' : 'OFF')
            + '\nScope: this session only'
            + '\nStyle source: ' + style.source + (style.source === 'custom' ? ' (' + styleFile() + ')' : '')
            + '\n\nToggle: /concise, /concise on, /concise off'
        }
        const flipText = (): { kind: 'success'; text: string } => ({
          kind: 'success',
          text: isEnabled(sid)
            ? 'Concise output style ENABLED for THIS session — replies lead with results and skip preamble/narration. Effective on the next turn.'
            : 'Concise output style DISABLED for THIS session — replies return to the model\'s natural style. Effective on the next turn.',
        })
        if (arg === '' || arg === 'toggle') {
          setEnabled(sid, !isEnabled(sid))
          log.info?.('[dsh-concise] session ' + (sid ?? 'default') + ' concise ' + (isEnabled(sid) ? 'enabled' : 'disabled'))
          return flipText()
        }
        if (arg === 'on' || arg === 'off') {
          setEnabled(sid, arg === 'on')
          log.info?.('[dsh-concise] session ' + (sid ?? 'default') + ' concise ' + (isEnabled(sid) ? 'enabled' : 'disabled'))
          return flipText()
        }
        if (arg === 'status') return { kind: 'success', text: statusText() }
        return { kind: 'error', text: 'Unknown argument: ' + arg + '\nUsage: /concise [on|off|status]' }
      },
    }), 'dsh-concise: /concise command')
  } else {
    log.warn?.('[dsh-concise] commands service missing — /concise command disabled')
  }

  // 3) 本地 HTTP API（client 按钮消费；仅本机回环）。带 sessionId 操作该会话，不带则操作新会话默认值。
  //    webServer 是可选服务（headless/CLI 等 profile 没有它）：用 ctx.inject 回调按需装配——
  //    服务可用才注册，永不 pending；随本插件 fiber 卸载即净。缺失时仅 API 降级（/concise 命令仍可用）。
  ctx.effect(() => ctx.inject(['webServer'], (scoped) => {
    const dispose = scoped.webServer.register({
      kind: 'prefix',
      path: '/dsh-concise/api',
      handler: async (req: RouteRequest, res: RouteResponse) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const path = url.pathname.replace(/^\/dsh-concise\/api/, '') || '/'
        const method = (req.method ?? 'GET').toUpperCase()
        const sidFrom = (body: Record<string, unknown>): string | null => {
          const sid = body.sessionId ?? url.searchParams.get('sessionId')
          return typeof sid === 'string' && sid.length > 0 && sid.length <= 512 ? sid : null
        }
        if (path === '/open' && method === 'POST') {
          const origin = String(req.headers?.origin ?? '')
          const hostHeader = String(req.headers?.host ?? '')
          if (origin && !origin.includes(hostHeader)) {
            res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: 'cross-origin open is not allowed' }))
            return
          }
          const body = await readJsonBody(req)
          const target = validateOpenTarget(typeof body.path === 'string' ? body.path : '')
          if (!target) {
            res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: 'path must be an absolute path to an existing file or directory' }))
            return
          }
          try {
            openWithDefaultApp(target)
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ ok: true, path: target }))
          } catch (error) {
            res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: 'open failed: ' + String(error) }))
          }
          return
        }
        // v0.10.1：交付物存在性校验（正文示例里的假路径不进聚合区）。只读 existsSync，不 spawn。
        if (path === '/verify-paths' && method === 'POST') {
          const origin = String(req.headers?.origin ?? '')
          const hostHeader = String(req.headers?.host ?? '')
          if (origin && !origin.includes(hostHeader)) {
            res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: 'cross-origin verify is not allowed' }))
            return
          }
          const body = await readJsonBody(req)
          const raw = Array.isArray(body.paths) ? body.paths : []
          if (raw.length > 32) {
            res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ error: 'paths must contain at most 32 entries' }))
            return
          }
          const paths = raw.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 1024)
          const sid = sidFrom({})
          // v0.10.1：带 sessionId 的请求做精确磁盘兜底（转写首行 cwd）并回填缓存
          if (sid && !cwdBySession.has(sid) && /^session-[A-Za-z0-9-]{1,120}$/.test(sid)) {
            const decompress = await zstdFn()
            if (decompress) {
              const base = process.env.DSH_HOME || join(homedir(), '.dsh')
              for (const grp of (() => { try { return readdirSync(join(base, 'sessions')) } catch { return [] as string[] } })()) {
                const f = join(base, 'sessions', grp, sid, 'session.v3.jsonl.zstd')
                if (existsSync(f)) {
                  const found = parseCwdFromSessionFile(f, decompress)
                  if (found) cwdBySession.set(sid, found)
                  break
                }
              }
            }
          }

          const candidates = new Set<string>()
          for (const v of cwdBySession.values()) if (v) candidates.add(v)
          if (lastKnownCwd) candidates.add(lastKnownCwd)
          for (const d of await recentSessionCwdsCached(8)) candidates.add(d)
          candidates.add(process.cwd())
          const existing: string[] = []
          const resolved: Record<string, string> = {}
          const seen = new Set<string>()
          for (const p of paths) {
            if (seen.has(p)) continue
            seen.add(p)
            const abs = await resolveExistingPath(candidates, p)
            if (abs !== null) { existing.push(p); resolved[p] = abs }
          }
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ existing, resolved, debug: { sid: sid ?? null, candidates: Array.from(candidates), cwdBySession: Object.fromEntries(cwdBySession) } }))
          return
        }
        if ((path === '/cwd' || path.startsWith('/cwd?')) && method === 'GET') {
          const sid = sidFrom({})
          // v0.10.0：历史会话内存缓存可能为空（重装后未组装）——磁盘兜底 + 候选列表供 client 依次尝试
          if (sid && !cwdBySession.has(sid) && /^session-[A-Za-z0-9-]{1,120}$/.test(sid)) {
            const decompress = await zstdFn()
            if (decompress) {
              const base = process.env.DSH_HOME || join(homedir(), '.dsh')
              for (const grp of (() => { try { return readdirSync(join(base, 'sessions')) } catch { return [] as string[] } })()) {
                const f = join(base, 'sessions', grp, sid, 'session.v3.jsonl.zstd')
                if (existsSync(f)) {
                  const found = parseCwdFromSessionFile(f, decompress)
                  if (found) { cwdBySession.set(sid, found); if (!lastKnownCwd) lastKnownCwd = found }
                  break
                }
              }
            }
          }
          const cwd = (sid && cwdBySession.get(sid)) || lastKnownCwd || process.cwd()
          const candidates = new Set<string>()
          for (const v of cwdBySession.values()) if (v) candidates.add(v)
          if (lastKnownCwd) candidates.add(lastKnownCwd)
          for (const d of await recentSessionCwdsCached(8)) candidates.add(d)
          candidates.add(cwd)
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ cwd: cwd || null, candidates: Array.from(candidates) }))
          return
        }
        if ((path === '/state' || path.startsWith('/state?')) && method === 'GET') {
          const sid = sidFrom({})
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ enabled: isEnabled(sid), scoped: sid !== null, sessionId: sid, default: state.default }))
          return
        }
        if ((path === '/toggle' || path === '/set') && method === 'POST') {
          const body = await readJsonBody(req)
          const sid = sidFrom(body)
          if (path === '/set') {
            const wanted = body.enabled
            if (typeof wanted !== 'boolean') {
              res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
              res.end(JSON.stringify({ error: 'body.enabled must be a boolean' }))
              return
            }
            setEnabled(sid, wanted)
          } else {
            setEnabled(sid, !isEnabled(sid))
          }
          log.info?.('[dsh-concise] ' + (sid ?? 'default') + ' concise ' + (isEnabled(sid) ? 'enabled' : 'disabled'))
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ enabled: isEnabled(sid), scoped: sid !== null, sessionId: sid }))
          return
        }
        res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: 'not found' }))
      },
    })
    log.info?.('[dsh-concise] http api attached (webServer available)')
    return dispose
  }), 'dsh-concise: http api')
}
