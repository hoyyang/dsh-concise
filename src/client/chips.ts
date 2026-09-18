/**
 * dsh-concise digest 路径 chip（v0.8.5）——纯函数，供 client 渲染与单测共用。
 *
 * 摘要卡内的网页链接与本地文件路径 → 类型化可交互 chip：
 * - 网页链接 → 直接跳转（<a>）
 * - 本地文件 → 点击复制路径（web 安全模型内唯一可靠的「直接可用」交互；
 *   宿主无 file:// 打开机制，实测前端 bundle file:// 零命中）
 * 卡片本身样式零改动；chip 为卡内嵌套轻量 pill，风格随卡片（暖黑底 + Claude 橙体系）。
 */

/** chip 类型定义：id、类型色、语义标签。图标由 client 按 iconId 注入内联 SVG。 */
export interface PathKindInfo {
  kind: 'link' | 'image' | 'pdf' | 'word' | 'excel' | 'code' | 'markdown' | 'archive' | 'folder' | 'file'
  color: string
  label: string
}

/** 扩展名 → 类型映射（小写、无点）。 */
const EXT_KIND: Record<string, PathKindInfo['kind']> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image', ico: 'image',
  pdf: 'pdf',
  doc: 'word', docx: 'word', rtf: 'word',
  xls: 'excel', xlsx: 'excel', csv: 'excel',
  java: 'code', kt: 'code', ts: 'code', tsx: 'code', js: 'code', jsx: 'code', py: 'code', go: 'code', rs: 'code',
  c: 'code', cpp: 'code', h: 'code', hpp: 'code', sh: 'code', bash: 'code', sql: 'code', swift: 'code', m: 'code',
  md: 'markdown', markdown: 'markdown',
  zip: 'archive', tar: 'archive', gz: 'archive', rar: 'archive', '7z': 'archive',
}

/** 类型 → 展示信息（低饱和类型色，与摘要卡暖黑底 + Claude 橙体系协调）。 */
const KIND_INFO: Record<PathKindInfo['kind'], { color: string; label: string }> = {
  link: { color: '#D97757', label: '网页链接' },
  image: { color: '#A78BFA', label: '图片' },
  pdf: { color: '#EF4444', label: 'PDF 文档' },
  word: { color: '#3B82F6', label: 'Word 文档' },
  excel: { color: '#22C55E', label: '表格' },
  code: { color: '#F59E0B', label: '代码文件' },
  markdown: { color: '#94A3B8', label: 'Markdown' },
  archive: { color: '#C084FC', label: '压缩包' },
  folder: { color: '#EAB308', label: '文件夹' },
  file: { color: '#9CA3AF', label: '文件' },
}

/** 判定路径/链接的类型与展示信息。 */
export function detectPathKind(path: string): PathKindInfo {
  if (path.startsWith('http://') || path.startsWith('https://')) return { kind: 'link', ...KIND_INFO.link }
  const extMatch = /\.([A-Za-z0-9]{1,8})(?:[?#].*)?$/.exec(path)
  const ext = (extMatch ? extMatch[1] : '').toLowerCase()
  const kind = EXT_KIND[ext] ?? (ext ? 'file' : 'folder')
  return { kind, ...KIND_INFO[kind] }
}

/** 一个切分片段：text = 原样文本；url/file = 识别出的 chip 目标。 */
export interface PathSegment {
  type: 'text' | 'url' | 'file'
  value: string
}

/**
 * 从摘要文本中切出 URL / 本地路径片段（保守边界：排除中文句读与全角括号，
 * 与宿主 linkify 的贪婪行为相反——宁可漏识别不可错切断）。
 */
export function splitPathSegments(text: string): PathSegment[] {
  // v0.10.0 修复：扩展名交替「长优先」——旧顺序 h 在 html 前 / js 在 json 前 / doc 在 docx 前，
  // 正则交替先到先得导致 .html→.h、.json→.js、.docx→.doc、.xlsx→.xls、.cpp/.css/.csv→.c 截断
  //（路径残缺，点击打开必失败）。同前缀对全部改为长 extension 在前（docx|doc、xlsx|xls、tsx|ts、
  // json 在 jsx|js 前、html|htm 在 h 前、markdown 在 md 前、csv|css 在 c 前）。
  // v0.10.3 修复：相对路径扩展名后加词尾负向前瞻（不得紧跟字母/数字/下划线）——无边界时
  // 邮箱/域名被回溯出假扩展名：hoyyang@users.noreply.github.com 的域名尾部回退到 .c
  //（c 是合法扩展名）→ 切出假 chip「users.noreply.github.c」+ 残段「om」；.com/.cn/.ch 类
  // 域名同理全部误 chip。加边界后文件名后跟中文/标点/空白/串尾不受影响。
  const PATTERN = new RegExp(
    '(https?:\\/\\/[^\\s\uFF0C\u3002\uFF1B\uFF09\u3011\u201D\u0027\u0022<>]+' +
    '|(?:(?:~/)|(?:/(?:Users|home|tmp|var|opt|etc|private|data|System)))[^\\s\uFF0C\u3002\uFF1B\uFF09\u3011\u201D\u0027\u0022<>]*' +
    '|[A-Za-z0-9_\\-./]+\\.(?:png|jpeg|jpg|gif|webp|svg|bmp|ico|pdf|docx|doc|rtf|xlsx|xls|csv|css|java|kt|tsx|ts|json|jsx|js|py|go|rs|swift|bash|sh|sql|hpp|html|htm|markdown|md|txt|ya?ml|xml|zip|tar|gz|rar|7z|cpp|c)(?![A-Za-z0-9_]))',
    'g',
  )
  const out: PathSegment[] = []
  let last = 0
  for (const m of text.matchAll(PATTERN)) {
    const idx = m.index ?? 0
    if (idx > last) out.push({ type: 'text', value: text.slice(last, idx) })
    const value = m[0]
    // 剥离尾部标点粘连（路径后紧跟的 . , 等半角标点属句子而非路径）
    const trimmed = value.replace(/[.,;:)]+$/, '')
    const trailing = value.slice(trimmed.length)
    out.push({ type: /^https?:/i.test(trimmed) ? 'url' : 'file', value: trimmed })
    if (trailing) out.push({ type: 'text', value: trailing })
    last = idx + value.length
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) })
  return out.filter((seg) => seg.value.length > 0)
}


/** 极简内联 SVG 图标（24 viewBox，currentColor 继承类型色；路径文本一律 textContent 注入防注入）。 */
export const CHIP_ICONS: Record<string, string> = {
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M5 19l5.5-6 4 4.2L18 14l3 5"/></svg>',
  pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v6h6"/></svg>',
  word: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v6h6"/><path d="M7.5 12l1.3 5.5 2-4.5 2 4.5L15 12" stroke-width="1.6"/></svg>',
  excel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18" stroke-width="1.4"/></svg>',
  code: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8.5 7L4 12l4.5 5M15.5 7L20 12l-4.5 5"/><path d="M13 5l-2.5 14" stroke-width="1.6"/></svg>',
  markdown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M6 15V9l2.5 3L11 9v6M16.5 9v5M14.5 12l2 2 2-2" stroke-width="1.6"/></svg>',
  archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6a2 2 0 0 1 2-2h4l2.5 2.5H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v6h6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
}

/** 上次次探测的系统应用列表（进程内缓存，避免每次点击探测） */
let cachedApps: string[] | null = null

/**
 * 通过宿主 open-in-app 路由系统应用真正打开本地路径：
 * GET /open-in-app/apps 探测 -> POST /open-in-app/open { app, path }，
 * 应用选择：ＧAO 文件管理器优先（shell-open 可开任何路径），代码类先试 IDE；任何失败返 false（调用方降级复制）＊
 */
export async function openViaHost(path: string): Promise<'file' | 'dir' | false> {
  try {
    const loc = globalThis.location
    const base = loc && loc.origin && loc.origin !== 'null' ? loc.origin : 'http://dsh.internal'
    if (!cachedApps) {
      const res = await fetch(new URL('/open-in-app/apps', base))
      if (!res.ok) return false
      const wrapped = (await res.json()) as { apps?: unknown }
      const arr = Array.isArray(wrapped?.apps) ? wrapped.apps : []
      cachedApps = arr.map((x) => (typeof x === 'string' ? x : (x as { id?: string })?.id)).filter((x): x is string => typeof x === 'string' && x.length > 0)
    }
    const apps = cachedApps
    if (!apps || apps.length === 0) return false
    const has = (id: string): boolean => apps.includes(id)
    const info = detectPathKind(path)
    const preferred =
      info.kind === 'code' || info.kind === 'markdown'
        ? ['cursor', 'vscode', 'finder', 'explorer', 'filemanager']
        : ['finder', 'explorer', 'filemanager', 'cursor', 'vscode']
    const appId = preferred.find((id) => has(id)) ?? apps[0]
    const launch = async (target: string): Promise<boolean> => {
      const res = await fetch(new URL('/open-in-app/open', base), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ app: appId, path: target }),
      })
      return res.ok
    }
    // 宿主 open 路由的 wire 校验只接受已存在目录：文件路径 404 时回退其所在目录（Finder 定位到同级）
    if (await launch(path)) return 'file'
    const parent = path.replace(/\/[^/]+\/?$/, '') || '/'
    if (parent !== path && (await launch(parent))) return 'dir'
    return false
  } catch {
    return false
  }
}

/**
 * 交付物聚合（v0.10.0）：从整条回复文本中提取「值得列出的文件」，供摘要卡底部聚合区展示。
 * - replyText：同一条回复的全文（_markdown 容器）；cardText：摘要卡自身文本。
 * - 排除：URL（kind=link）、目录（kind=folder）、卡内文本已出现的（不重复列）。
 * - 保留出现顺序、去重、上限 limit（默认 8）。
 * 纯函数，供 client 渲染与单测共用。
 */
export function collectDeliverables(replyText: string, cardText: string, limit = 8): string[] {
  const card = cardText ?? ''
  const seen = new Set<string>()
  const out: string[] = []
  for (const seg of splitPathSegments(replyText ?? '')) {
    if (seg.type !== 'url' && seg.type !== 'file') continue
    const value = seg.value
    if (seen.has(value) || card.includes(value)) continue
    // URL 不入列（用户要的是文件）；目录（无扩展名）不入列
    const kind = detectPathKind(value)
    if (kind.kind === 'link' || kind.kind === 'folder') continue
    seen.add(value)
    out.push(value)
    if (out.length >= limit) break
  }
  return out
}

/** 判断节点是否已在 chip 或链接内（避免重复处理）。 */
function insideChip(node: Node | null): boolean {
  let cur: Node | null = node
  while (cur) {
    if (cur instanceof Element && (cur.classList.contains('dsh-concise-chip') || cur.tagName === 'A')) return true
    cur = cur.parentNode
  }
  return false
}


/** 短时状态标：加类并定时移除。 */
function mark(el: HTMLElement, cls: string): void {
  el.classList.add(cls)
  window.setTimeout(() => el.classList.remove(cls), 1500)
}

/** 构造单个 chip 元素（路径用 textContent 注入，防 HTML 注入；本地文件点击复制路径）。 */
export function buildChip(value: string, isUrl: boolean): Element {
  const info = detectPathKind(value)
  const el = document.createElement(isUrl ? 'a' : 'span')
  el.className = 'dsh-concise-chip dsh-concise-chip-' + info.kind
  ;(el as HTMLElement).style.setProperty('--dcc-c', info.color)
  if (isUrl) {
    const a = el as HTMLAnchorElement
    a.href = value
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    // v0.8.6 显式跳转，不依足 <a> 默认行为）
    el.addEventListener('click', (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      try { window.open(value, '_blank', 'noopener') } catch { /* 降级 */ }
    })
  } else {
    const path = value
    el.title = info.label + ' · 点击用系统默认应用打开'
    el.addEventListener('click', (ev: Event) => { const me = ev as MouseEvent;
      ev.stopPropagation()
      void (async () => {
        // v0.10.0：cwd 候选依次尝试——历史会话的内存缓存可能为空（重装后未组装），
        // host 返回 candidates（内存缓存 + 最近会话转写磁盘兜底）；open 400 = 目标不存在，
        // 无副作用，可安全连续尝试；全败降级复制原始路径。
        const tryOpen = async (abs: string): Promise<boolean> => {
          try {
            const res2 = await fetch('/dsh-concise/api/open', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ path: abs }),
            })
            return res2.ok
          } catch { return false }
        }
        // v0.10.2 ①：渲染期 verify 已按 basename 递归解析出的绝对路径直接用——相对路径未必能从
        // 任何候选 cwd 直连拼出（实测 draw-code/e2e-*.png 真身在 dsh-draw-code/draw-code/ 下，
        // 直连永远 400 → 只能降级复制，即 0.10.1 用户实测回归）。
        const preAbs = (el as HTMLElement).dataset.dccAbs
        if (preAbs && await tryOpen(preAbs)) { mark(el as HTMLElement, 'dcc-opened'); return }
        let candidates: string[] = []
        try {
          const sid = (globalThis as { __dshConciseSid?: string }).__dshConciseSid ?? ''
          const res = await fetch('/dsh-concise/api/cwd?sessionId=' + encodeURIComponent(sid))
          if (res.ok) {
            const j = (await res.json()) as { cwd?: string; candidates?: unknown }
            const list = Array.isArray(j.candidates) ? j.candidates : []
            candidates = [j.cwd ?? '', ...list.filter((c): c is string => typeof c === 'string')]
              .filter((c, i, arr) => c.length > 0 && arr.indexOf(c) === i)
          }
        } catch { /* cwd unavailable */ }
        if (candidates.length === 0) candidates = ['']
        for (const cwd of candidates) {
          const abs = resolveAbsolute(path, cwd, '')
          if (await tryOpen(abs)) { mark(el as HTMLElement, 'dcc-opened'); return }
        }
        // v0.10.2 ②：点击期兜底——单路径 verify，host 按 basename 递归解析出绝对路径再开
        // （卡内相对路径 chip 同样受益；open 仅收绝对路径，安全口径不变）
        try {
          const sid = (globalThis as { __dshConciseSid?: string }).__dshConciseSid ?? ''
          const res = await fetch('/dsh-concise/api/verify-paths?sessionId=' + encodeURIComponent(sid), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ paths: [path] }),
          })
          if (res.ok) {
            const j = (await res.json()) as { resolved?: Record<string, unknown> }
            const abs = j.resolved?.[path]
            if (typeof abs === 'string' && abs.startsWith('/') && (await tryOpen(abs))) {
              mark(el as HTMLElement, 'dcc-opened')
              return
            }
          }
        } catch { /* degrade */ }
        try { await navigator.clipboard?.writeText(path) } catch { /* degrade */ }
        mark(el as HTMLElement, 'dcc-copied')
      })()
    })
  }
  const iconHost = document.createElement('span')
  iconHost.className = 'dcc-i'
  iconHost.innerHTML = CHIP_ICONS[info.kind] ?? CHIP_ICONS.file
  const label = document.createElement('span')
  label.className = 'dcc-p'
  label.textContent = value
  el.appendChild(iconHost)
  el.appendChild(label)
  const act = document.createElement('span')
  act.className = 'dcc-a'
  act.innerHTML = isUrl ? CHIP_ICONS.link : CHIP_ICONS.copy
  el.appendChild(act)
  return el
}

/** 摘要卡内路径 chip 化：遍历文本节点切分注入；已在链接/chip 内的文本跳过（幂等）。 */
export function applyChipEnhancement(root: Element): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const targets: Text[] = []
  let node = walker.nextNode() as Text | null
  while (node) { targets.push(node); node = walker.nextNode() as Text | null }
  for (const textNode of targets) {
    if (insideChip(textNode.parentNode)) continue
    const text = textNode.textContent ?? ''
    if (text.trim().length === 0) continue
    const segments = splitPathSegments(text)
    if (segments.length === 1 && segments[0].type === 'text') continue
    const frag = document.createDocumentFragment()
    for (const seg of segments) {
      if (seg.type === 'text') { frag.appendChild(document.createTextNode(seg.value)); continue }
      frag.appendChild(buildChip(seg.value, seg.type === 'url'))
    }
    textNode.parentNode?.replaceChild(frag, textNode)
  }
}


/** 探测宿主可用系统应用列表（复用 openViaHost 缓存）。 */
export async function probeApps(): Promise<string[]> {
  if (cachedApps) return cachedApps
  try {
    const loc = globalThis.location
    const base = loc && loc.origin && loc.origin !== 'null' ? loc.origin : 'http://dsh.internal'
    const res = await fetch(new URL('/open-in-app/apps', base))
    if (!res.ok) return []
    const wrapped = (await res.json()) as { apps?: unknown }
    const arr = Array.isArray(wrapped?.apps) ? wrapped.apps : []
    cachedApps = arr.map((x) => (typeof x === 'string' ? x : (x as { id?: string })?.id)).filter((x): x is string => typeof x === 'string' && x.length > 0)
    return cachedApps
  } catch {
    return []
  }
}

/** 相对路径 → 绝对路径：~ 开头按 home（= cwd 前 3 段）代；相对按 cwd 拼接；绝对原样。 */
export function resolveAbsolute(path: string, cwd: string, home: string): string {
  if (path.startsWith('/')) return path
  if (path.startsWith('~/')) {
    const base = home || (cwd ? cwd.split('/').slice(0, 3).join('/') : '')
    return base ? base + path.slice(1) : path
  }
  return cwd ? cwd.replace(/\/?$/, '/') + path : path
}


/** 浏览器可直接渲染的类型：走 /api/file 新窗预览；其余降级复制。 */
/** IDE 协议 URL：按探测优先级返回第一个可用协议，无则 null。 */
export function ideSchemeUrl(apps: string[], absPath: string): string | null {
    const order = ['cursor', 'vscode', 'windsurf', 'zed']
    const ide = order.find((id) => apps.includes(id))
    return ide ? ide + '://file' + absPath : null
}

export function isPreviewableKind(kind: string): boolean {
  return ['image', 'pdf', 'code', 'markdown', 'file'].includes(kind)
}
