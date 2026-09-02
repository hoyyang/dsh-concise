# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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

[0.1.0]: https://github.com/hoyyang/dsh-concise/releases/tag/v0.1.0
