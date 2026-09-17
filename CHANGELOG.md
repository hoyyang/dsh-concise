# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.8.7] - 2026-09-17

### Fixed
- 用户实测两问题：①图片 chip 点击打开的是所在文件夹而非文件本身；②md 文件 chip 点击只复制路径。
  根因：宿主 open-in-app open 路由的 wire 校验只接受**已存在目录**（读宿主源码确认 isDirectory 硬校验，
  文件路径一律 404）→ 0.8.6 的目录回退只解决了「有反应」没解决「打开文件」；且**相对路径**（摘要里的
  var/scripts/….md）未经绝对化直接 POST → 400 → 降级复制。
- 修复：
  ① 文本/图片类（代码/Markdown/图片/文件）点击改为 **IDE 协议真打开文件本身**：cursor/vscode/windsurf/zed
     协议按探测优先（window.open(ide://file<abs>)），宿主目录回退保留为无 IDE 时的兜底；
  ② 相对路径绝对化：host 在 assemble waterfall 缓存 session.header.cwd + 新增 GET /dsh-concise/api/cwd
     （sid 缓存 → 最近 cwd → process.cwd 兜底）；client 点击时 GET cwd → resolveAbsolute（~/按 home、
     相对按 cwd）；cwd 不可得时按原样尝试失败降级复制。
- 划选复制依旧不受影响。

### Verified
- 真机 spy 实测：绝对路径 → cursor://file/Users/demo/Desktop/测试.png ✓；相对路径解析链路通（注入卡
  无组装历史走 process.cwd 兜底；真实时序发消息后即有正确 cwd）。host 5/5 + chips 7/7。

## [0.8.6] - 2026-09-17

### Fixed
- 点击 chip 无动作（用户报告「只复制不跳转/不打开」）：
  ① URL chip 改为显式 window.open 跳转（不依赖 <a> 默认行为，任何宿主点击拦截都不影响）。
  ② 本地文件 chip 接入宿主 open-in-app 系统打开路由，点击真正用系统应用打开：GET /open-in-app/apps
     探测（响应形态 {apps:[…]}，0.8.5 只认裸数组导致永远走复制降级——已修）→ POST /open-in-app/open。
     宿主 wire 校验只接受已存在目录：文件路径 404 时自动回退打开所在目录（Finder 定位）；
     应用选择 = OS 文件管理器优先（shell-open 可开任何路径）、代码类先试 cursor/vscode；
     打开失败自动降级复制路径。徽标：已打开 ✓ / 已复制 ✓。
- 划选复制（mouseup 划选→松开复制）不受影响：chip click 的 stopPropagation 仅作用于 chip 自身 click。

### Verified
- 真机（playwright）：点击 URL chip 新 tab 打开目标页；点击文件 chip → POST 404（文件）→ 自动目录回退
  → POST 200（Finder 打开）。host 5/5 + chips 5/5。

## [0.8.5] - 2026-09-17

### Added
- 摘要卡内路径 chip 系统：卡内的网页链接与本地文件路径自动转为类型化可交互 chip——网页链接直接
  跳转（target=_blank + noopener），本地文件点击复制路径（web 安全模型内最可靠的「直接可用」交互，
  宿主无 file:// 打开机制已实测）；按扩展名分 10 类图标与类型色（图片/PDF/Word/表格/代码/Markdown/
  压缩包/文件夹/网页/文件），hover 上浮 + 类型色辉光、入场淡入、复制后「已复制 ✓」徽标，
  prefers-reduced-motion 全适配。**摘要卡片本体样式零改动**（chip 全部限定卡内作用域）。
- 设计参考：ui-screenshot-system 模板生成 chip 组件系统设计稿（assets 未入库，设计定稿为代码实现）。

### Security
- 路径文本一律 textContent 注入（防 HTML 注入）；图标为静态内联 SVG 常量。

### Tests
- chips.test.ts 5/5：10 类扩展名映射、混合摘要文本切分边界（中文句读不吞入、尾标点剥离、
  无路径纯文本无误报）、类型色与标签携带。

## [0.8.4] - 2026-09-17

### Fixed
- 首轮长评估型最终回复缺失摘要卡（实证：AutoFillUI 气泡转发评估会话第一轮「## 结论」开头 9k 字方案
  无摘要；第二轮也缺——0.8.3 miss 闭环无历史可依且事件链路死亡）。
- **0.8.3 事件闭环实测废弃**：assistant/message + user/message 探针零到达（session.append 落盘事件不
  派发到插件 ctx）——Phase 2 教训：事件可达性必须实测，不能以类型声明推断。
- **v0.8.4 真实现**：system-prompt/assemble waterfall（可达性有 dsh-smart-compact 生产先例）监听中用
  session.deriveMessages() 同步判定最后一条 assistant 消息是否以摘要块开头；缺失或首轮无历史 → 向
  assembly 追加 COMPLIANCE WARNING（逐会话判定、覆盖首轮、无事件依赖）。回调失败不阻断组装。
- style 点名：heading opener（## 结论 / ## 方案）不是摘要。

### Tests
- waterfall 契约 2 用例（缺摘要→assembly 追加警告；合规与全新会话首轮→分别无/有警告），
  host 5/5；staging 真机首轮评估场景带卡 PASS。

## [0.8.3] - 2026-09-17

### Fixed
- 深会话「任务完成汇报型」最终回复系统性缺失摘要卡（实证：autofill-ai-parser-L3/L4 会话 09-17
  16:09-17:53 五条交付汇报型最终回复 0/5 带卡，短任务回复 8/8 正常；v0.8.1/0.8.2 措辞均未覆盖）。
  措辞点名追不上模型自分类，本轮引入机制性修复：
  ① miss 检测反馈闭环：host 监听 assistant/message + user/message 会话事件，跟踪「最后一条带文本的
     assistant 消息」是否以摘要块开头，user 消息到达（= 上个 turn 结束）时固化标记；reminder section
     据此在下一轮注入 COMPLIANCE WARNING。已知边界：事件载荷无 sessionId → 全局单标记（并行会话
     可能跨会话注入无害警告）；事件不可见环境静默降级为纯措辞。
  ② reminder 改为发送前自检清单式（SELF-CHECK + 豁免不带进最终回复）。
  ③ style 点名 task-completion reports（全部完成/已实施/方案已落盘/交付物清单）不是摘要的替代品。

### Changed
- host.test.mjs 新增 miss 闭环 2 用例（缺摘要→WARNING 注入→带摘要清除）；mockCtx 增加 on 事件捕获。

## [0.8.3] - 2026-09-17

### Fixed
- 深会话「任务完成汇报型」最终回复系统性缺失摘要卡（实证：autofill-ai-parser-L3/L4 会话 09-17
  16:09-17:53 五条交付汇报型最终回复 0/5 带卡，短任务回复 8/8 正常；v0.8.1/0.8.2 措辞均未覆盖）。
  措辞点名追不上模型自分类，本轮引入机制性修复：
  ① miss 检测反馈闭环：host 监听 assistant/message + user/message 会话事件，跟踪「最后一条带文本的
     assistant 消息」是否以摘要块开头，user 消息到达（= 上个 turn 结束）时固化标记；reminder section
     据此在下一轮注入 COMPLIANCE WARNING。已知边界：事件载荷无 sessionId → 全局单标记（并行会话
     可能跨会话注入无害警告）；事件不可见环境静默降级为纯措辞。
  ② reminder 改为发送前自检清单式（SELF-CHECK + 豁免不带进最终回复）。
  ③ style 点名 task-completion reports（全部完成/已实施/方案已落盘/交付物清单）不是摘要的替代品。

### Changed
- host.test.mjs 新增 miss 闭环 2 用例（缺摘要→WARNING 注入→带摘要清除）；mockCtx 增加 on 事件捕获。

## [0.8.2] - 2026-09-17

### Fixed
- 摘要卡内链接被宿主渲染管线污染：blockquote 内容走「纯文本 + 自定义 linkify」路径，其 URL 字符类
  含 * 与 pct 编码段，把紧贴 URL 的粗体标记与中文句读一并吞进 href（实测形态
  https://feishu.cn/wiki/xxx**%E3%80%82，飞书 404）；同一 URL 在正文以 [label](url) 写法则正常。
  修复 = client 摘要卡渲染增强内新增确定性兜底：normalizeDigestHref/normalizeDigestText 剥离 href
  与链接文字尾部的星号/中文句读（循环至稳定；剥空或无 scheme 回退原值）。标准链接为 no-op。
- style 措辞新增：URLs, file paths, and code spans stay bare (or [label](url)) — bold corrupts links。

### Changed
- 单测新增长 digest 链接规范化契约（test/normalize.test.ts，node --test --experimental-strip-types 直跑 TS，零新增依赖）。

## [0.8.1] - 2026-09-16

### Fixed
- 摘要卡在长解释型最终回复中缺失（实证：L4 会话 seq388/464，注入链路与开关均正常，模型对长文档式回复不遵循 digest 契约）。
- style 正文新增「Length and structure are NOT exemptions」点名长解释/表格型回复不得豁免；reminder 尾部提醒升级为「首渲染元素必须是摘要块 + 长回复最易漏」双重措辞。

### Changed
- 合规回归新增长解释型样本（复刻失效模式），不再只测短任务样本（0.8.0 的 86% 合规率盲区，STATE 风险③兑现）。

## [0.8.0] - 2026-09-15

### Changed

- Digest mandate rescoped: "every reply, no exceptions" → "every user-facing final
  reply" (intermediate step narration between tool calls is exempt). Empirical
  transcript audit (45 sessions, 2026-09-15) showed the unconditional mandate
  loses to skill-report formats in long agentic runs — 0 digests in both /bugfix
  runs and in tool-heavy turns, while chat finals complied. Narrowing the scope
  removes the conflict instead of fighting it.
- Added a tail reminder prompt section (`dsh-concise:reminder`, order 900, same
  per-session gating) that re-states the digest-first requirement at the end of
  the system prompt, countering long-prompt compliance decay.

### Fixed

- Headless/CLI profiles can now assemble the plugin: `webServer` is no longer a
  hard `inject` dependency (it blocked assembly forever in any profile without a
  web server — the style sections never reached headless sessions). The HTTP
  toggle API now attaches reactively via `ctx.inject(['webServer'], …)` and the
  style/reminder sections work everywhere; only the API degrades when absent.
- Client digest renderer matches blockquote prefixes 摘要： and 说人话： — digest
  outputs from sessions run under pre-0.7 style text render as cards again
  instead of degrading to plain quotes.
- state.json LRU eviction (500 cap) evicts entries whose value equals the
  session default first, so entries carrying explicit user intent survive:
  an explicitly-disabled session no longer silently flips back to the default
  after eviction.

## [0.7.0] - 2026-09-15

### Added

- Plain-language digest card: with Concise on, EVERY reply opens with a
  fixed-format blockquote — `> **摘要：** <2-3 plain sentences>` — restating
  the turn's conclusion in plain words. The rule is MANDATORY (unconditional,
  first rule of the style text, re-injected on every model assembly) so the
  card triggers on every Concise-on turn. Guardrail: the digest may only
  restate conclusions already present in the body (no new facts, trade-offs,
  or analogies).
- Client renderer enhancement: blockquotes starting with 摘要： are upgraded
  to an engineering-blueprint card — white face with a faint grid (::before,
  brightens on hover), four orange corner measurement brackets (::after, eight
  gradient layers, drawn in on mount), monospace font stack at 1.18em, header
  `DIGEST // 说人话`, and a real interaction: selecting any text inside the card
  copies it on mouse-up (header flashes COPIED ✓). Implemented via a
  document-subtree MutationObserver with rAF batching; classes, state and
  listeners are removed cleanly on uninstall. Design reference:
  `assets/style-digest-v07e.png` (generated with GPT-Image-2; v07 pastel,
  v07b dark-glass and v07c warm-paper were rejected directions).

### Changed

- **Fork declaration**: dsh-concise is no longer a byte-parity port of Claude
  Code's built-in Concise output style — it is now Claude Code Concise plus
  this plugin's digest-card extension. Verified 2026-09-15 against Claude Code
  2.1.272: upstream Concise is unchanged since 2.1.258, so nothing to re-sync.

## [0.6.0] - 2026-09-14

### Changed

- Placement swap: the Concise toggle now portals immediately LEFT of the
  prompt-enhancer entry (row order: Concise → ✦标准 pill → model picker).
  dsh-improve-prompt is untouched — it simply sits where Concise used to be.
- Expansion direction: inside the pill the DOM order is now [Concise
  label][switch] — the switch stays pinned against the prompt-enhancer's left
  side (right edge fixed) while the label expands to the left on hover or
  keyboard focus. Label reveal uses a slight leftward drift and clips without
  an ellipsis flash.

### Fixed

- Anchor resolution climbed from the prompt-enhancer element to its row-level
  wrapper: the official right-slot renders multiple plugin entries inside one
  shared container, so the previous child-wise probe skipped the container
  (it also contains this plugin's own seat root) and the button silently fell
  back to the old position. Resolution now starts from the `.dip-root`
  element itself and walks up to the direct child of the tool row.

## [0.5.0] - 2026-09-14

### Added

- Collapsed toggle: only the 30×16 switch shows by default; the Concise label
  smoothly expands on hover or keyboard focus (max-width + opacity + translate
  transitions). The button is absolutely positioned and right-anchored inside
  a fixed-width placeholder, so expanding never shifts neighboring composer
  controls — the right edge stays pinned and the pill grows leftward.
- Expressive styling (design concept: `assets/style-concept-v05.png`, generated
  with GPT-Image-2): glass shell with top highlight, Claude-orange aurora
  gradient track (135°, #F0B08F → #D97757 → #C25E3F) with a breathing glow
  while on, one-shot diagonal sheen sweep on hover, press-scale + springy knob
  feedback. All motion disabled under `prefers-reduced-motion: reduce`; the
  focus-visible ring stays intact in the on state.

### Changed

- Collapsed width ≈42 px (switch only); expanded ≈100 px while hovered.
- README feature list updated for the collapsed interaction and new visuals.

## [0.4.1] - 2026-09-14

### Changed

- Toggle placement moved into the left zone of the composer tool row: the
  Concise button now portals immediately right of the dsh-improve-prompt
  entry (the sparkle "标准/轻量" pill) — i.e. left of the model selection
  buttons (official model picker and kiro model selector alike).
- Resilient anchor resolution against concurrent restyles of improve-prompt:
  exact `.dip-root` class, then a `dip-` class-prefix probe, then an
  aria-label text match (增强提示词 / enhance prompt).
- Fallback placement without improve-prompt: immediately left of the model
  seat (same zone), replacing the old right-of-model position; the in-slot
  last-resort fallback is unchanged.

## [0.4.0] - 2026-09-02

### Added

- Sliding-switch toggle UI: the solid dot is now an iOS-style track + knob
  (spring cubic-bezier slide, press-to-stretch feedback, Claude-orange glow
  when on) — state reads instantly from the switch itself; the redundant
  开/关 text was removed.

### Changed

- Stronger concise style prompt: never open by restating the question or with
  pleasantries; no closing offers unless a decision is required; enumerable
  facts prefer tables/tight lists ("structure is not verbosity"); no
  between-step narration. Verified live: a knowledge question that took the
  default style 5m21s / 2.5K tok of sprawling sections answered in 57s /
  1.6K tok with an essence-first line plus a compact table.

### Fixed

- Session switching no longer flashes a loading state on the toggle: per-
  session state is cached client-side (stale-while-revalidate) and the API
  now reports the new-session default so unknown sessions render instantly.

## [0.3.1] - 2026-09-02

### Changed

- README restructure: a real before/after comparison (same question, same
  model, only the Concise toggle differs) now leads the document, followed by
  a 30-second start guide; reader priority is install → what changes → how
  to use → advanced → internals.

## [0.3.0] - 2026-09-02

### Changed

- **Scope: per-session.** The toggle now affects only the session it is
  toggled in — each session remembers its own state, sessions stay
  independent, and new sessions start from a configurable default
  (`defaultEnabled`, off by default). The section text resolves the
  assembling session via `context.agent.session.id`.

### Added

- Session-scoped API: `GET /state`, `POST /toggle`, `POST /set` accept a
  `sessionId` (query or body); calls without one operate on the new-session
  default. `/concise` operates on the invoking session.
- Session-state persistence with 500-entry LRU pruning, plus automatic
  migration of the 0.2.0 single-switch state file.

## [0.2.0] - 2026-09-02

### Added

- `/concise` host command — toggle or query the style from the slash menu and
  CLI sessions: `/concise`, `/concise on`, `/concise off`, `/concise status`
  (parity with Claude Code's `/output-style`).
- Custom style override: a non-empty `$DSH_HOME/dsh-concise/style.md` replaces
  the built-in style text (mtime-cached, edits effective on the next model
  assembly) — parity with Claude Code's `/output-style:new` custom styles.
- Composer button now re-syncs its state on a light 15 s interval (visible tab
  only) plus on window focus and visibility change, so changes made through
  `/concise`, the HTTP API, or another tab are reflected without reload.

## [0.1.0] - 2026-09-02

### Added

- Concise output style toggle button placed immediately right of the model
  selection button in the dsh web composer, with Claude-orange on state and
  neutral grey off state.
- System prompt section injection (`dsh-concise:style`, order 40) with a
  function-valued `text` evaluated per assembly; disabling yields an empty
  string which the renderer drops, so toggling is effective on the next turn.
- Local HTTP API under `/dsh-concise/api`: `GET /state`, `POST /toggle`,
  `POST /set` (loopback only).
- Persistent state file `$DSH_HOME/dsh-concise/state.json` written atomically
  (tmp + rename), surviving restarts.
- Self-anchoring UI placement: portal container inserted right after the model
  seat element, position maintained by a MutationObserver across React
  re-renders and seat rebuilds; falls back to in-slot rendering when the model
  seat cannot be found.
- Multi-instance synchronization via a `dsh-concise:change` custom event plus
  window-focus refetch.
- zh/en locale dictionaries with built-in fallback labels.
- Accessibility: `aria-pressed` toggle semantics and localized tooltips.

[0.7.0]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.7.0
[0.6.0]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.6.0
[0.5.0]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.5.0
[0.4.1]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.4.1
[0.4.0]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.4.0
[0.3.1]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.3.1
[0.3.0]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.3.0
[0.2.0]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.2.0
[0.1.0]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.1.0
