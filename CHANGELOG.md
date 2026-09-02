# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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

[0.4.0]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.4.0
[0.3.1]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.3.1
[0.3.0]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.3.0
[0.2.0]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.2.0
[0.1.0]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.1.0
