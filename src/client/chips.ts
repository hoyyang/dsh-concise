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
  const PATTERN = new RegExp(
    '(https?:\\/\\/[^\\s\uFF0C\u3002\uFF1B\uFF09\u3011\u201D\u0027\u0022<>]+' +
    '|(?:~|/(?:Users|home|tmp|var|opt|etc|private|data|System))[^\\s\uFF0C\u3002\uFF1B\uFF09\u3011\u201D\u0027\u0022<>]*' +
    '|[A-Za-z0-9_\\-./]+\\.(?:png|jpe?g|gif|webp|svg|bmp|ico|pdf|docx?|rtf|xlsx?|csv|java|kt|tsx?|jsx?|py|go|rs|c|cpp|h|hpp|sh|bash|sql|swift|markdown|md|txt|json|ya?ml|xml|html?|css|zip|tar|gz|rar|7z))',
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
function buildChip(value: string, isUrl: boolean): Element {
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
    el.title = info.label + ' · 点击预览 · Shift+点击用编辑器打开'
    el.addEventListener('click', (ev: Event) => { const me = ev as MouseEvent;
      ev.stopPropagation()
      void (async () => {
        // cwd 由 host 在 assemble 时缓存（GET /dsh-concise/api/cwd）—— 相对路径 → 绝对路径
        let cwd = '';
        try {
          const res = await fetch('/dsh-concise/api/cwd')
          if (res.ok) {
            const j = (await res.json()) as { cwd?: string }
            if (typeof j.cwd === 'string') cwd = j.cwd
          }
        } catch { /* cwd 不可得 */ }
        const abs = resolveAbsolute(path, cwd, '')
        const info = detectPathKind(path)
        // Shift+点击 = 用系统编辑器打开（IDE 协议；首次浏览器会请求确认，勾选「始终允许」后静默）
        if (me.shiftKey) {
          const apps = await probeApps()
          const scheme = ideSchemeUrl(apps, abs)
          if (scheme) {
            window.open(scheme, '_blank')
            mark(el as HTMLElement, 'dcc-opened')
            return
          }
        }
        // 默认：浏览器可渲染类型新窗预览（图片直接显示、PDF 内置阅读器、文本按纯文本）——零弹窗
        if (isPreviewableKind(info.kind) && info.kind !== 'file') {
          window.open('/api/file?path=' + encodeURIComponent(abs), '_blank')
          mark(el as HTMLElement, 'dcc-opened')
          return
        }
        // 文件夹：宿主 open-in-app 真开目录；其余二进制类型（word/excel/zip 等）：复制路径降级
        const opened = await openViaHost(abs)
        if (opened) { mark(el as HTMLElement, 'dcc-opened'); return }
        try { await navigator.clipboard?.writeText(path) } catch { /* 降级 */ }
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
