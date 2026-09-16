# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
