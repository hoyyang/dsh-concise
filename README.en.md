# dsh-concise

![banner](assets/banner.png)

Based on Claude Code's built-in **Concise output style** (unchanged upstream since 2.1.258) plus this plugin's own extension, for DeepSeek Harness (dsh): a composer toggle in the zone left of the model picker — hugging the prompt-enhancer button — that makes every reply **lead with results and skip the filler** — while the depth of investigation, verification, and double-checking stays exactly the same. With Concise on, every reply opens with an engineering-blueprint digest card — faint grid, corner measurement ticks, monospace 1.18em — and selecting text inside the card copies it on mouse-up.

[**中文**](README.md) · [Releases](https://github.com/hoyyang/dsh-concise/releases) · [Changelog](CHANGELOG.md)

<p align="center">
  <img alt="dsh compatibility" src="https://img.shields.io/badge/dsh-0.1.0--rc.8%2B-blue">
  <img alt="npm" src="https://img.shields.io/npm/v/dsh-concise">
  <img alt="downloads" src="https://img.shields.io/npm/dw/dsh-concise">
  <img alt="release" src="https://img.shields.io/github/v/release/hoyyang/dsh-concise">
  <img alt="license" src="https://img.shields.io/github/license/hoyyang/dsh-concise">
  <img alt="stars" src="https://img.shields.io/github/stars/hoyyang/dsh-concise?style=flat">
</p>

## Install

```sh
dsh plugin add hoyyang/dsh-concise
```

**Zero config** — no API keys, no accounts, no settings. Refresh the web UI after install and the toggle appears left of the model picker, hugging the prompt-enhancer button when it is present. Requires dsh web 0.1.0-rc.8+ (verified on 0.1.0-rc.8).

## Toggle off vs on — same question, same model

Asked "introduce JavaScript closures with one use case" in two sessions, differing only by the Concise toggle:

![Before/after: off = a 1.2K-tok article, on = two sentences straight to the point](assets/before-after-zh.png)

With Concise on you get:

- **The answer is the first sentence** — no "Sure, let me explain…", no preamble, no narration
- **Water is removed, substance is not** — commands, paths, risks, and next steps survive verbatim; what goes is recap, boilerplate closers, decorative sections
- **Work depth unchanged** — investigation, verification, and double-checking happen exactly as before (it's written into the injected prompt)
- **Long sessions save tokens** — the preamble and recaps you skip every turn add up

In one line: **the answer didn't get smaller — the filler is gone.**

## 30-second start

1. Install, refresh the page
2. Find the prompt-enhancer pill (`✦ 标准/轻量`, dsh-improve-prompt) in the composer tool row — the `● Concise` toggle sits immediately LEFT of it (switch side hugging the pill), with the prompt-enhancer itself left of the model picker (without improve-prompt installed, Concise hugs the model picker's left side)
3. Click it; the next reply follows the new style. Orange = on, grey = off

The toggle is **per-session**: turning it on here doesn't touch your other sessions (new sessions start off; set `defaultEnabled: true` to change that).

## Features

- **One-click toggle (collapsed)** immediately left of the prompt-enhancer button (row order: Concise → prompt-enhancer → model picker): only the switch shows by default, pinned against the pill — hover or keyboard focus expands the Concise label leftward with the right edge pinned, never shifting neighboring controls
- **Plain-language digest card**: with Concise on, EVERY reply opens with an engineering-blueprint card (faint grid + corner ticks + monospace 1.18em, dark text on light, works in both themes) — the rule is issued unconditionally and re-injected on every model assembly — 2-3 plain sentences restating the conclusion with key words bolded; it only restates what the body already says; selecting text inside copies it on mouse-up (header flashes COPIED ✓; this plugin's fork extswers skip it (this plugin's fork extension beyond upstream Concise)
- **`/concise` command** in the slash menu and CLI sessions: `/concise`, `/concise on|off`, `/concise status` (parity with Claude Code's `/output-style`)
- **Custom style**: a non-empty `~/.dsh/dsh-concise/style.md` overrides the built-in style text, effective on the next assembly (parity with `/output-style:new`)
- **Claude's Concise style**: results first, no preamble, no narration, no filler closers
- **Same work depth**: only reporting is compressed — never the rigor
- **Effective on the next turn** via a dynamic system-prompt section (no restart, no session reload)
- **Per-session scope**: the toggle only affects the current session's new replies — sessions stay independent (new sessions default off, configurable via `defaultEnabled`)
- **Persistent**: per-session state survives restarts (atomic writes)
- **Auto re-sync**: the button polls lightly every 15 s (visible tab only) plus on focus/visibility, so `/concise`, API, or other-tab changes are reflected without reload
- **Clear visual state**: Claude-orange aurora gradient track with breathing glow when on, neutral glass when off; sheen sweep on hover and springy press feedback (all motion off under `prefers-reduced-motion`)
- **Accessible**: `aria-pressed` toggle semantics, zh/en localized tooltip
- **Multi-tab sync** via a custom DOM event
- **Precise placement**: anchors immediately left of the prompt-enhancer entry (`div.dip-root`), whose own spot stays left of the model selection buttons; without improve-prompt it anchors left of the model button (the official right-slot actually renders left of the model button, which this plugin treats as its placement zone)
- **Graceful degradation** when the model seat cannot be found
- **Clean uninstall**: section, route, host command, styles, and client registration all removed

## Usage

Example (real output, toggle on, asked "explain HTTP 302 in one sentence"):

> HTTP 302 is a redirect status code indicating the requested resource has temporarily moved to the URL in the Location header; the client should re-issue the request there while the original URL remains valid (unlike 301, search engines do not transfer ranking).

Scriptable local API:

```sh
curl http://127.0.0.1:3080/dsh-concise/api/state   # → {"enabled":false}
curl -X POST http://127.0.0.1:3080/dsh-concise/api/toggle  # → {"enabled":true}
curl -X POST -H 'content-type: application/json' -d '{"enabled":true}' \
  http://127.0.0.1:3080/dsh-concise/api/set          # → {"enabled":true}
```

Slash command (also works in CLI sessions):

```text
/concise          # toggle
/concise on|off   # explicit set
/concise status   # state + style source (built-in / custom)
```

Custom style: put your own text in `~/.dsh/dsh-concise/style.md` to fully replace the built-in style text — saved edits apply from the next model assembly; delete the file to restore the built-in.

## How it works

| Layer | Mechanism |
| --- | --- |
| Prompt injection | `systemPrompt.section({ name: 'dsh-concise:style', order: 40 })` with a function-valued `text`; disabled renders as an empty string and is dropped |
| Host command | `commands.register({ name: 'concise' })` — `/concise [on\|off\|status]`, listed in the slash menu automatically |
| Custom style | `$DSH_HOME/dsh-concise/style.md` overrides the built-in text when non-empty; mtime-cached per assembly |
| Toggle API | `webServer.register` prefix route `/dsh-concise/api`: `GET /state`, `POST /toggle`, `POST /set` (loopback only) |
| UI placement | client module anchors in the `conversation.input.right` slot and portals the button left of the prompt-enhancer entry (or left of the model seat when absent), kept in place by a `MutationObserver` |
| Per-session state | `$DSH_HOME/dsh-concise/state.json`: `default` + per-session overrides (500-entry LRU), atomic tmp+rename write |
| State sync | per-session `dsh-concise:change` DOM event on toggle + 15 s light polling (visible tab) + focus/visibility refetch |
| Digest rendering | the style text asks for a `> **摘要：**` blockquote on non-trivial replies; the client watches the message DOM (subtree + rAF batching) and upgrades matching blockquotes to an engineering-blueprint card (faint grid via ::before brightening on hover, corner brackets ::after drawing in on mount, monospace 1.18em, selection-copy interaction, concept `assets/style-digest-v07e.png`); original: a warm-paper amber card (gradient border + gradient label + corner glow, theme-independent); removed cleanly on uninstall |

## Use cases

Daily Q&A and study notes · code-review verdicts · bug triage reports · weekly updates · architecture decisions · ops runbooks · long multi-turn sessions · team-wide style consistency · per-stage style switching in automation pipelines.

## License

[MIT](LICENSE)
