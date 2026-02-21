<p align="center">
  <img src="icon.png" width="128" height="128" alt="AI Wrapped icon" />
</p>

# AI Wrapped

Spotify Wrapped-style desktop dashboard for your AI coding agent activity. A visual summary across multiple agents.

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
- Active day coverage ring
- System tray with today's stats at a glance

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
3. Aggregated daily stats are written to `~/.ai-stats/daily.json`
4. The frontend fetches summaries over RPC and renders the Wrapped-style dashboard
