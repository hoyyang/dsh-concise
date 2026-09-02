/**
 * dsh-concise client：
 * 在 composer 工具行「模型选择按钮」右侧注入 Concise 输出风格开关按钮。
 *
 * 落位实现：right 槽（conversation.input.right）条目被官方渲染在模型按钮【左侧】，
 * 与直觉相反；因此本插件以 right 槽条目为自定位锚点——组件挂载后从自身 DOM 出发
 * 找到同一工具行内的模型 seat 容器，把一个自有 portal 容器 insert 到它的紧右侧
 * （模型按钮与发送按钮之间），并用 MutationObserver 保持相对位置。
 * 找不到模型 seat 时（理论边缘态）退化为 right 槽原位渲染，功能不丢。
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
  '.dsh-concise-root{position:relative;flex:none;display:inline-flex}',
  '.dsh-concise-trigger{min-width:0;height:28px;cursor:pointer;background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:24px;outline:none;align-items:center;gap:6px;padding:0 10px;font-size:12px;font-weight:500;line-height:20px;display:inline-flex;color:var(--dsw-alias-label-secondary);transition:background-color .12s ease,border-color .12s ease,color .12s ease}',
  '.dsh-concise-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
  '.dsh-concise-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}',
  '.dsh-concise-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default;opacity:.7}',
  '.dsh-concise-dot{width:7px;height:7px;border-radius:100%;flex:none;background:var(--dsw-alias-label-dimmed);border:1px solid var(--dsw-alias-border-l2);transition:background-color .12s ease,border-color .12s ease,box-shadow .12s ease}',
  '.dsh-concise-label{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}',
  '.dsh-concise-state{font-size:11px;line-height:16px;flex:none;color:var(--dsw-alias-label-caption)}',
  // ON 态：Claude 品牌橙（#D97757）描边 + 实心点，浮在 composer 原生控件旁不突兀
  '.dsh-concise-trigger[data-on="true"]{color:var(--dsw-alias-label-primary);border-color:rgba(217,119,87,.72)}',
  '.dsh-concise-trigger[data-on="true"] .dsh-concise-dot{background:rgba(217,119,87,.9);border-color:rgba(217,119,87,.9);box-shadow:0 0 6px rgba(217,119,87,.55)}',
  '.dsh-concise-trigger[data-on="true"] .dsh-concise-state{color:rgb(193,95,60)}',
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

async function fetchState(sessionId: string | undefined): Promise<boolean | null> {
  try {
    const qs = sessionId ? '?sessionId=' + encodeURIComponent(sessionId) : ''
    const response = await fetch(STATE_URL + qs, { cache: 'no-store' })
    if (!response.ok) return null
    const data = await response.json() as { enabled?: unknown }
    return data.enabled === true
  } catch {
    return null
  }
}

const ConciseButton = ({ t, sessionId }: { t: (key: string) => string; sessionId?: string }): React.ReactElement => {
  const [enabled, setEnabled] = React.useState<boolean | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    let disposed = false
    void fetchState(sessionId).then((value) => {
      if (!disposed && value !== null) setEnabled(value)
    })
    const refetch = () => {
      void fetchState(sessionId).then((value) => {
        if (value !== null) setEnabled(value)
      })
    }
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean; sessionId?: string }>).detail
      // 只接受同一会话的即时广播；其它会话的变化走轮询/focus 重取
      if (detail && typeof detail.enabled === 'boolean' && detail.sessionId === sessionId) setEnabled(detail.enabled)
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
        setEnabled(next)
        window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { enabled: next, sessionId } }))
      }
    } catch (error) {
      console.warn('[dsh-concise] toggle failed:', error)
    } finally {
      setBusy(false)
    }
  }

  const on = enabled === true
  const stateLabel = enabled === null ? t('unknown') : on ? t('on') : t('off')
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
      React.createElement('span', { className: 'dsh-concise-dot', 'aria-hidden': true }),
      React.createElement('span', { className: 'dsh-concise-label' }, 'Concise'),
      React.createElement('span', { className: 'dsh-concise-state' }, stateLabel),
    ),
  )
}

/**
 * right 槽条目：自身仅渲染一个不可见的锚根（display:contents），
 * 真正的按钮 portal 到模型 seat 紧右侧；模型 seat 缺失时退化为原位渲染。
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
      if (anchor.parentElement !== found.row || anchor.previousElementSibling !== found.seat) {
        found.seat.after(anchor)
      }
      if (!portalRoot) {
        portalRoot = createRoot(anchor)
        portalRoot.render(React.createElement(ConciseButton, { t, sessionId }))
      }
      if (observedRow !== found.row) {
        observer.disconnect()
        observer.observe(found.row, { childList: true })
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
 * Client plugin body：注册字典、样式与 right 槽条目（按钮随后 portal 到模型按钮右侧）。
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

  // 1) right 槽条目（锚点 + portal 落位到模型按钮右侧）；inject 把当前会话 id 传给组件
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
