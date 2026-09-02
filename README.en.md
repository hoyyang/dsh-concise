# dsh-concise

![banner](assets/banner.png)

Port of Claude Code's built-in **Concise output style** for DeepSeek Harness (dsh): a toggle right next to the model picker in the composer that makes every reply **lead with results and skip the filler** — while the depth of investigation, verification, and double-checking stays exactly the same.

[**中文**](README.md) · [Releases](https://github.com/hoyyang/dsh-concise/releases) · [Changelog](CHANGELOG.md)

<p align="center">
  <img alt="dsh compatibility" src="https://img.shields.io/badge/dsh-0.1.0--rc.8%2B-blue">
  <img alt="release" src="https://img.shields.io/github/v/release/hoyyang/dsh-concise">
  <img alt="license" src="https://img.shields.io/github/license/hoyyang/dsh-concise">
  <img alt="stars" src="https://img.shields.io/github/stars/hoyyang/dsh-concise?style=flat">
</p>

## Install

```sh
dsh plugin add hoyyang/dsh-concise
```

**Zero config** — no API keys, no accounts, no settings. Refresh the web UI after install and the toggle appears next to the model picker. Requires dsh web 0.1.0-rc.8+ (verified on 0.1.0-rc.8).

## Features

- **One-click toggle** next to the model selection button (`● Concise ON/OFF`)
- **Claude's Concise style**: results first, no preamble, no narration, no filler closers
- **Same work depth**: only reporting is compressed — never the rigor
- **Effective on the next turn** via a dynamic system-prompt section (no restart, no session reload)
- **Global scope**: consistent style across every session
- **Persistent**: atomic state file survives restarts
- **Clear visual state**: Claude-orange outline + solid dot when on, neutral grey when off
- **Accessible**: `aria-pressed` toggle semantics, zh/en localized tooltip
- **Multi-tab sync** via a custom DOM event
- **Precise placement**: anchors immediately right of the model button (fixing the official right-slot's actual left-of-model rendering)
- **Graceful degradation** when the model seat cannot be found
- **Clean uninstall**: section, route, styles, and client registration all removed

## Usage

Click the toggle; the next reply leads with the answer. Example (real output, toggle on, asked "explain HTTP 302 in one sentence"):

> HTTP 302 is a redirect status code indicating the requested resource has temporarily moved to the URL in the Location header; the client should re-issue the request there while the original URL remains valid (unlike 301, search engines do not transfer ranking).

Scriptable local API:

```sh
curl http://127.0.0.1:3080/dsh-concise/api/state   # → {"enabled":false}
curl -X POST http://127.0.0.1:3080/dsh-concise/api/toggle  # → {"enabled":true}
curl -X POST -H 'content-type: application/json' -d '{"enabled":true}' \
  http://127.0.0.1:3080/dsh-concise/api/set          # → {"enabled":true}
```

## How it works

| Layer | Mechanism |
| --- | --- |
| Prompt injection | `systemPrompt.section({ name: 'dsh-concise:style', order: 40 })` with a function-valued `text`; disabled renders as an empty string and is dropped |
| Toggle API | `webServer.register` prefix route `/dsh-concise/api`: `GET /state`, `POST /toggle`, `POST /set` (loopback only) |
| UI placement | client module anchors in the `conversation.input.right` slot and portals the button right of the model seat, kept in place by a `MutationObserver` |
| Persistence | `$DSH_HOME` (default `~/.dsh`) `/dsh-concise/state.json`, atomic tmp+rename write |

## Use cases

Daily Q&A and study notes · code-review verdicts · bug triage reports · weekly updates · architecture decisions · ops runbooks · long multi-turn sessions · team-wide style consistency · per-stage style switching in automation pipelines.

## License

[MIT](LICENSE)
