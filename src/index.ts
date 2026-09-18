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
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
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
  '- MANDATORY on every user-facing final reply (the reply that ends the turn and answers the user — intermediate step narration between tool calls is exempt): BEGIN with the digest block in EXACTLY this blockquote format, then continue with the normal answer:\n> **摘要：** <2-3 plain, jargon-free sentences restating this turn\'s conclusion, with the 2-4 key words or numbers bolded via **…**>\nThe digest may ONLY restate conclusions already present in the reply body — never introduce facts, trade-offs, or analogies the body does not contain; give any unavoidable term a short plain-language gloss in parentheses. However short the answer, the digest block is always present (it is not a recap — it precedes the answer).\nLength and structure are NOT exemptions: long explanation replies, step-by-step walkthroughs, and table-heavy documents are where the digest gets skipped most often — such replies must still OPEN with the digest block, before any heading, table, or body text.\nURLs, file paths, and code spans stay bare in the digest (or use [label](url) markdown) — bold (**) is for words and numbers only; bolding a URL corrupts the rendered link.\nTask-completion reports (openers like 全部完成 / 已实施 / 方案已落盘 / 交付物清单) are NOT a substitute for the digest — such replies MUST still BEGIN with the digest block.\nA heading opener like ## 结论 / ## 方案 is also NOT the digest — the digest block precedes any heading, however the reply is structured.',
  '- Never open by restating the question or with pleasantries ("Sure", "Great question", "好的", "当然可以") — the first line is already the answer or the key finding.',
  '- Skip filler closers: no recap of what you just did, no "In summary" restating the response, no boilerplate apologies or hedges, no closing offers ("需要我…吗？") unless a decision is genuinely required.',
  '- For enumerable facts prefer a table or a tight list over paragraphs — structure is not verbosity; compact and structured beats long and prosy.',
  '- Keep every load-bearing detail: constraints, risks, exact commands, file paths, and next actions are content, not filler — compress wording, never omit substance.',
  '- No narration between steps: report what changed, not what you are about to do ("Let me check...", "I\'ll now...").',
  '- Thoroughness of the work is unchanged: investigate, verify, and double-check exactly as you otherwise would; only the reporting is compressed.',
  '- When you made a choice, state it with a one-line reason; surface alternatives only when they are viable and materially different.',
].join('\n')

/** Prompt section 名（同层重名会冲突，带插件前缀）。 */
const SECTION_NAME = 'dsh-concise:style'
/** Persona=0 之后、越靠前模型越早读到；40 安全避开 harness(-100)/persona(0)。 */
const SECTION_ORDER = 40
/** 尾部提醒 section：system prompt 末尾再敲一次「最终回复必附摘要」，对冲长 prompt 下的遵循衰减。 */
const REMINDER_SECTION_NAME = 'dsh-concise:reminder'
const REMINDER_SECTION_ORDER = 900
const REMINDER_TEXT = 'REMINDER (Concise output style): before ending this turn, SELF-CHECK the final user-facing text block — its first characters must be the 摘要 digest blockquote exactly as defined in the Concise output style section above. Intermediate step narration between tool calls stays exempt, but the exemption NEVER carries to the final reply: after the last tool call, restart the digest discipline. Task-completion reports and long explanations are the most common violations.'
/** 上一条最终回复缺摘要时追加的反馈句（miss 检测闭环，v0.8.3）。 */
const MISS_WARNING = 'COMPLIANCE WARNING: your previous final reply violated the digest contract (no 摘要 card). THIS reply MUST begin with the digest block — no exceptions.'

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
/** 摘要块起始标记（host 侧判定口径；与 client MARK_RE 渲染口径同源）。 */
export const DIGEST_MARK = '> **摘要：**'

/**
 * 检查会话派生历史里「最后一条 assistant 消息」是否以摘要块开头。
 * 返回 true = 缺摘要（含首轮尚无 assistant 历史）；上下文不可判（无 session / deriveMessages /
 * 求值异常）一律返回 false —— 不可判时不告警，绝不阻断组装。纯函数，供 section 求值与单测共用。
 */
export function isDigestMissing(session: SessionLike | undefined | null): boolean {
  if (!session || typeof session.deriveMessages !== 'function') return false
  try {
    const msgs = (session.deriveMessages() ?? []) as Array<{ role?: string; content?: Array<{ type?: string; text?: string }> }>
    let lastAssistant = ''
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i]?.role === 'assistant') {
        lastAssistant = (msgs[i].content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
        break
      }
    }
    const trimmed = lastAssistant.trimStart()
    return trimmed.length === 0 || !trimmed.startsWith(DIGEST_MARK)
  } catch {
    return false
  }
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
        return isEnabled(sid) ? activeStyle().text : ''
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

  /** 上一条最终回复缺摘要时返回追加到尾部提醒后的合规警告；无法判定返回空串。
   *  顺带刷新会话 cwd 缓存（每轮组装至少经过此处一次；v0.9.2 起这是 cwd 唯一刷新点）。 */
  function complianceWarning(context: unknown): string {
    try {
      const session = (context as { agent?: { session?: SessionLike } } | undefined)?.agent?.session
      const rawId = session?.id
      const sid = typeof rawId === 'function' ? String(rawId()) : typeof rawId === 'string' ? rawId : null
      const cwd = session?.header?.cwd
      if (sid !== null && typeof cwd === 'string' && cwd.length > 0) { cwdBySession.set(sid, cwd); lastKnownCwd = cwd }
      if (!isDigestMissing(session)) return ''
      log.info?.('[dsh-concise] previous final reply missed the digest - compliance warning attached for session ' + (sid ?? ''))
      return '\n\n' + MISS_WARNING + '\n\n(Compliance check: the previous final reply in this session opened without the 摘要 digest blockquote — this session is on notice.)'
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
        if ((path === '/cwd' || path.startsWith('/cwd?')) && method === 'GET') {
          const sid = sidFrom({})
          const cwd = (sid && cwdBySession.get(sid)) || lastKnownCwd || process.cwd()
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ cwd: cwd || null }))
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
