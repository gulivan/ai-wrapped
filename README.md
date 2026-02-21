<p align="center">
  <img src="icon.png" width="128" height="128" alt="AI Wrapped icon" />
</p>

<h1 align="center">AI Wrapped</h1>

<p align="center">
  Spotify Wrapped-style desktop dashboard for your AI coding agent activity.
  <br />
  <a href="https://ai-wrapped.com">ai-wrapped.com</a> · <a href="https://www.npmjs.com/package/ai-wrapped"><img src="https://img.shields.io/npm/v/ai-wrapped" alt="npm" /></a>
</p>

A visual summary across multiple agents.

Built on [Electrobun](https://electrobun.dev) — a TypeScript-first desktop framework using Bun + native webviews.

Built on top of [agent-sessions](https://github.com/jazzyalex/agent-sessions) session format discovery — reads JSONL/JSON session logs that AI coding agents write to disk.

## Supported Agents

- **Claude Code** — `~/.claude/projects/` JSONL sessions + subagent logs
- **OpenAI Codex** — Codex CLI session files
- **Google Gemini CLI** — Gemini session logs
- **OpenCode** — OpenCode session data
- **Droid** — Droid session files
- **GitHub Copilot** — Copilot session logs

## What It Shows

- Total sessions, messages, tool calls, tokens, and estimated cost
- Daily activity timeline with per-agent and per-model breakdown
- Cost breakdown by model (Claude Opus, Sonnet, GPT-4o, Gemini Pro, etc.)
- Agent usage distribution (pie chart)
- Time spent — total hours, average session duration, longest session, current streak, active day coverage ring
- Top repositories with sessions, tokens, cost, and duration
- Coding hours — 24-hour activity breakdown by agent
- Shareable dashboard links via [ai-wrapped.com/share](https://ai-wrapped.com/share)
- System tray with today's stats at a glance

## Install

```bash
bunx ai-wrapped
```

Flags: `--version`, `--rebuild`, `--uninstall`

## Stack

- **Runtime**: [Bun](https://bun.sh)
- **Desktop**: [Electrobun](https://electrobun.dev) (native webview, no Chromium bundling on macOS)
- **Frontend**: React + Tailwind CSS + Recharts
- **Build**: Vite (frontend) + Electrobun CLI (app bundle)
- **Storage**: JSON files in `~/.ai-wrapped/`

## Getting Started

```bash
bun install
```

### Development

```bash
bun run dev
```

Or with HMR for the frontend:

```bash
bun run dev:hmr
```

### Production Build

```bash
bun run build:prod
```

## How It Works

1. On launch (and every 5 minutes by default), the app scans known session directories for each agent
2. New or changed session files are parsed into a normalized format with token counts, tool calls, and cost estimates
3. Aggregated daily stats are written to `~/.ai-wrapped/daily.json`
4. The frontend fetches summaries over RPC and renders the Wrapped-style dashboard
