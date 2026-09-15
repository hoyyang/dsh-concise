/**
 * dsh-concise client：
 * 在 composer 工具行注入 Concise 输出风格开关按钮——紧贴「增强提示词」按钮
 * （dsh-improve-prompt，sparkle「标准/轻量」pill）的【左侧】（行序：Concise →
 * 增强提示词 → 模型选择按钮，官方模型按钮与 kiro 模型选择器均在右）。
 *
 * 落位实现：right 槽（conversation.input.right）条目被官方渲染在模型按钮【左侧】，
 * 与直觉相反；因此本插件以 right 槽条目为自定位锚点——组件挂载后从自身 DOM 出发
 * 找到同一工具行内的 dsh-improve-prompt 条目（div.dip-root），把一个自有 portal
 * 容器 insert 到它的紧右侧，并用 MutationObserver 保持相对位置。
 * 降级链：improve-prompt 未装/未渲染 → 模型 seat 紧左侧（同区域）；
 * 模型 seat 也不可寻（理论边缘态）→ 退化为 right 槽原位渲染，功能不丢。
 *
 * 收起式交互（v0.5.0/v0.6.0）：按钮默认收起只显示滑轨（占位壳固定收起宽度）；
 * Switch 部分紧贴 improve-prompt 左侧固定不动，Concise 文字在按钮内位于滑轨
 * 左侧，悬停/键盘聚焦时向左平滑展开——右缘固定，绝不推动相邻控件。
 *
 * 数据面：GET/POST /dsh-concise/api（host 插件提供），**按会话独立开关**（新会话取 default），
 * 跨重启持久。按钮通过槽位 inject 拿到当前会话 id，所有状态读写都带 sessionId。
 */
import React from 'react'
import { createRoot } from 'react-dom/client'

type SlotsService = {
  inject: (seat: string, fn: () => unknown) => unknown
  register: (options: {
    name: string
    id?: string
    priority?: number
    order?: number
    locale?: string
    inject?: (sessionId: string) => unknown
  }, component: unknown) => unknown
}
type LocaleService = {
  register: (ns: string, dicts: { zh: Record<string, string>; en: Record<string, string> }) => () => void
  bind: (ns: string) => (key: string) => string
}
type ClientContext = {
  slots: SlotsService
  locale?: LocaleService
  effect: (fn: () => unknown | (() => void), label?: string) => void
}

export const name = 'dsh-concise'
export const inject = ['slots', 'locale']

const NS = 'dsh-concise'
const STATE_URL = '/dsh-concise/api/state'
const TOGGLE_URL = '/dsh-concise/api/toggle'
const CHANGE_EVENT = 'dsh-concise:change'

const zh = {
  toggleAria: '切换 Concise 输出风格',
  tooltip: 'Concise 输出风格：结果先行、少废话，工作深浅不变（仅影响当前会话的新回复）',
  on: '开',
  off: '关',
  unknown: '…',
}
const en = {
  toggleAria: 'Toggle concise output style',
  tooltip: 'Concise output style: results first, no filler — same work depth (this session only, affects new replies)',
  on: 'ON',
  off: 'OFF',
  unknown: '…',
}
const FALLBACK: Record<string, string> = { ...en }

const css = [
  '[data-dsh-concise-anchor]{display:inline-flex;align-items:center;flex:none}',
  // 收起式布局：占位壳固定「收起宽度」（42px），按钮绝对定位 right:0 ——
  // 悬停展开时按钮向左伸展、右缘严格不动，行内相邻元素（模型/发送按钮）零位移。
  '.dsh-concise-root{position:relative;flex:none;width:42px;height:28px;display:inline-block}',
  '.dsh-concise-trigger{position:absolute;right:0;top:0;height:28px;cursor:pointer;border-radius:24px;outline:none;display:inline-flex;align-items:center;white-space:nowrap;gap:0;padding:0 5px;font-size:12px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-secondary);background-image:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,0));border:1px solid var(--dsw-alias-border-l2);z-index:2;transition:gap .28s cubic-bezier(.34,1.3,.5,1),padding .28s cubic-bezier(.34,1.3,.5,1),border-color .2s ease,color .2s ease,background-color .2s ease,transform .12s ease}',
  '.dsh-concise-trigger:hover{color:var(--dsw-alias-label-primary);background-color:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3)}',
  '.dsh-concise-trigger:active{transform:scale(.96)}',
  '.dsh-concise-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default;opacity:.7}',
  // 悬停/键盘聚焦：文字三重过渡展开（宽度+透明度+位移），gap/padding 同步撑开
  '.dsh-concise-trigger:hover,.dsh-concise-trigger:focus-visible{gap:6px;padding:0 9px}',
  '.dsh-concise-label{max-width:0;opacity:0;transform:translateX(-4px);overflow:hidden;text-overflow:clip;white-space:nowrap;transition:max-width .3s cubic-bezier(.4,0,.2,1),opacity .22s ease,transform .3s cubic-bezier(.4,0,.2,1)}',
  '.dsh-concise-trigger:hover .dsh-concise-label,.dsh-concise-trigger:focus-visible .dsh-concise-label{max-width:72px;opacity:1;transform:none}',
  // 流光扫过：悬停一次斜向高光（概念图②的对角玻璃反光）
  '.dsh-concise-trigger::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(115deg,transparent 32%,rgba(255,255,255,.26) 48%,transparent 62%);transform:translateX(-130%);transition:transform .65s ease}',
  '.dsh-concise-trigger:hover::after{transform:translateX(130%)}',
  // 滑动开关：轨道 30×16，滑块 10px 四周 2px 恒距，spring 回弹 + 按压拉长（iOS 手感）
  '.dsh-concise-switch{position:relative;width:30px;height:16px;border-radius:999px;flex:none;background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-l2);transition:background-color .25s ease,border-color .25s ease,box-shadow .25s ease}',
  '.dsh-concise-knob{position:absolute;top:50%;left:2px;width:10px;height:10px;border-radius:999px;background:linear-gradient(180deg,#fff,#f1f1f1);box-shadow:0 1px 2.5px rgba(0,0,0,.28),0 0 0 .5px rgba(0,0,0,.04);transform:translateY(-50%);transition:transform .3s cubic-bezier(.34,1.56,.64,1),width .18s ease}',
  '.dsh-concise-trigger:active .dsh-concise-knob{width:11px}',
  // ON 态：Claude 橙极光三段渐变（概念图③），玻璃壳泛橙 + 静态柔辉；滑轨做呼吸脉动
  // （动画放滑轨上，避免覆盖触发器自身的 focus-visible 焦点环）
  '.dsh-concise-trigger[data-on="true"]{color:var(--dsw-alias-label-primary);border-color:rgba(217,119,87,.72);background-color:rgba(217,119,87,.08);box-shadow:0 0 9px rgba(217,119,87,.25)}',
  '.dsh-concise-trigger[data-on="true"]:hover{border-color:rgba(230,148,112,.9)}',
  '.dsh-concise-trigger[data-on="true"] .dsh-concise-switch{background:linear-gradient(135deg,#F0B08F,#D97757 55%,#C25E3F);border-color:rgba(217,119,87,.85);animation:dsh-concise-breathe 2.8s ease-in-out infinite}',
  '.dsh-concise-trigger[data-on="true"] .dsh-concise-knob{transform:translate(14px,-50%)}',
  '@keyframes dsh-concise-breathe{0%,100%{box-shadow:inset 0 1px 1px rgba(255,255,255,.35),0 0 7px rgba(217,119,87,.35)}50%{box-shadow:inset 0 1px 1px rgba(255,255,255,.35),0 0 15px rgba(217,119,87,.6)}}',
  // 焦点环放 ON 规则之后，保证 ON 态聚焦时环不被辉光吞掉
  '.dsh-concise-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}',
  // 无障碍：用户偏好减少动效时，呼吸/流光/展开过渡全部瞬时化
  '@media (prefers-reduced-motion:reduce){.dsh-concise-trigger,.dsh-concise-trigger::after,.dsh-concise-label,.dsh-concise-switch,.dsh-concise-knob{transition:none!important;animation:none!important}}',
  // 精华摘要卡（v0.7，概念图 assets/style-digest-v07e.png）——「工程蓝图卡」定稿（用户选定）：
  // 白卡面铺极淡网格线（::before，悬停增亮），四角橙色测量角标（::after 八层背景渐变，入场画出）；
  // 等宽字体栈 + 1.18em 大字号；头部「DIGEST // 说人话」；交互=点卡片复制摘要（头部闪现 COPIED ✓）；
  // 正文深暖棕黑 #2B211B 对比 ~14:1，阅读优先
  '.dsh-concise-digest{position:relative!important;font-family:ui-monospace,"SF Mono",Menlo,Consolas,"Liberation Mono","PingFang SC","Microsoft YaHei",monospace!important;font-size:1.18em!important;line-height:1.8!important;border:1px solid rgba(150,110,90,.16)!important;border-radius:16px!important;background:linear-gradient(180deg,#FEFDFC,#FBF7F3)!important;box-shadow:0 1px 4px rgba(60,40,30,.06)!important;padding:14px 18px!important;margin:10px 0!important;color:#2B211B!important;cursor:text;transition:box-shadow .25s ease,border-color .25s ease,transform .25s ease;animation:bp-in .4s ease backwards}',
  '.dsh-concise-digest::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(150,110,90,.055) 0,rgba(150,110,90,.055) 1px,transparent 1px,transparent 26px),repeating-linear-gradient(90deg,rgba(150,110,90,.055) 0,rgba(150,110,90,.055) 1px,transparent 1px,transparent 26px);opacity:.55;transition:opacity .3s ease}',
  '.dsh-concise-digest::after{content:"";position:absolute;inset:7px;pointer-events:none;background:linear-gradient(#E8926B,#E8926B) 0 0/13px 2px no-repeat,linear-gradient(#E8926B,#E8926B) 0 0/2px 12px no-repeat,linear-gradient(#E8926B,#E8926B) 100% 0/13px 2px no-repeat,linear-gradient(#E8926B,#E8926B) 100% 0/2px 12px no-repeat,linear-gradient(#E8926B,#E8926B) 0 100%/13px 2px no-repeat,linear-gradient(#E8926B,#E8926B) 0 100%/2px 12px no-repeat,linear-gradient(#E8926B,#E8926B) 100% 100%/13px 2px no-repeat,linear-gradient(#E8926B,#E8926B) 100% 100%/2px 12px no-repeat;opacity:.85;animation:bp-brackets .5s ease .12s backwards}',
  '.dsh-concise-digest:hover{border-color:rgba(201,87,59,.35)!important;box-shadow:0 4px 16px rgba(217,119,87,.12)!important;transform:translateY(-1px)}',
  '.dsh-concise-digest:hover::before{opacity:.85}',
  '.dsh-concise-digest{animation:bp-in .4s ease backwards}',
  '@keyframes bp-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
  '@keyframes bp-brackets{from{opacity:0}to{opacity:.9}}',
  // 头部「DIGEST // 说人话」= 块内首个 strong；复制成功闪现 COPIED ✓；正文关键词 strong = 加粗深色
  '.dsh-concise-digest p>strong:first-child{display:block!important;font-weight:700!important;color:#2B211B!important;letter-spacing:.08em!important;margin-bottom:6px!important}',
  '.dsh-concise-digest p>strong:first-child::before{content:"DIGEST // ";color:#E8926B!important;letter-spacing:.06em!important}',
  '.dsh-concise-digest[data-copied="1"] p>strong:first-child::before{content:"COPIED ✓ ";color:#2E9E5B!important}',
  '.dsh-concise-digest p strong:not(:first-child){font-weight:700!important;color:#17100D!important}',
  '@media (prefers-reduced-motion:reduce){.dsh-concise-digest,.dsh-concise-digest::after{animation:none!important}.dsh-concise-digest::after{opacity:.9}}',
].join('\n')

/**
 * 从自身渲染位置出发，找到「自己所在工具行」里的模型 seat 容器。
 * 页面可能同时挂载多个 composer 实例（hero / 会话视图 / 折叠面板），绝不能用
 * 「祖先 contains 我的根」这类宽松判断——那会顺着别的 composer 的模型按钮爬到
 * 公共祖先。正确做法：从自己的 wrapper 逐层向上，在每层检查兄弟子树中的模型
 * 按钮；最低命中层即本工具行（模型 seat 与本插件条目是同层兄弟）。
 */
function findModelSeat(myRoot: HTMLElement): { row: HTMLElement; seat: HTMLElement } | null {
  const isModelButton = (element: Element): boolean =>
    element.tagName === 'BUTTON' && /模型|model/i.test(element.getAttribute('aria-label') ?? '')
  let wrapper: HTMLElement | null = myRoot.parentElement
  while (wrapper && wrapper !== document.body) {
    const row: HTMLElement | null = wrapper.parentElement
    if (row === null) break
    for (const child of Array.from(row.children)) {
      if (child === wrapper || child.contains(myRoot)) continue
      const button = Array.from(child.querySelectorAll('button[aria-label]')).find(isModelButton)
      if (button !== undefined) return { row, seat: child as HTMLElement }
    }
    wrapper = row
  }
  return null
}

/**
 * 在工具行里找 dsh-improve-prompt 条目的顶层包裹（返回元素满足 parentElement === row）。
 * 官方 right 槽会把多个插件条目渲染进同一个共享容器（本插件的隐形锚根也在其中），
 * 因此不能按 row 子代逐个探测——包含自身的容器会被误跳过；必须从 dip 元素本身
 * 向上爬到 row 的直接子代。
 * 三重识别，防该插件独立改造导致类名漂移：
 * ① 精确类名 .dip-root；② dip- 类名前缀容忍；③ aria-label 文本匹配。
 * 全部未命中返回 null（落位降级为模型 seat 紧左侧）。
 */
function findImproveEntry(row: HTMLElement): HTMLElement | null {
  const labelMatch = (element: Element): boolean =>
    element.tagName === 'BUTTON' && /增强提示词|enhance prompt/i.test(element.getAttribute('aria-label') ?? '')
  const probes: ((scope: ParentNode) => Element | null)[] = [
    (scope) => scope.querySelector('.dip-root'),
    (scope) => scope.querySelector('[class*="dip-"]'),
    (scope) => Array.from(scope.querySelectorAll('button[aria-label]')).find(labelMatch) ?? null,
  ]
  for (const probe of probes) {
    const dip = probe(row)
    if (dip === null) continue
    let wrapper: Element = dip
    while (wrapper.parentElement !== null && wrapper.parentElement !== row) wrapper = wrapper.parentElement
    if (wrapper.parentElement === row) return wrapper as HTMLElement
  }
  return null
}

/** 会话级状态缓存：切会话时按钮先用缓存即时渲染（stale-while-revalidate），不闪加载态。 */
const stateCache = new Map<string, boolean>()

function cacheKey(sessionId: string | undefined): string {
  return sessionId ?? ''
}

async function fetchState(sessionId: string | undefined): Promise<boolean | null> {
  try {
    const qs = sessionId ? '?sessionId=' + encodeURIComponent(sessionId) : ''
    const response = await fetch(STATE_URL + qs, { cache: 'no-store' })
    if (!response.ok) return null
    const data = await response.json() as { enabled?: unknown; default?: unknown }
    const enabled = data.enabled === true
    stateCache.set(cacheKey(sessionId), enabled)
    // 顺带记住「新会话默认值」：其它未访问过的会话也能即时渲染
    if (typeof data.default === 'boolean') stateCache.set('', data.default)
    return enabled
  } catch {
    return null
  }
}

const ConciseButton = ({ t, sessionId }: { t: (key: string) => string; sessionId?: string }): React.ReactElement => {
  // 初值优先取会话缓存，其次取新会话默认值缓存：切会话/首访都即时呈现，后台再校准
  const [enabled, setEnabled] = React.useState<boolean | null>(() => {
    const cached = stateCache.get(cacheKey(sessionId)) ?? stateCache.get('')
    return cached === undefined ? null : cached
  })
  const [busy, setBusy] = React.useState(false)

  const applyEnabled = (value: boolean): void => {
    setEnabled(value)
    stateCache.set(cacheKey(sessionId), value)
  }

  React.useEffect(() => {
    let disposed = false
    void fetchState(sessionId).then((value) => {
      if (!disposed && value !== null) setEnabled(value)
    })
    const refetch = () => {
      void fetchState(sessionId).then((value) => {
        if (value !== null) applyEnabled(value)
      })
    }
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean; sessionId?: string }>).detail
      // 只接受同一会话的即时广播；其它会话的变化走轮询/focus 重取
      if (detail && typeof detail.enabled === 'boolean' && detail.sessionId === sessionId) applyEnabled(detail.enabled)
      else refetch()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') refetch()
    }
    // 轻量轮询：/concise 命令、curl 等本插件之外的入口改状态时，按钮 ≤15s 内跟上
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refetch()
    }, 15000)
    window.addEventListener('focus', refetch)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(CHANGE_EVENT, onChange)
    return () => {
      disposed = true
      window.clearInterval(timer)
      window.removeEventListener('focus', refetch)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(CHANGE_EVENT, onChange)
    }
  }, [sessionId])

  const toggle = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      const response = await fetch(TOGGLE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sessionId ? { sessionId } : {}),
      })
      if (response.ok) {
        const data = await response.json() as { enabled?: unknown }
        const next = data.enabled === true
        applyEnabled(next)
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { enabled: next, sessionId } }))
      }
    } catch (error) {
      console.warn('[dsh-concise] toggle failed:', error)
    } finally {
      setBusy(false)
    }
  }

  const on = enabled === true
  return React.createElement(
    'div',
    { className: 'dsh-concise-root' },
    React.createElement(
      'button',
      {
        type: 'button',
        className: 'dsh-concise-trigger',
        'data-on': on ? 'true' : 'false',
        'aria-pressed': on,
        'aria-label': t('toggleAria'),
        title: t('tooltip'),
        disabled: busy || enabled === null,
        onClick: () => { void toggle() },
      },
      React.createElement('span', { className: 'dsh-concise-label' }, 'Concise'),
      React.createElement('span', { className: 'dsh-concise-switch', 'aria-hidden': true },
        React.createElement('span', { className: 'dsh-concise-knob' })),
    ),
  )
}

/**
 * right 槽条目：自身仅渲染一个不可见的锚根（display:contents），
 * 真正的按钮 portal 到「增强提示词」条目紧左侧（未装时模型 seat 紧左侧，
 * 异常形态再退化为原位渲染）。
 */
const ConciseSeat = ({ t, sessionId }: { t: (key: string) => string; sessionId?: string }): React.ReactElement => {
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  const [fallback, setFallback] = React.useState(false)

  React.useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let disposed = false
    let anchor: HTMLDivElement | null = null
    let portalRoot: ReturnType<typeof createRoot> | null = null
    let observedRow: HTMLElement | null = null
    let frames = 0
    let frame = 0

    const place = (): boolean => {
      if (disposed) return true
      const current = rootRef.current
      if (!current || !current.isConnected) return false
      const found = findModelSeat(current)
      if (!found) return false
      if (!anchor) {
        anchor = document.createElement('div')
        anchor.setAttribute('data-dsh-concise-anchor', '')
      }
      // 目标位：improve-prompt 条目紧左侧（本插件条目 → dip 条目 → 模型按钮）；
      // 未装/未渲染时降级为模型 seat 紧左侧（即 dip 本会占据的位置）
      const improve = findImproveEntry(found.row)
      const target = improve !== null && improve !== found.seat ? improve : null
      const misplaced = target !== null
        ? anchor.parentElement !== found.row || anchor.nextElementSibling !== target
        : anchor.parentElement !== found.row || anchor.nextElementSibling !== found.seat
      if (misplaced) {
        if (target !== null) target.before(anchor)
        else found.seat.before(anchor)
      }
      if (!portalRoot) {
        portalRoot = createRoot(anchor)
        portalRoot.render(React.createElement(ConciseButton, { t, sessionId }))
      }
      if (observedRow !== found.row) {
        observer.disconnect()
        // subtree：dip 条目的挂载/卸载发生在共享容器内部（row 的孙子层），
        // 只监听 row 直接子代会漏掉 improve-prompt 的安装/卸载事件
        observer.observe(found.row, { childList: true, subtree: true })
        observedRow = found.row
      }
      setFallback(false)
      return true
    }

    const observer = new MutationObserver(() => {
      if (disposed) return
      // 行内结构变化（React 重渲染/seat 重建）后重新对位；找不到 seat 时保持观察
      if (!place() && anchor) anchor.style.display = 'none'
      else if (anchor) anchor.style.display = ''
    })

    const tick = () => {
      if (disposed) return
      if (place()) return
      frames += 1
      if (frames > 40) {
        // 模型 seat 不可寻（异常形态）：退化为 right 槽原位渲染，功能不丢
        setFallback(true)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      if (portalRoot) {
        try {
          portalRoot.unmount()
        } catch { /* 卸载尽力而为 */ }
        portalRoot = null
      }
      if (anchor) {
        anchor.remove()
        anchor = null
      }
    }
  }, [t, sessionId])

  if (fallback) {
    return React.createElement(ConciseButton, { t, sessionId })
  }
  return React.createElement('div', { ref: rootRef, style: { display: 'contents' }, 'data-dsh-concise-seat': '' })
}

/**
 * Client plugin body：注册字典、样式、right 槽条目（按钮 portal 到「增强提示词」左侧）
 * 与精华摘要卡渲染增强（以「摘要：」开头的 blockquote → 圆角高亮卡）。
 * @param ctx - client 根上下文。
 */
export function apply(ctx: ClientContext): void {
  try {
    if (ctx.locale) {
      ctx.effect(() => ctx.locale!.register(NS, { zh, en }), 'dsh-concise: dictionaries')
    }
  } catch (error) {
    console.warn('[dsh-concise] locale register failed; using built-in labels', error)
  }
  const bind = ctx.locale?.bind(NS)
  const t = (key: string): string => {
    if (bind) {
      try {
        return bind(key)
      } catch { /* 回退内置文案 */ }
    }
    return FALLBACK[key] ?? key
  }

  // 0) 插件自有 CSS：随插件 fiber 卸载即净
  ctx.effect(() => {
    if (typeof document === 'undefined') return
    document.querySelectorAll('style[data-plugin="dsh-concise"]').forEach((node) => node.remove())
    const style = document.createElement('style')
    style.dataset.plugin = 'dsh-concise'
    style.textContent = css
    document.head.appendChild(style)
    return () => {
      style.remove()
    }
  }, 'dsh-concise: client styles')

  // 0.5) 精华摘要卡渲染增强（v0.8）：消息流里以「摘要：」开头的 blockquote → 打样式类变圆角高亮卡。
  // 兼容 0.7 之前旧标签「说人话：」的历史消息（否则旧会话卡片永久退化为普通引用块）。
  // 监听 body 子树（markdown 重渲染频繁，rAF 合批）；匹配按 tag+文本前缀，不命中不加样式（原生引用块兜底）。
  ctx.effect(() => {
    if (typeof document === 'undefined') return
    const MARK_RE = /^(摘要：|说人话：)/
    let queued = 0
    const scan = (): void => {
      queued = 0
      for (const bq of Array.from(document.querySelectorAll('blockquote'))) {
        const hit = MARK_RE.test((bq.textContent ?? '').trimStart())
        bq.classList.toggle('dsh-concise-digest', hit)
        if (hit && !bq.title) bq.title = '划选卡内文字，松开即复制'
      }
    }
    const schedule = (): void => {
      if (queued) return
      queued = requestAnimationFrame(() => { queued = 0; scan() })
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    // 交互（v0.7.1）：框选卡内文字后松开即自动复制所选内容（头部闪现 COPIED ✓）
    let lastCopied = ''
    const copySelection = (): void => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) return
      const node = sel.anchorNode
      const el = node && node.nodeType === 1 ? (node as Element) : node?.parentElement
      const card = el?.closest('.dsh-concise-digest') as HTMLElement | null
      if (!card) return
      const text = sel.toString().trim()
      if (!text || text === lastCopied) return
      lastCopied = text
      try {
        void navigator.clipboard?.writeText(text).then(() => {
          card.dataset.copied = '1'
          window.setTimeout(() => { delete card.dataset.copied }, 1400)
        }).catch(() => {})
      } catch { /* 剪贴板不可用静默 */ }
    }
    const onMouseUp = (): void => { copySelection() }
    document.addEventListener('mouseup', onMouseUp)
    schedule()
    return () => {
      observer.disconnect()
      document.removeEventListener('mouseup', onMouseUp)
      if (queued) { cancelAnimationFrame(queued); queued = 0 }
      // 卸载即净：摘除本插件添加的卡片样式类与状态标记
      document.querySelectorAll('.dsh-concise-digest').forEach((node) => {
        node.classList.remove('dsh-concise-digest')
        delete (node as HTMLElement).dataset.copied
      })
    }
  }, 'dsh-concise: digest card renderer')

  // 1) right 槽条目（锚点 + portal 落位到「增强提示词」按钮左侧）；inject 把当前会话 id 传给组件
  ctx.effect(() => {
    try {
      return ctx.slots.inject('conversation.input.right', function* () {
        yield ctx.slots.register({
          name: 'conversation.input.right',
          id: 'dsh-concise-toggle',
          order: 50,
          locale: NS,
          inject: (sessionId: string) => ({ sessionId }),
        }, (props: { sessionId?: string }) => React.createElement(ConciseSeat, { t, sessionId: props?.sessionId }))
      })
    } catch (error) {
      console.error('[dsh-concise] right slot register failed', error)
      return () => {}
    }
  }, 'dsh-concise: composer toggle entry')
}
