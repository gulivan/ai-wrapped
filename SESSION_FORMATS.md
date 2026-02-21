# Session File Formats — Verified Machine-Specific Reference

> Generated: 2026-02-21
> Machine: macOS (ivan)
> Sources: Live filesystem exploration + AGENT_SESSIONS_REFERENCE.md (Agent Sessions v2.11.2)
> Agents found on this machine: Claude Code, Codex CLI, Gemini CLI, OpenCode, Factory Droid
> Agents NOT found: GitHub Copilot CLI, OpenClaw

---

## Table of Contents

1. [Claude Code](#1-claude-code)
2. [Codex CLI](#2-codex-cli)
3. [Gemini CLI](#3-gemini-cli)
4. [OpenCode](#4-opencode)
5. [Factory Droid](#5-factory-droid)
6. [GitHub Copilot CLI](#6-github-copilot-cli-not-installed)
7. [Normalized Event Schema](#7-normalized-event-schema-agent-sessions-app)
8. [Cross-Agent Extraction Cheatsheet](#8-cross-agent-extraction-cheatsheet)
9. [Electrobun Desktop Framework Reference](#9-electrobun-desktop-framework-reference)

---

## 1. Claude Code

### Discovery

| Property | Value |
|----------|-------|
| Root | `~/.claude/projects/` |
| Glob | `~/.claude/projects/*/*.jsonl` (main sessions) |
| Glob (subagents) | `~/.claude/projects/*/*/subagents/agent-*.jsonl` |
| File pattern | `<UUID>.jsonl` |
| Directory naming | `-Users-ivan-<project-path>/` (path separators → hyphens) |
| Format | JSONL (one JSON object per line) |
| Files on this machine | **1,609** JSONL files |
| File sizes | 25 KB – 2.7 MB (avg ~363 KB) |

### Directory Structure

```
~/.claude/projects/
├── -Users-ivan-git-<repo-name>/
│   ├── <sessionId>.jsonl                    # Main session file
│   ├── <sessionId>/
│   │   ├── <sessionId>.jsonl                # Session metadata copy
│   │   └── subagents/
│   │       └── agent-<hash>.jsonl           # Multi-agent child sessions
│   └── memory/                              # Optional persistent memory
├── -Users-ivan-<project-name>/
│   └── ...
└── -Users-ivan--0spec-worktrees-<name>/     # Worktree sessions
    └── ...
```

### Event Types

| Type | Description |
|------|-------------|
| `user` | User message |
| `assistant` | Claude response |
| `progress` | Tool/hook execution progress |
| `summary` | Conversation title/summary |
| `system` | System events (hooks, commands, cancellation) |
| `file-history-snapshot` | File state snapshots for undo |

### Standard Fields (present on most events)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `type` | string | Event type | `"user"`, `"assistant"` |
| `uuid` | string (UUID) | Unique event identifier | `"91604c64-cf28-..."` |
| `parentUuid` | string \| null | Parent event (tree threading) | `"cf422878-e96b-..."` |
| `sessionId` | string (UUID) | Session identifier | `"92479b82-e8b2-..."` |
| `timestamp` | string (ISO 8601) | UTC timestamp with Z suffix | `"2026-01-23T18:52:14.456Z"` |
| `cwd` | string | Working directory | `"/Users/ivan/git/claude_router"` |
| `gitBranch` | string | Git branch (may be `""`) | `"main"`, `"HEAD"`, `""` |
| `slug` | string | Conversation slug | `"dapper-wishing-globe"` |
| `version` | string | Claude Code version | `"2.1.49"` |
| `userType` | string | Always `"external"` | `"external"` |
| `isSidechain` | boolean | Side-chain conversation flag | `false` |

### User Event

```json
{
  "type": "user",
  "uuid": "91604c64-cf28-423c-b8da-0c364001e3a4",
  "parentUuid": null,
  "sessionId": "92479b82-e8b2-4890-a228-1d094d8353cf",
  "timestamp": "2026-01-23T18:52:14.456Z",
  "cwd": "/Users/ivan/git/claude_router",
  "gitBranch": "",
  "slug": "dapper-wishing-globe",
  "version": "2.1.9",
  "userType": "external",
  "isSidechain": false,
  "message": {
    "role": "user",
    "content": "Build a self-hosted Rust proxy server..."
  }
}
```

**User-specific fields:**
- `message.role` → always `"user"`
- `message.content` → string (the user prompt)
- `thinkingMetadata` → `{ level, disabled, triggers }` (optional)
- `todos` → array (optional)

### Assistant Event

```json
{
  "type": "assistant",
  "uuid": "cf422878-e96b-4df1-805f-02451fab64ff",
  "parentUuid": "91604c64-cf28-423c-b8da-0c364001e3a4",
  "requestId": "req_011CXQpCMUXXzRik6JJVSRbw",
  "sessionId": "92479b82-e8b2-4890-a228-1d094d8353cf",
  "timestamp": "2026-01-23T18:52:25.807Z",
  "cwd": "/Users/ivan/git/claude_router",
  "gitBranch": "",
  "slug": "dapper-wishing-globe",
  "version": "2.1.9",
  "userType": "external",
  "isSidechain": false,
  "message": {
    "id": "msg_017SJnp9uKpD4QuzpTTnzKEw",
    "type": "message",
    "role": "assistant",
    "model": "claude-opus-4-5-20251101",
    "content": [
      { "type": "thinking", "thinking": "..." },
      { "type": "text", "text": "I'll build this step by step..." },
      { "type": "tool_use", "id": "toolu_01X...", "name": "Write", "input": { "file_path": "...", "content": "..." } }
    ],
    "stop_reason": "end_turn",
    "stop_sequence": null,
    "usage": {
      "input_tokens": 8,
      "output_tokens": 3,
      "cache_creation_input_tokens": 11642,
      "cache_read_input_tokens": 14604,
      "service_tier": "standard",
      "inference_geo": "not_available",
      "cache_creation": {
        "ephemeral_5m_input_tokens": 11642,
        "ephemeral_1h_input_tokens": 0
      }
    }
  }
}
```

**Assistant-specific fields:**
- `requestId` → Anthropic API request ID (`"req_..."`)
- `message.id` → Anthropic message ID (`"msg_..."`)
- `message.model` → model identifier (e.g. `"claude-opus-4-6"`, `"claude-opus-4-5-20251101"`)
- `message.stop_reason` → `"end_turn"`, `"max_tokens"`, `null`
- `message.usage` → token breakdown (see below)
- `message.content[]` → array of content blocks:
  - `{ "type": "text", "text": "..." }`
  - `{ "type": "thinking", "thinking": "..." }`
  - `{ "type": "tool_use", "id": "...", "name": "...", "input": {...} }`

### Token / Usage Object

```json
{
  "input_tokens": 8,
  "output_tokens": 3,
  "cache_creation_input_tokens": 11642,
  "cache_read_input_tokens": 14604,
  "service_tier": "standard",
  "inference_geo": "not_available",
  "cache_creation": {
    "ephemeral_5m_input_tokens": 11642,
    "ephemeral_1h_input_tokens": 0
  }
}
```

**Token extraction:**
```
Total input  = usage.input_tokens + usage.cache_read_input_tokens
Total output = usage.output_tokens
Cache write  = usage.cache_creation_input_tokens
```

### Progress Event

```json
{
  "type": "progress",
  "uuid": "21b99ce4-...",
  "parentUuid": "67ec8ee6-...",
  "sessionId": "7af38422-...",
  "timestamp": "2026-02-20T22:24:19.566Z",
  "cwd": "/Users/ivan/agent-orchestrator",
  "gitBranch": "HEAD",
  "version": "2.1.49",
  "parentToolUseID": "8c918455-...",
  "toolUseID": "8c918455-...",
  "data": {
    "type": "hook_progress",
    "hookEvent": "Stop",
    "hookName": "Stop",
    "command": "say I have completed current stage."
  }
}
```

### Summary Event

```json
{
  "type": "summary",
  "summary": "Fix PyYAML Docker build failure with --no-root flag",
  "leafUuid": "4e68342b-8a06-4d0a-be63-20c211d5ec2e"
}
```

### Extraction Summary

| Data Point | Path | Notes |
|------------|------|-------|
| Session ID | `event.sessionId` | UUID, same across all events in file |
| Timestamps | `event.timestamp` | ISO 8601 with Z suffix |
| Model | `event.message.model` | Only on `assistant` events |
| Input tokens | `event.message.usage.input_tokens` | Only on `assistant` events |
| Output tokens | `event.message.usage.output_tokens` | Only on `assistant` events |
| Cache read | `event.message.usage.cache_read_input_tokens` | Only on `assistant` events |
| Cache write | `event.message.usage.cache_creation_input_tokens` | Only on `assistant` events |
| Cost | Not stored | Must compute from tokens × model pricing |
| CWD | `event.cwd` | Top-level on most events |
| Git branch | `event.gitBranch` | Top-level, may be `""` or `"HEAD"` |
| CLI version | `event.version` | e.g. `"2.1.49"` |
| User text | `event.message.content` (string) | On `user` events |
| Assistant text | `event.message.content[].text` (array) | Filter for `type: "text"` blocks |
| Tool calls | `event.message.content[]` | Filter for `type: "tool_use"` blocks |

---

## 2. Codex CLI

### Discovery

| Property | Value |
|----------|-------|
| Root | `~/.codex/sessions/` (or `$CODEX_HOME/sessions`) |
| Glob | `~/.codex/sessions/????/??/??/rollout-*.jsonl` |
| File pattern | `rollout-YYYY-MM-DDThh-mm-ss-<ULID>.jsonl` |
| Directory structure | `YYYY/MM/DD/` date-based sharding |
| Format | JSONL |
| Files on this machine | **499** JSONL files |
| Date range | 2026-02-03 – 2026-02-21 |
| File sizes | 15 KB – 73 KB |
| Lines per file | avg ~289 |

### Directory Structure

```
~/.codex/sessions/
├── 2026/
│   └── 02/
│       ├── 03/
│       │   └── rollout-2026-02-03T11-38-55-019c22a7-9b39-7803-adcd-cc3e2a60cef9.jsonl
│       ├── 04/
│       │   └── ...
│       └── 21/
│           └── ...
└── .ccbox/                  # Internal metadata
```

### Event Types

Every JSONL line has three top-level fields:

```json
{
  "timestamp": "2026-02-03T08:38:55.572Z",
  "type": "session_meta | response_item | event_msg | turn_context",
  "payload": { ... }
}
```

| Type | Description |
|------|-------------|
| `session_meta` | First event — session initialization with git, cwd, model info |
| `response_item` | Content exchange — user/assistant messages, function calls, results |
| `event_msg` | System events — token counts, rate limits, user messages, agent reasoning |
| `turn_context` | Execution context — model, cwd, approval policy per turn |

### session_meta Event (always line 1)

```json
{
  "timestamp": "2026-02-03T08:38:55.572Z",
  "type": "session_meta",
  "payload": {
    "id": "019c22a7-9b39-7803-adcd-cc3e2a60cef9",
    "timestamp": "2026-02-03T08:38:55.572Z",
    "cwd": "/Users/ivan/git/mcpping",
    "originator": "codex_cli_rs",
    "cli_version": "0.94.0",
    "source": "cli",
    "model_provider": "openai",
    "base_instructions": {
      "text": "You are an expert software engineer..."
    },
    "git": {
      "commit_hash": "abc123def456...",
      "branch": "main",
      "repository_url": "https://github.com/user/repo"
    }
  }
}
```

### response_item Event

Contains nested `payload.type` variants:

**Message (user/assistant/developer):**
```json
{
  "timestamp": "...",
  "type": "response_item",
  "payload": {
    "type": "message",
    "role": "user",
    "content": [
      { "type": "input_text", "text": "Find all TODOs in the repo" }
    ]
  }
}
```

**Function call:**
```json
{
  "timestamp": "...",
  "type": "response_item",
  "payload": {
    "type": "function_call",
    "name": "shell_command",
    "arguments": "{\"command\":\"grep -r TODO .\"}",
    "call_id": "call_abc123"
  }
}
```

**Function call output:**
```json
{
  "timestamp": "...",
  "type": "response_item",
  "payload": {
    "type": "function_call_output",
    "call_id": "call_abc123",
    "output": "README.md:12: TODO: add tests"
  }
}
```

**Reasoning (may be encrypted):**
```json
{
  "timestamp": "...",
  "type": "response_item",
  "payload": {
    "type": "reasoning",
    "summary": [...],
    "encrypted_content": "AAECAwQ..."
  }
}
```

### event_msg Event

**Token count / rate limits:**
```json
{
  "timestamp": "...",
  "type": "event_msg",
  "payload": {
    "type": "token_count",
    "info": null,
    "rate_limits": {
      "primary": {
        "used_percent": 45.2,
        "window_minutes": 1,
        "resets_at": 1738571935
      },
      "secondary": { "used_percent": 12.0, "window_minutes": 1, "resets_at": 1738571935 },
      "credits": {
        "has_credits": true,
        "unlimited": false,
        "balance": 150.00
      },
      "plan_type": "pro"
    }
  }
}
```

**User message (via event_msg):**
```json
{
  "timestamp": "...",
  "type": "event_msg",
  "payload": {
    "type": "user_message",
    "message": "review the changes and commit",
    "images": [],
    "local_images": [],
    "text_elements": []
  }
}
```

### turn_context Event

```json
{
  "timestamp": "...",
  "type": "turn_context",
  "payload": {
    "cwd": "/Users/ivan/git/mcpping",
    "model": "gpt-5.2-codex",
    "approval_policy": "never",
    "sandbox_policy": { "type": "danger-full-access" },
    "personality": "friendly",
    "effort": "medium",
    "summary": "auto",
    "collaboration_mode": {
      "mode": "plan",
      "settings": { "model": "gpt-5.2-codex", "reasoning_effort": "high" }
    },
    "user_instructions": "...",
    "truncation_policy": { ... }
  }
}
```

### Extraction Summary

| Data Point | Path | Notes |
|------------|------|-------|
| Session ID | `payload.id` (from `session_meta`) | ULID format |
| Session ID (alt) | Filename: `rollout-...-<ULID>.jsonl` | Extract from filename |
| Timestamps | Top-level `timestamp` on every line | ISO 8601 |
| Model | `payload.model` (from `turn_context`) | e.g. `"gpt-5.2-codex"` |
| Model provider | `payload.model_provider` (from `session_meta`) | `"openai"` |
| CLI version | `payload.cli_version` (from `session_meta`) | e.g. `"0.98.0"` |
| Token counts | `payload.info` (from `event_msg` type `token_count`) | May be null |
| Rate limits | `payload.rate_limits` (from `event_msg` type `token_count`) | Includes credits balance |
| Cost | Not stored directly | Compute from tokens × pricing |
| CWD | `payload.cwd` (from `session_meta` or `turn_context`) | May change per turn |
| Git branch | `payload.git.branch` (from `session_meta`) | e.g. `"main"` |
| Git commit | `payload.git.commit_hash` (from `session_meta`) | SHA-1 |
| Git repo URL | `payload.git.repository_url` (from `session_meta`) | Full GitHub URL |

---

## 3. Gemini CLI

### Discovery

| Property | Value |
|----------|-------|
| Root | `~/.gemini/tmp/` |
| Glob | `~/.gemini/tmp/*/chats/session-*.json` |
| File pattern | `session-YYYY-MM-DDThh-mm-ss<shortId>.json` |
| Directory naming | SHA-256 hash of project path |
| Format | JSON (single object, NOT JSONL) |
| Files on this machine | **2** chat session files |
| Supporting files | `logs.json` per project, `.project_root` marker |

### Directory Structure

```
~/.gemini/tmp/
├── <project-name>/                              # Named project dir
│   ├── .project_root                            # Contains absolute project path
│   ├── chats/                                   # Chat sessions
│   └── logs.json                                # Activity log
├── <sha256-hash>/                               # Hashed project dir
│   ├── chats/
│   │   ├── session-2025-11-08T23-19-051993c3.json
│   │   └── session-2025-11-08T23-22-3995d6a1.json
│   └── logs.json
├── <sha256-hash>/
│   └── logs.json
└── bin/
    └── rg                                       # Bundled ripgrep
```

### Session JSON Schema

Each file is a single JSON object (NOT JSONL):

```json
{
  "sessionId": "051993c3-edbb-49f1-803f-ca4e10c62096",
  "projectHash": "854a8892016daf44...",
  "startTime": "2025-11-08T23:19:21.596Z",
  "lastUpdated": "2025-11-08T23:22:04.754Z",
  "messages": [
    {
      "id": "uuid-string",
      "timestamp": "2025-11-08T23:19:21.596Z",
      "type": "user",
      "content": "Hello, what does this project do?"
    },
    {
      "id": "uuid-string",
      "timestamp": "2025-11-08T23:19:28.123Z",
      "type": "gemini",
      "content": "This project is a...",
      "toolCalls": [
        {
          "id": "read_many_files-1762644155091-2416d4bf529928",
          "name": "read_many_files",
          "args": { "include_patterns": ["README.md", "package.json"] },
          "result": [{ "...": "..." }]
        }
      ],
      "thoughts": [
        {
          "subject": "Understanding project structure",
          "description": "Let me analyze the key files...",
          "timestamp": "2025-11-08T23:19:25.000Z"
        }
      ],
      "tokens": {
        "input": 17162,
        "output": 859,
        "cached": 8155,
        "thoughts": 567,
        "tool": 0,
        "total": 18588
      },
      "model": "gemini-2.5-pro"
    }
  ]
}
```

### logs.json Format

Activity log per project directory:

```json
[
  {
    "sessionId": "051993c3-edbb-49f1-803f-ca4e10c62096",
    "messageId": 1,
    "type": "user",
    "message": "Hello",
    "timestamp": "2025-11-08T23:19:21.596Z"
  }
]
```

### Extraction Summary

| Data Point | Path | Notes |
|------------|------|-------|
| Session ID | `sessionId` | UUID, also encoded in filename (last 8 chars) |
| Start time | `startTime` | ISO 8601 |
| Last updated | `lastUpdated` | ISO 8601 |
| Per-message timestamp | `messages[].timestamp` | ISO 8601 |
| Model | `messages[].model` | Only on `"gemini"` type messages |
| Input tokens | `messages[].tokens.input` | Per message |
| Output tokens | `messages[].tokens.output` | Per message |
| Cached tokens | `messages[].tokens.cached` | Per message |
| Thought tokens | `messages[].tokens.thoughts` | Per message |
| Tool tokens | `messages[].tokens.tool` | Per message |
| Total tokens | `messages[].tokens.total` | Sum of all token types |
| Cost | Not stored | Compute from tokens × pricing |
| CWD | `.project_root` file content | Or reverse SHA-256 via project name dir |
| Git branch | Not stored | Not captured in Gemini session files |
| Tool calls | `messages[].toolCalls[]` | name, args, result |
| Extended thinking | `messages[].thoughts[]` | subject, description, timestamp |

---

## 4. OpenCode

### Discovery

| Property | Value |
|----------|-------|
| Root (v2) | `~/.local/share/opencode/storage/` |
| Root (legacy) | `~/.local/share/opencode/project/<encoded-path>/storage/` |
| Session glob | `~/.local/share/opencode/storage/session/*/*.json` |
| Message glob | `~/.local/share/opencode/storage/message/ses_*/*.json` |
| Parts glob | `~/.local/share/opencode/storage/part/msg_*/*.json` |
| Format | JSON (separate files per entity, NOT JSONL) |
| Storage version | v2 (centralized) + legacy v1 (project-based) coexist |

### Directory Structure (v2 — Current)

```
~/.local/share/opencode/
├── auth.json                              # OAuth credentials (sensitive)
├── storage/
│   ├── migration                          # Marker file (contains "2")
│   ├── project/
│   │   └── <sha1-hash>.json              # Project metadata
│   ├── session/
│   │   └── <project-hash>/
│   │       └── ses_<id>.json             # Session metadata
│   ├── message/
│   │   └── ses_<id>/
│   │       └── msg_<id>.json             # Message metadata
│   └── part/
│       └── msg_<id>/
│           └── prt_<id>.json             # Actual content (text, code)
├── project/                               # Legacy v1 format
│   └── -Users-ivan-git-<repo>/
│       ├── app.json
│       └── storage/session/info/ses_*.json
├── log/
└── bin/
```

### Session File

```json
{
  "id": "ses_4515882a1ffePuxMADk2kME9KG",
  "version": "1.1.13",
  "projectID": "cdb6b8e24594066dccdfc03a6dc37c8463c8fcd4",
  "directory": "/Users/ivan/git/mcpping_v2",
  "title": "Pricing and cost inquiry",
  "time": {
    "created": 1768161770846,
    "updated": 1768161772227
  }
}
```

### Message File (User)

```json
{
  "id": "msg_baea77d62001fJ7QcPGjihcQPq",
  "sessionID": "ses_4515882a1ffePuxMADk2kME9KG",
  "role": "user",
  "time": { "created": 1768161770858 },
  "agent": "build",
  "model": {
    "providerID": "opencode",
    "modelID": "glm-4.7-free"
  }
}
```

### Message File (Assistant)

```json
{
  "id": "msg_baea77d7d001E4Oua3GM4gszJE",
  "sessionID": "ses_4515882a1ffePuxMADk2kME9KG",
  "role": "assistant",
  "time": { "created": 1768161770877 },
  "parentID": "msg_baea77d62001fJ7QcPGjihcQPq",
  "modelID": "glm-4.7-free",
  "providerID": "opencode",
  "mode": "build",
  "agent": "build",
  "path": {
    "cwd": "/Users/ivan/git/mcpping_v2",
    "root": "/Users/ivan/git/mcpping_v2"
  },
  "cost": 0,
  "tokens": {
    "input": 0,
    "output": 0,
    "reasoning": 0,
    "cache": {
      "read": 0,
      "write": 0
    }
  }
}
```

### Part File (Content)

```json
{
  "id": "prt_baea77d62002h6H8YMHArjSqT6",
  "sessionID": "ses_4515882a1ffePuxMADk2kME9KG",
  "messageID": "msg_baea77d62001fJ7QcPGjihcQPq",
  "type": "text",
  "text": "is it free"
}
```

### Project File

```json
{
  "id": "cdb6b8e24594066dccdfc03a6dc37c8463c8fcd4",
  "worktree": "/Users/ivan/git/mcpping_v2",
  "vcs": "git",
  "time": { "created": 1768161577558, "updated": 1768161750366 },
  "sandboxes": []
}
```

### ID Patterns

| Entity | Prefix | Example |
|--------|--------|---------|
| Session | `ses_` | `ses_4515882a1ffePuxMADk2kME9KG` |
| Message | `msg_` | `msg_baea77d62001fJ7QcPGjihcQPq` |
| Part | `prt_` | `prt_baea77d62002h6H8YMHArjSqT6` |
| Project | SHA-1 hash | `cdb6b8e24594066dccdfc03a6dc37c8463c8fcd4` |

### Extraction Summary

| Data Point | Path | Notes |
|------------|------|-------|
| Session ID | `session.id` | `ses_` prefix |
| Timestamps | `session.time.created`, `.updated` | **Unix milliseconds** (13 digits) |
| Per-message time | `message.time.created` | Unix milliseconds |
| Model | `message.modelID` (assistant) or `message.model.modelID` (user) | e.g. `"claude-sonnet-4-20250514"` |
| Provider | `message.providerID` or `message.model.providerID` | `"anthropic"`, `"opencode"` |
| Input tokens | `message.tokens.input` | Assistant messages only |
| Output tokens | `message.tokens.output` | Assistant messages only |
| Reasoning tokens | `message.tokens.reasoning` | Assistant messages only |
| Cache read | `message.tokens.cache.read` | Assistant messages only |
| Cache write | `message.tokens.cache.write` | Assistant messages only |
| Cost | `message.cost` | USD float, on assistant messages |
| CWD | `message.path.cwd` or `session.directory` | Absolute path |
| Git branch | Not stored in session/message files | Must infer from project `vcs` field |
| OpenCode version | `session.version` | e.g. `"1.1.13"` |
| Content text | `part.text` | Separate part files |

---

## 5. Factory Droid

### Discovery

| Property | Value |
|----------|-------|
| Root | `~/.factory/sessions/` |
| JSONL glob | `~/.factory/sessions/*.jsonl` |
| Settings glob | `~/.factory/sessions/*.settings.json` |
| File pattern | `<UUID>.jsonl` + `<UUID>.settings.json` |
| Format | JSONL (events) + JSON (settings) |
| Files on this machine | **13** JSONL sessions |
| Total events | 475 lines across all files |
| File sizes | 1.8 KB – 601 KB |

### Directory Structure

```
~/.factory/
├── auth.json                   # JWT auth tokens
├── settings.json               # Global CLI settings
├── history.json                # Command history
├── mcp.json                    # MCP server configurations
├── bin/rg                      # Bundled ripgrep
├── logs/
│   ├── console.log
│   └── droid-log-single.log
└── sessions/
    ├── <uuid>.jsonl            # Session event log
    └── <uuid>.settings.json    # Session token/provider metadata
```

### Event Types

| Type | Description |
|------|-------------|
| `session_start` | First event — session ID, title, owner |
| `message` | User/assistant messages with content blocks |
| `todo_state` | Todo list state snapshots |

### session_start Event (always line 1)

```json
{
  "type": "session_start",
  "id": "bd11a7ff-4811-473f-8e6d-c4aec2e4454f",
  "title": "review changes and make git commit",
  "owner": "ivan"
}
```

### message Event

Messages use a content-block array pattern similar to the Anthropic API:

```json
{
  "type": "message",
  "id": "65fb6d53-f783-4071-ba0f-7bb7e64a0edc",
  "timestamp": "2025-10-17T20:20:31.116Z",
  "message": {
    "role": "user",
    "id": "65fb6d53-...",
    "content": [
      { "type": "text", "text": "review the changes" }
    ]
  },
  "parentId": "previous_message_uuid"
}
```

**Content block variants:**
```json
// Text
{ "type": "text", "text": "..." }

// Tool use
{ "type": "tool_use", "id": "call_vHRF...", "name": "Bash", "input": { "command": "git status" } }

// Tool result
{ "type": "tool_result", "tool_use_id": "call_vHRF...", "content": "output..." }
```

**Encrypted reasoning (OpenAI models):**
```json
{
  "type": "message",
  "message": {
    "role": "assistant",
    "openaiEncryptedContent": "base64...",
    "openaiReasoningId": "rs_..."
  }
}
```

### todo_state Event

```json
{
  "type": "todo_state",
  "id": "2bc8bfb8-...",
  "timestamp": "2025-10-17T20:20:38.256Z",
  "todos": {
    "todos": [
      {
        "id": "review_changes",
        "content": "Review outstanding changes in repo",
        "status": "in_progress",
        "priority": "high"
      }
    ]
  },
  "messageIndex": 2
}
```

### Settings File (`<uuid>.settings.json`)

```json
{
  "assistantActiveTimeMs": 1725575,
  "providerLock": "openai",
  "providerLockTimestamp": "2025-10-17T20:20:30.671Z",
  "apiProviderLock": "openai",
  "tokenUsage": {
    "inputTokens": 286905,
    "outputTokens": 32652,
    "cacheCreationTokens": 0,
    "cacheReadTokens": 10505600,
    "thinkingTokens": 10176
  }
}
```

### Global Settings (`~/.factory/settings.json`)

```json
{
  "model": "gpt-5-codex",
  "reasoningEffort": "none",
  "cloudSessionSync": true,
  "diffMode": "github",
  "autonomyLevel": "spec",
  "enableDroidShield": true,
  "commandAllowlist": ["ls", "pwd", "dir"],
  "commandDenylist": ["rm -rf /", "shutdown"]
}
```

### Command History (`~/.factory/history.json`)

```json
[
  {
    "command": "review changes and make git commit",
    "timestamp": "2025-10-17T20:20:30.667Z",
    "type": "message",
    "mode": "chat"
  }
]
```

### Extraction Summary

| Data Point | Path | Notes |
|------------|------|-------|
| Session ID | `session_start.id` or JSONL filename | UUID |
| Session title | `session_start.title` | String |
| Owner | `session_start.owner` | Username |
| Timestamps | `message.timestamp` | ISO 8601 |
| Model provider | `.settings.json` → `providerLock` | `"openai"`, `"anthropic"` |
| Global model | `~/.factory/settings.json` → `model` | e.g. `"gpt-5-codex"` |
| Input tokens | `.settings.json` → `tokenUsage.inputTokens` | Session total |
| Output tokens | `.settings.json` → `tokenUsage.outputTokens` | Session total |
| Cache read | `.settings.json` → `tokenUsage.cacheReadTokens` | Session total |
| Cache write | `.settings.json` → `tokenUsage.cacheCreationTokens` | Session total |
| Thinking tokens | `.settings.json` → `tokenUsage.thinkingTokens` | Session total |
| Active time | `.settings.json` → `assistantActiveTimeMs` | Milliseconds |
| Cost | Not stored | Compute from tokens × pricing |
| CWD | Extracted from first message system content | `% pwd` output in content |
| Git branch | Extracted from first message system content | `% git rev-parse --abbrev-ref HEAD` |

---

## 6. GitHub Copilot CLI (NOT INSTALLED)

Not present on this machine. Reference data from AGENT_SESSIONS_REFERENCE.md:

| Property | Value |
|----------|-------|
| Root | `~/.copilot/session-state/` |
| Glob | `~/.copilot/session-state/*.jsonl` |
| Format | JSONL |
| Version field | `data.copilotVersion` |
| Max verified | 0.0.400 |

---

## 7. Normalized Event Schema (Agent Sessions App)

The [Agent Sessions](https://github.com/jazzyalex/agent-sessions) macOS app normalizes all agents into this unified schema:

### SessionEvent

```json
{
  "id": "string (required)",
  "kind": "user | assistant | tool_call | tool_result | error | meta (required)",
  "rawJSON": "string (required)",
  "timestamp": "ISO-8601 string | epoch number",
  "role": "string",
  "text": "string",
  "toolName": "string",
  "toolInput": "string",
  "toolOutput": "string",
  "messageID": "string",
  "parentID": "string",
  "isDelta": "boolean",
  "model": "string",
  "encrypted_content": "string (base64, opaque)"
}
```

### Kind Mapping

The `kind` field is resolved from raw `type` and `role` fields:

| Raw `type` values | → Normalized `kind` |
|-------------------|---------------------|
| `user` | `user` |
| `assistant` | `assistant` |
| `tool_call`, `tool-call`, `tool_use`, `function_call`, `web_search_call`, `custom_tool_call` | `tool_call` |
| `tool_result`, `tool-result`, `function_result`, `function_call_output`, `web_search_call_output` | `tool_result` |
| `error`, `err` | `error` |
| `system`, `summary`, `file-history-snapshot`, `queue-operation`, `assistant.turn_start`, `assistant.turn_end`, `session.truncation`, `environment_context`, `thread_rolled_back` | `meta` |

**Fallback** (if `type` not recognized): check `role`:
- `user` → `user`, `assistant` → `assistant`, `tool` → `tool_result`, `system` → `meta`
- Default: `meta`

### Session

```json
{
  "id": "string",
  "source": "codex | claude | gemini | opencode | copilot | droid | openclaw",
  "startTime": "Date",
  "endTime": "Date",
  "model": "string | null",
  "filePath": "string",
  "fileSizeBytes": "number",
  "eventCount": "number",
  "events": "SessionEvent[]",
  "isHousekeeping": "boolean"
}
```

**Computed properties:** `title` (from first user message), `cwd`, `repoName`, `gitBranch`, `messageCount`, `modifiedAt`.

---

## 8. Cross-Agent Extraction Cheatsheet

### Session ID

| Agent | How to Get |
|-------|-----------|
| Claude Code | `event.sessionId` (any event) |
| Codex CLI | `payload.id` (from `session_meta` event) or filename ULID |
| Gemini CLI | `sessionId` (top-level JSON field) |
| OpenCode | `session.id` (`ses_` prefix) |
| Factory Droid | `session_start.id` or JSONL filename stem |

### Timestamps

| Agent | Format | Field |
|-------|--------|-------|
| Claude Code | ISO 8601 + Z | `event.timestamp` |
| Codex CLI | ISO 8601 + Z | `timestamp` (top-level) |
| Gemini CLI | ISO 8601 + Z | `startTime`, `lastUpdated`, `messages[].timestamp` |
| OpenCode | **Unix ms** (13 digits) | `time.created`, `time.updated` |
| Factory Droid | ISO 8601 + Z | `message.timestamp` |

### Token Counts

| Agent | Location | Fields |
|-------|----------|--------|
| Claude Code | `event.message.usage` (assistant events) | `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` |
| Codex CLI | `event_msg` type `token_count` → `payload.info` | May be null; rate limits available |
| Gemini CLI | `messages[].tokens` (gemini events) | `input`, `output`, `cached`, `thoughts`, `tool`, `total` |
| OpenCode | `message.tokens` (assistant messages) | `input`, `output`, `reasoning`, `cache.read`, `cache.write` |
| Factory Droid | `.settings.json` → `tokenUsage` | `inputTokens`, `outputTokens`, `cacheCreationTokens`, `cacheReadTokens`, `thinkingTokens` |

### Model

| Agent | How to Get |
|-------|-----------|
| Claude Code | `event.message.model` (assistant events only) |
| Codex CLI | `payload.model` (from `turn_context`) or `payload.model_provider` (from `session_meta`) |
| Gemini CLI | `messages[].model` (gemini messages only) |
| OpenCode | `message.modelID` (assistant) or `message.model.modelID` (user) |
| Factory Droid | `.settings.json` → `providerLock` or `~/.factory/settings.json` → `model` |

### Cost

| Agent | Stored? | How |
|-------|---------|-----|
| Claude Code | No | Compute: tokens × Anthropic pricing |
| Codex CLI | No | Compute: tokens × OpenAI pricing |
| Gemini CLI | No | Compute: tokens × Google pricing |
| OpenCode | **Yes** | `message.cost` (USD float, assistant messages) |
| Factory Droid | No | Compute: tokens × provider pricing |

### Working Directory (CWD)

| Agent | How to Get |
|-------|-----------|
| Claude Code | `event.cwd` (top-level on most events) |
| Codex CLI | `payload.cwd` (from `session_meta` or `turn_context`) |
| Gemini CLI | `.project_root` file content; or named project dir |
| OpenCode | `session.directory` or `message.path.cwd` |
| Factory Droid | Parse `% pwd` from first message content |

### Git Branch

| Agent | How to Get |
|-------|-----------|
| Claude Code | `event.gitBranch` (top-level, may be `""` or `"HEAD"`) |
| Codex CLI | `payload.git.branch` (from `session_meta`) |
| Gemini CLI | Not stored |
| OpenCode | Not stored in session files |
| Factory Droid | Parse `% git rev-parse --abbrev-ref HEAD` from first message |

---

## 9. Electrobun Desktop Framework Reference

> Source: `~/.agents/skills/electrobun-desktop-apps/`

Electrobun is a TypeScript-first desktop app framework — a lightweight alternative to Electron. Relevant for building a cross-platform session viewer app.

### Key Facts

| Property | Value |
|----------|-------|
| Runtime | Bun (via Zig launcher → Bun FFI) |
| Webview | Native system webviews (WebKit/WebView2/WebKitGTK) |
| Bundle size | ~14 MB (vs Electron's ~150 MB+) |
| Optional CEF | ~100 MB bundle when `bundleCEF: true` |
| Platforms | macOS, Windows, Linux |
| Update system | BSDIFF patches (~14 KB incremental) |

### Project Structure

```
my-app/
  src/
    bun/index.ts               # Main process entry
    shared/types.ts            # Typed RPC schemas
    mainview/
      index.html
      index.css
      index.ts                 # Frontend logic
  electrobun.config.ts
  package.json
  tsconfig.json
```

### Core APIs

**Main process imports:**
```typescript
import { BrowserWindow, BrowserView, ApplicationMenu, ContextMenu, Tray, Updater, Utils, PATHS } from "electrobun/bun";
import Electrobun from "electrobun/bun";
```

**Browser context imports:**
```typescript
import { Electroview } from "electrobun/view";
```

### BrowserWindow

```typescript
const win = new BrowserWindow({
  title: "AI Stats",
  url: "views://mainview/index.html",
  frame: { width: 800, height: 600, x: 200, y: 200 },
  titleBarStyle: "hiddenInset",  // "default" | "hidden" | "hiddenInset"
  rpc: {
    type: {} as MyRPCType,
    handlers: { requests: { ... }, messages: { ... } },
  },
});
win.on("close", () => Utils.quit());
```

### Typed RPC (3-Step IPC)

**Step 1 — Shared types (`src/shared/types.ts`):**
```typescript
import type { RPCSchema } from "electrobun/bun";

export type MyRPCType = {
  bun: RPCSchema<{
    requests: {
      loadSessions: { params: { agent: string }; response: Session[] };
    };
    messages: {
      log: { msg: string };
    };
  }>;
  webview: RPCSchema<{
    requests: {
      updateUI: { params: { data: any }; response: boolean };
    };
    messages: {
      showNotification: { text: string };
    };
  }>;
};
```

**Step 2 — Browser side (`src/mainview/index.ts`):**
```typescript
const rpc = Electroview.defineRPC<MyRPCType>({
  handlers: {
    requests: { updateUI: ({ data }) => { /* DOM update */ return true; } },
    messages: { showNotification: ({ text }) => alert(text) },
  },
});
const electroview = new Electroview({ rpc });

// Call bun-side
const sessions = await electroview.rpc.request.loadSessions({ agent: "claude" });
```

**Step 3 — Bun side (`src/bun/index.ts`):**
```typescript
const win = new BrowserWindow({
  url: "views://mainview/index.html",
  rpc: {
    type: {} as MyRPCType,
    handlers: {
      requests: { loadSessions: ({ agent }) => discoverSessions(agent) },
      messages: { log: ({ msg }) => console.log(msg) },
    },
  },
});
```

### Application Menu

```typescript
ApplicationMenu.setApplicationMenu([
  { submenu: [{ label: "Quit", role: "quit" }] },
  {
    label: "File",
    submenu: [
      { label: "Open Session", action: "open-session", accelerator: "CmdOrCtrl+O" },
      { type: "separator" },
      { role: "close" },
    ],
  },
]);

Electrobun.events.on("application-menu-clicked", (e) => {
  if (e.data.action === "open-session") { /* ... */ }
});
```

### System Tray

```typescript
const tray = new Tray({
  title: "AI Stats",
  image: "views://assets/icon-32-template.png",
  template: true,
  width: 32, height: 32,
});
tray.setMenu([
  { type: "normal", label: "Show Dashboard", action: "show" },
  { type: "divider" },
  { type: "normal", label: "Quit", action: "quit" },
]);
```

### Updater

```typescript
const update = await Updater.checkForUpdate();
if (update.updateAvailable) {
  await Updater.downloadUpdate();   // BSDIFF patches
  await Updater.installUpdate();    // Restarts app
}
```

### Paths

```typescript
PATHS.RESOURCES_FOLDER  // Read-only bundled resources (code-signed)
PATHS.VIEWS_FOLDER      // RESOURCES_FOLDER + '/app/views/'
```

### Configuration (`electrobun.config.ts`)

```typescript
export default {
  app: {
    name: "AIStats",
    identifier: "com.example.aistats",
    version: "1.0.0",
  },
  runtime: { exitOnLastWindowClosed: true },
  build: {
    bun: { entrypoint: "src/bun/index.ts" },
    views: { mainview: { entrypoint: "src/mainview/index.ts" } },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
      "src/mainview/index.css": "views/mainview/index.css",
    },
    mac: { bundleCEF: false },
    linux: { bundleCEF: true },
  },
  release: { baseUrl: "https://storage.example.com/aistats/" },
} satisfies ElectrobunConfig;
```

### Critical Gotchas

- **Remove `"type": "module"` from `package.json`** — breaks Electrobun
- **Never write to `PATHS.RESOURCES_FOLDER`** — code-signed, read-only
- **Linux: use `bundleCEF: true`** — WebKitGTK has severe limitations
- **Builds are host-platform only** — use CI for cross-platform
- **Custom titlebar**: use CSS classes `electrobun-webkit-app-region-drag` / `no-drag`
- **`views://` URL scheme** maps to `views/` folder in app bundle

### React + Vite Integration

For HMR development with Vite:
```typescript
// Detect if Vite dev server is running
async function getUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();
  if (channel === "dev") {
    try { await fetch("http://localhost:5173", { method: "HEAD" }); return "http://localhost:5173"; }
    catch { /* fallback */ }
  }
  return "views://mainview/index.html";
}
```

Scripts:
```json
{
  "dev": "bun run build:dev && electrobun dev",
  "dev:hmr": "concurrently \"vite --port 5173\" \"bun run dev\"",
  "build:prod": "vite build && electrobun build --env=stable"
}
```
