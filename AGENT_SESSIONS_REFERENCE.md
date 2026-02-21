# Agent Sessions -- Comprehensive Reference

> Repository: https://github.com/jazzyalex/agent-sessions
> Version at time of research: 2.11.2 (latest release), 2.6 (latest CHANGELOG entry)
> License: MIT
> Language: Swift (83.9%), native macOS app
> Stars: 260+

---

## What It Is

Agent Sessions is a **native macOS application** (not a library/SDK) that provides a unified session browser and analytics tool for multiple AI coding assistants. It reads the local session log files that various AI CLI tools write to disk, parses them into a normalized data model, and presents them in a searchable, browsable UI.

**Important clarification**: This is NOT a JavaScript/TypeScript/Python library you import into a project. It is a standalone macOS app built with Swift and SwiftUI. However, understanding its data models, parsing logic, and session file formats is valuable for:
1. Building complementary tooling that reads the same session files
2. Writing session data in formats Agent Sessions can consume
3. Building similar functionality in other languages/platforms
4. Extending or contributing to the project

## What Problem It Solves

AI coding assistants (Claude Code, Codex CLI, Gemini CLI, GitHub Copilot CLI, Factory Droid, OpenCode, OpenClaw) each store session logs in different locations with different formats. Agent Sessions:

- **Unifies browsing** across all 7 supported agents into a single interface
- **Enables search** across all past sessions with full-text search and filters
- **Supports resumption** of sessions in Terminal.app or iTerm2
- **Provides analytics** with usage tracking, session metrics, and rate limit monitoring
- **Preserves privacy** -- fully local, no telemetry, read-only access to session files

---

## Installation & Setup

### System Requirements
- macOS 14 (Sonoma) or later
- No additional runtime dependencies

### Option A: Download DMG
```bash
# Download from GitHub releases
open https://github.com/jazzyalex/agent-sessions/releases/download/v2.11.2/AgentSessions-2.11.2.dmg
# Drag Agent Sessions.app into /Applications
```

### Option B: Homebrew
```bash
brew tap jazzyalex/agent-sessions
brew install --cask agent-sessions
```

### Automatic Updates
Agent Sessions uses Sparkle for auto-updates (signed + notarized). To force an update check:
```bash
defaults delete com.triada.AgentSessions SULastCheckTime
open "/Applications/Agent Sessions.app"
```

### Building from Source
```bash
git clone https://github.com/jazzyalex/agent-sessions.git
cd agent-sessions

# Build
xcodebuild -project AgentSessions.xcodeproj -scheme AgentSessions -configuration Debug -destination 'platform=macOS' build

# Run tests
xcodebuild -project AgentSessions.xcodeproj -scheme AgentSessionsTests -destination 'platform=macOS' test
```

---

## Supported Agents & Session Locations

| Agent | Session Root | File Pattern | Format |
|-------|-------------|--------------|--------|
| Codex CLI | `~/.codex/sessions` (or `$CODEX_HOME/sessions`) | `YYYY/MM/DD/rollout-*.jsonl` | JSONL |
| Claude Code | `~/.claude/projects/<encoded-path>/*.jsonl` | `UUID.jsonl` | JSONL |
| Gemini CLI | `~/.gemini/tmp` | varies | JSON |
| GitHub Copilot CLI | `~/.copilot/session-state/*.jsonl` | `<sessionId>.jsonl` | JSONL |
| Factory Droid | `~/.factory/sessions` and `~/.factory/projects` | varies | JSONL |
| OpenCode | `~/.local/share/opencode/storage/session` | varies | JSON |
| OpenClaw | (see discovery logic) | varies | varies |

### Verified Agent Versions (from agent-support-matrix.yml)
| Agent | Max Verified Version | Version Field |
|-------|---------------------|---------------|
| Codex CLI | 0.89.0 | `payload.cli_version` |
| Claude Code | 2.1.19 | `version` |
| Gemini CLI | 0.24.0 | not logged |
| Copilot CLI | 0.0.400 | `data.copilotVersion` |
| OpenCode | 1.1.23 | `session.version` |
| Droid | 0.43.0 | not logged |

---

## Core Data Models

### SessionSource (enum)
Identifies which AI agent produced a session.

```swift
public enum SessionSource: String, Codable, CaseIterable, Sendable {
    case codex = "codex"       // "Codex CLI"
    case claude = "claude"     // "Claude Code"
    case gemini = "gemini"     // "Gemini"
    case opencode = "opencode" // "OpenCode"
    case copilot = "copilot"   // "Copilot CLI"
    case droid = "droid"       // "Droid"
    case openclaw = "openclaw" // "OpenClaw"
}
```

### SessionEventKind (enum)
Normalized event types across all agents.

```swift
public enum SessionEventKind: String, Codable, CaseIterable, Sendable {
    case user
    case assistant
    case tool_call
    case tool_result
    case error
    case meta
}
```

The mapping from raw event types to these normalized kinds handles many aliases:
- `tool_call` also matches: `tool-call`, `toolcall`, `tool_use`, `tool-use`, `function_call`, `web_search_call`, `custom_tool_call`
- `tool_result` also matches: `tool-result`, `toolresult`, `function_result`, `function_call_output`, `web_search_call_output`, `custom_tool_call_output`
- `error` also matches: `err`
- `meta` also matches: `system`, `summary`, `file-history-snapshot`, `queue-operation`, `assistant.turn_start`, `assistant.turn_end`, `session.truncation`, `tool.execution_start`, `environment_context`, `environment-context`, `env_context`, `thread_rolled_back`

Fallback: if `type` field is not recognized, the `role` field is checked:
- `user` -> `.user`
- `assistant` -> `.assistant`
- `tool` -> `.tool_result`
- `system` -> `.meta`
- Default: `.meta`

### SessionEvent (struct)
A single normalized event within a session.

```swift
public struct SessionEvent: Identifiable, Codable, Equatable, Sendable {
    public let id: String
    public let timestamp: Date?
    public let kind: SessionEventKind
    public let role: String?
    public let text: String?
    public let toolName: String?
    public let toolInput: String?
    public let toolOutput: String?
    public let messageID: String?    // For delta/stream grouping
    public let parentID: String?     // For threaded conversations
    public let isDelta: Bool         // True if this is a streaming chunk
    public let rawJSON: String       // Original JSON line preserved
}
```

### SessionEvent JSON Schema (Normalized Output)
Located at `docs/schemas/session_event.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "SessionEvent (Agent Sessions normalized)",
  "type": "object",
  "additionalProperties": true,
  "required": ["id", "kind", "rawJSON"],
  "properties": {
    "id": { "type": "string" },
    "kind": {
      "type": "string",
      "enum": ["user", "assistant", "tool_call", "tool_result", "error", "meta"]
    },
    "rawJSON": { "type": "string" },
    "timestamp": {
      "oneOf": [
        { "type": "string", "format": "date-time" },
        { "type": "number" }
      ]
    },
    "role": { "type": "string" },
    "text": { "type": "string" },
    "toolName": { "type": "string" },
    "toolInput": { "type": "string" },
    "toolOutput": { "type": "string" },
    "messageID": { "type": "string" },
    "parentID": { "type": "string" },
    "isDelta": { "type": "boolean" },
    "model": { "type": "string" },
    "encrypted_content": {
      "type": "string",
      "description": "Opaque base64 blob; do not index."
    }
  }
}
```

### Session (struct)
The top-level session object aggregating events and metadata.

```swift
public struct Session: Identifiable, Equatable, Codable, Sendable {
    public let id: String              // Session identifier
    public let source: SessionSource   // Which agent (codex, claude, etc.)
    public let startTime: Date?        // Earliest event timestamp
    public let endTime: Date?          // Latest event timestamp
    public let model: String?          // AI model used (if available)
    public let filePath: String        // Absolute path to session file
    public let fileSizeBytes: Int?     // File size on disk
    public let eventCount: Int         // Total event count (estimate for lightweight)
    public let events: [SessionEvent]  // Empty for lightweight sessions
    public var isHousekeeping: Bool    // True if no meaningful user/assistant content
    public let lightweightCommands: Int?
    public let lightweightCwd: String?
    public let lightweightTitle: String?
    public var isFavorite: Bool        // Runtime UI state (not persisted)
}
```

Key computed properties:
- `shortID` -- first 6 chars of session ID
- `title` -- human-friendly title derived from first user message (with preamble filtering)
- `cwd` -- working directory (extracted from events or metadata)
- `repoName` -- git repository name (detected from cwd)
- `gitBranch` -- git branch (extracted from event metadata or tool outputs)
- `messageCount` -- effective message count (events or estimate)
- `modifiedAt` -- best timestamp for sorting (filename timestamp > endTime > startTime)
- `codexPreviewTitle` -- title matching Codex CLI's `--resume` picker logic
- `isWorktree` / `isSubmodule` -- git worktree/submodule detection

### Session States
Sessions exist in two states:
1. **Lightweight** (`events.isEmpty == true`): Metadata only, fast to load. Message count displayed as file size.
2. **Fully Parsed** (`events.isEmpty == false`): Complete event array, slower to load. Actual message count displayed.

### Filters (struct)
Query parameters for session search/filtering.

```swift
struct Filters: Equatable {
    var query: String = ""                            // Free text search
    var dateFrom: Date?                               // Start date filter
    var dateTo: Date?                                 // End date filter
    var model: String?                                // Model filter
    var kinds: Set<SessionEventKind> = Set(SessionEventKind.allCases) // Event kind filter
    var repoName: String? = nil                       // Repository filter
    var pathContains: String? = nil                    // Path substring filter
}
```

Search query supports operators: `repo:<name>` and `path:<substring>` inline.

---

## Session File Formats (Per Agent)

### Codex CLI JSONL Format

**Location**: `~/.codex/sessions/YYYY/MM/DD/rollout-YYYY-MM-DDThh-mm-ss-UUID.jsonl`

Each line is a JSON object. Key fields:
```json
// User message
{ "type": "user", "timestamp": "2025-09-12T16:41:03Z", "content": "Find all TODOs in the repo" }

// Assistant with image
{
  "type": "assistant",
  "message_id": "msg_123",
  "content": [
    { "type": "text", "text": "Here is the diagram:" },
    { "type": "input_image", "image_url": { "url": "data:image/png;base64,..." } }
  ]
}

// Tool call + result
{ "type": "tool_call", "function": { "name": "grep" }, "arguments": { "pattern": "TODO", "path": "." } }
{ "type": "tool_result", "stdout": "README.md:12: TODO: add tests\n" }

// Streamed chunks
{ "type": "assistant", "message_id": "msg_456", "delta": true, "content": [{"type":"text","text":"First part"}] }
{ "type": "assistant", "message_id": "msg_456", "delta": true, "content": [{"type":"text","text":" and more"}] }

// Encrypted reasoning
{ "type": "meta", "reasoning": { "encrypted_content": "AAECAwQ..." } }
```

**Field notes**:
- Timestamp keys: any of `timestamp`, `time`, `ts`, `created`, `created_at`, `datetime`, `date`, `event_time`, `when`, `at`
- Content text keys: `content`, `text`, or `message` (string or array of parts)
- Tool name: `tool`, `name`, or `function.name`
- Tool arguments: `arguments` or `input`
- Tool outputs: `stdout`, `stderr`, `result`, `output`
- Session ID from `session_id` field or `payload.session_id` or `payload.id` (for session_meta type)
- Model: `model` field (per-event)
- Git branch: `git_branch`, `repo.branch`, or `branch`

### Claude Code JSONL Format

**Location**: `~/.claude/projects/-Users-<user>-<path>/<UUID>.jsonl`

```json
// Summary event
{ "type": "summary", "summary": "Customizing Terminal Prompt", "leafUuid": "..." }

// User message (NOTE: content is nested in message.content)
{
  "type": "user",
  "message": { "role": "user", "content": "switch to branch Claude-support..." },
  "timestamp": "2025-10-02T20:15:32.885Z",
  "cwd": "/Users/alexm/Repository/Codex-History",
  "sessionId": "06cc67e8-...",
  "version": "2.0.5",
  "gitBranch": "main",
  "uuid": "21cc4e82-...",
  "parentUuid": null,
  "isSidechain": false,
  "userType": "external",
  "isMeta": true
}

// System event
{
  "type": "system",
  "subtype": "local_command",
  "content": "<command-name>/model</command-name>...",
  "level": "info",
  "timestamp": "...",
  "uuid": "...",
  "isMeta": false
}

// File history snapshot
{
  "type": "file-history-snapshot",
  "messageId": "...",
  "snapshot": { "messageId": "...", "trackedFileBackups": {}, "timestamp": "..." },
  "isSnapshotUpdate": false
}
```

**Critical differences from Codex**:
| Aspect | Codex | Claude Code |
|--------|-------|-------------|
| User content | Top-level `text`/`content` | Nested `message.content` |
| Event threading | Flat list | Tree via `uuid`/`parentUuid` |
| Model info | Per-event `model` field | Not stored (use `version`) |
| File org | Date-based (`YYYY/MM/DD/`) | Project-based (`projects/<path>/`) |
| Session ID | From filename | From `sessionId` field |
| Git branch | `git_branch` or heuristics | `gitBranch` field (top-level) |
| Meta events | Various type markers | Explicit `isMeta` boolean |

### Copilot CLI JSONL Format

**Location**: `~/.copilot/session-state/<sessionId>.jsonl`
- Version field: `data.copilotVersion`
- Flat directory (no date sharding)

### Gemini CLI Format

**Location**: `~/.gemini/tmp/`
- JSON (not JSONL)
- Uses hash-based file resolution
- Version not logged in events

### OpenCode Format

**Location**: `~/.local/share/opencode/storage/session/`
- Uses storage_v2 format: separate files for sessions, messages, and parts
- Session version from `session.version`

### Droid (Factory CLI) Format

**Location**: `~/.factory/sessions` and `~/.factory/projects`
- Two sub-formats: `session_store` (JSONL) and `stream_json` (JSONL)
- Version not logged

---

## Architecture Overview

### Source Code Structure
```
AgentSessions/
  AgentSessionsApp.swift          # App entry point
  Model/
    Session.swift                  # Session struct + computed properties
    SessionEvent.swift             # SessionEvent struct + kind mapping
    SessionSource.swift            # Agent source enum
  Services/
    SessionDiscovery.swift         # File discovery (Codex, Claude, Copilot)
    ClaudeSessionParser.swift      # Claude JSONL parser
    ClaudeSessionIndexer.swift     # Claude session indexer
    CopilotSessionParser.swift     # Copilot JSONL parser
    CopilotSessionIndexer.swift    # Copilot session indexer
    DroidSessionParser.swift       # Droid parser
    GeminiSessionParser.swift      # Gemini parser
    OpenCodeSessionParser.swift    # OpenCode parser
    OpenClawSessionParser.swift    # OpenClaw parser
    FilterEngine.swift             # Search/filter logic
    SessionIndexer.swift           # Codex session indexer
    UnifiedSessionIndexer.swift    # Aggregates all agent indexers
    SessionTranscriptBuilder.swift # Builds readable transcripts
    TranscriptCache.swift          # Caches rendered transcripts for search
    SessionArchiveManager.swift    # Session archiving
    StarredSessionsStore.swift     # Favorites/pinned sessions
    ToolTextBlockNormalizer.swift  # Normalizes tool output display
  Indexing/
    DB.swift                       # SQLite database (file scan state, metrics)
    SessionMetaRepository.swift    # Session metadata persistence
    AnalyticsIndexer.swift         # Analytics data indexing
  Search/
    SearchCoordinator.swift        # Two-phase search orchestrator
    SearchSessionStore.swift       # Search session storage
    SessionSearchTextBuilder.swift # Builds searchable text
    UnifiedSearchState.swift       # Search UI state
  Analytics/
    Models/
      AnalyticsData.swift          # Analytics data structures
      AnalyticsDateRange.swift     # Date range types
    Repositories/                  # Data access for analytics
    Services/                      # Analytics computation
    Views/                         # Analytics UI
  Resume/
    CodexResumeCoordinator.swift   # Resume orchestration
    CodexResumeCommandBuilder.swift# CLI command construction
    CodexResumeLauncher.swift      # Terminal/iTerm launcher
    CodexResumeSettings.swift      # Resume preferences
  ClaudeResume/                    # Claude Code resume support
  ClaudeStatus/                    # Claude usage tracking
  CodexStatus/                     # Codex usage tracking
  Views/                           # All SwiftUI views
  Utilities/                       # Helper utilities
```

### Key Architectural Patterns

**1. Two-Phase Session Loading**
- Stage 1 (Lightweight): Parse only metadata (id, timestamps, file size, event count estimate) for fast startup
- Stage 2 (Full Parse): Parse complete JSONL on demand (when user selects a session or search needs content)

**2. Two-Phase Search**
- Phase 1: Scan small/medium sessions (< 10MB) in batches of 64 -- fast results
- Phase 2: Scan large sessions (>= 10MB) sequentially -- complete results
- Supports session promotion (user clicks large session -> moved to front of parse queue)

**3. Unified Indexer Pattern**
- Each agent has its own `SessionDiscovery` + `SessionParser` + `SessionIndexer`
- `UnifiedSessionIndexer` aggregates all agent-specific indexers via Combine
- `FilterEngine` applies unified search/filter logic across all agents

**4. Delta-Based Discovery**
- `SessionDiscoveryDelta` tracks changed/removed files between scans
- Codex uses date-based folder scanning (recent 3-day window for incremental)
- Claude uses modification-time-based scanning (top 8 projects)

**5. SQLite Local Index**
- `IndexDB` (actor-based, thread-safe) stores:
  - File scan state (mtime, size per path)
  - Per-session daily metrics
  - Day rollups for analytics
- Location: `~/Library/Application Support/AgentSessions/index.db`

---

## Search System

### Query Syntax
- **Free text**: Matches against session title, repo name, first user prompt, and event content
- **Quoted phrases**: `"exact phrase"` for exact matching
- **Boolean operators**: `AND`, `OR`, `NOT` (case-insensitive)
- **Prefix matching**: Single tokens >= 3 chars automatically become prefix matches
- **Wildcard**: `term*` for explicit prefix matching
- **Operator filters**: `repo:myproject` and `path:/some/path` inline in query

### FilterEngine Logic
1. Date range filter (endTime or startTime)
2. Model filter
3. Repo name filter (from `repo:` operator or explicit filter)
4. Path filter (from `path:` operator or explicit filter)
5. Event kind filter (user/assistant/tool_call/tool_result/error/meta)
6. Text search (priority order):
   - Transcript cache (rendered text -- most accurate)
   - Raw event fields (text, toolInput, toolOutput -- fallback)
   - Lightweight sessions without cache cannot be searched

---

## Resume Workflows

### Codex CLI Resume
- **Primary**: `codex --config experimental_resume=/abs/path/to/rollout-*.jsonl`
- **Picker**: Lists files newest-first by filename timestamp, 25 per page, scan cap of 100
- **Preview**: First plain user message in first 10 JSONL records

### Claude Code Resume
- **Primary**: `claude --resume "<session-id>"` (or `-r`)
- **Fallback**: `claude --continue` (or `-c`) -- continues most recent session in cwd
- **Command builder**: Always `cd` first when cwd known, then the resume/continue command
- **Launcher**: AppleScript to Terminal.app or iTerm2

### Settings (stored in UserDefaults)
- `claudeResume.binaryPath` -- custom CLI path (default: `claude` on PATH)
- `claudeResume.preferITerm` -- use iTerm2 instead of Terminal (default: false)
- `claudeResume.fallbackPolicy` -- `resumeThenContinue` or `resumeOnly` (default: resumeThenContinue)
- `claudeResume.defaultWorkingDirectory` -- fallback when session lacks cwd

---

## Configuration & Preferences

### UserDefaults Keys
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `SkipAgentsPreamble` | Bool | true | Skip agents.md preamble lines in session titles |
| `claudeResume.binaryPath` | String? | nil | Custom Claude CLI path |
| `claudeResume.preferITerm` | Bool | false | Use iTerm2 for resume |
| `claudeResume.fallbackPolicy` | String | resumeThenContinue | Resume fallback strategy |
| Various probe settings | Mixed | varies | Usage probe intervals, budgets |

### App Identifier
- Bundle ID: `com.triada.AgentSessions`
- Database: `~/Library/Application Support/AgentSessions/index.db`

---

## Integration Patterns

### Reading Session Files Programmatically (Non-Swift)

If you want to build tooling that reads the same session data, here is what you need:

**1. Discover session files:**
```javascript
// Codex sessions
const codexRoot = process.env.CODEX_HOME
  ? `${process.env.CODEX_HOME}/sessions`
  : `${os.homedir()}/.codex/sessions`;
// Files: YYYY/MM/DD/rollout-*.jsonl

// Claude Code sessions
const claudeRoot = `${os.homedir()}/.claude/projects`;
// Files: <encoded-project-path>/*.jsonl
```

**2. Parse JSONL files:**
```javascript
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

async function parseSessionFile(filePath) {
  const events = [];
  const rl = createInterface({ input: createReadStream(filePath) });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const raw = JSON.parse(line);
      events.push(normalizeEvent(raw, line));
    } catch (e) {
      // Skip malformed lines
    }
  }
  return events;
}
```

**3. Normalize events to the Agent Sessions schema:**
```javascript
function normalizeEvent(raw, rawJSON) {
  const kind = resolveKind(raw.type, raw.role);
  const text = extractText(raw);

  return {
    id: raw.id || raw.message_id || raw.uuid || crypto.randomUUID(),
    kind,
    timestamp: parseTimestamp(raw),
    role: raw.role,
    text,
    toolName: raw.tool || raw.name || raw.function?.name,
    toolInput: typeof raw.arguments === 'string' ? raw.arguments : JSON.stringify(raw.arguments || raw.input),
    toolOutput: raw.stdout || raw.stderr || raw.result || raw.output,
    messageID: raw.message_id || raw.id,
    parentID: raw.parent_id || raw.parentUuid,
    isDelta: !!raw.delta,
    rawJSON,
  };
}

function resolveKind(type, role) {
  if (type) {
    const t = type.toLowerCase();
    if (['tool_call','tool-call','tool_use','function_call'].includes(t)) return 'tool_call';
    if (['tool_result','tool-result','function_result','function_call_output'].includes(t)) return 'tool_result';
    if (['error','err'].includes(t)) return 'error';
    if (['meta','system','summary','file-history-snapshot'].includes(t)) return 'meta';
    if (t === 'user') return 'user';
    if (t === 'assistant') return 'assistant';
  }
  if (role) {
    const r = role.toLowerCase();
    if (r === 'user') return 'user';
    if (r === 'assistant') return 'assistant';
    if (r === 'tool') return 'tool_result';
    if (r === 'system') return 'meta';
  }
  return 'meta';
}

function extractText(raw) {
  // Claude Code: nested in message.content
  if (raw.message?.content) {
    const c = raw.message.content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.filter(p => p.type === 'text').map(p => p.text).join('\n');
  }
  // Codex: top-level
  if (typeof raw.content === 'string') return raw.content;
  if (typeof raw.text === 'string') return raw.text;
  if (typeof raw.message === 'string') return raw.message;
  if (Array.isArray(raw.content)) {
    return raw.content
      .filter(p => typeof p === 'string' || p.type === 'text')
      .map(p => typeof p === 'string' ? p : p.text || p.value || '')
      .join('\n');
  }
  return undefined;
}
```

**4. Extract session metadata:**
```javascript
function extractSessionMeta(events, filePath, source) {
  let sessionId, cwd, gitBranch, model;
  let startTime, endTime;

  for (const e of events) {
    const raw = JSON.parse(e.rawJSON);

    // Timestamps
    if (e.timestamp) {
      if (!startTime || e.timestamp < startTime) startTime = e.timestamp;
      if (!endTime || e.timestamp > endTime) endTime = e.timestamp;
    }

    // Claude-specific fields
    if (source === 'claude') {
      if (raw.sessionId) sessionId = raw.sessionId;
      if (raw.cwd) cwd = raw.cwd;
      if (raw.gitBranch) gitBranch = raw.gitBranch;
    }

    // Codex-specific fields
    if (source === 'codex') {
      if (raw.session_id) sessionId = raw.session_id;
      if (raw.cwd) cwd = raw.cwd;
      if (raw.model) model = raw.model;
      if (raw.git_branch) gitBranch = raw.git_branch;
    }
  }

  return { sessionId, cwd, gitBranch, model, startTime, endTime };
}
```

### Writing Compatible Session Files

If you want to produce session files that Agent Sessions can read, follow these patterns:

**For Codex-compatible format:**
- Write to `~/.codex/sessions/YYYY/MM/DD/rollout-YYYY-MM-DDThh-mm-ss-UUID.jsonl`
- One JSON object per line
- Include `type` field (`user`, `assistant`, `tool_call`, `tool_result`)
- Include `timestamp` as ISO 8601
- Include `session_id` in at least one event

**For Claude-compatible format:**
- Write to `~/.claude/projects/<encoded-path>/UUID.jsonl`
- Nest user content in `message.content`
- Include `sessionId`, `uuid`, `parentUuid` fields
- Include `cwd`, `gitBranch`, `version` fields

---

## Gotchas and Limitations

### Platform
- **macOS only** -- no Linux, Windows, iOS, or web version
- Requires macOS 14+ (Sonoma or later)
- No CLI interface -- GUI only

### Data Access
- **Read-only** -- Agent Sessions never modifies session files
- **Local-only** -- no cloud sync, no remote access
- No telemetry, no analytics sent anywhere

### Session Parsing
- **Content nesting differs by agent**: Claude Code nests user text in `message.content`, Codex puts it at top level. This is the most common gotcha when building parsers.
- **Claude Code does not store model per-event** -- only `version` (e.g., "2.0.5") is available
- **Codex JSONL schema is tolerant to drift** -- fields may vary between versions; unknown fields should be preserved
- **Encrypted reasoning content** (`encrypted_content`) is opaque base64; do not index or attempt to decrypt
- **Large base64 image payloads** in events can balloon memory -- Agent Sessions caps raw JSON field at 8,192 bytes, with a 64,000 byte fallback limit for stringification
- **Streamed/delta chunks** need coalescing by `messageID` for display
- **Timestamp formats vary** -- can be ISO 8601 strings (with or without fractional seconds) or numeric epoch (seconds, milliseconds, or microseconds)

### Search Behavior
- **Lightweight sessions cannot be text-searched** until fully parsed
- **Large sessions (>=10MB)** are parsed sequentially to avoid memory spikes
- **Search results are temporary** -- clearing search reverts display (though a bug fix persists parsed data back to the canonical session list)
- **Preamble filtering** is enabled by default (`SkipAgentsPreamble`) -- agents.md content, system prompts, and Claude caveat blocks are skipped in titles

### Resume
- Claude `--resume` has a known regression in some CLI versions where it starts a new session instead of resuming
- Codex resume uses `--config experimental_resume=<path>` (experimental flag)
- Resume always opens in Terminal/iTerm -- no programmatic API

### Performance
- Initial load uses lightweight parsing (metadata only) for fast startup
- Full parsing of a 10MB file takes approximately 2-3 seconds
- Search through 1000 sessions: ~17 seconds total (2s for small, 15s for large)
- Memory: ~40MB idle, peaks to ~200MB during large session parsing

### File Discovery
- Claude discovery scans top 8 most-recently-modified project directories (incremental mode)
- Codex discovery scans a 3-day rolling window (incremental mode)
- Full scans are performed periodically and on first launch
- If Claude projects exceed 800 files per project directory, drift detection triggers a full rescan

---

## Key Documentation Files in the Repo

| Path | Description |
|------|-------------|
| `README.md` | Project overview, install, features |
| `CLAUDE.md` | Instructions for AI agents contributing to the project |
| `agents.md` | Shared playbook for all contributing agents |
| `CHANGELOG.md` | Release notes |
| `docs/claude-code-session-format.md` | Detailed Claude Code JSONL format analysis |
| `docs/session-storage-format.md` | Detailed Codex CLI JSONL format specification |
| `docs/claude-resume.md` | Claude Code resume integration spec |
| `docs/search-architecture.md` | Two-phase search system architecture |
| `docs/focus-architecture.md` | Window focus coordination system |
| `docs/PRIVACY.md` | Privacy policy (local-only, no telemetry) |
| `docs/security.md` | Security documentation |
| `docs/schemas/session_event.schema.json` | Normalized SessionEvent JSON schema |
| `docs/agent-support/agent-support-matrix.yml` | Verified agent versions and test fixtures |
| `docs/analytics/` | Analytics system documentation |

---

## Summary

Agent Sessions is a mature, well-documented native macOS application for browsing AI coding assistant sessions. While it is not a library you import, its value for other projects lies in:

1. **Its detailed session format documentation** -- the most comprehensive reference for how Codex CLI, Claude Code, Gemini CLI, Copilot CLI, Droid, OpenCode, and OpenClaw store sessions on disk
2. **Its normalized data model** -- the `SessionEvent` schema provides a clean abstraction over 7+ different raw formats
3. **Its parsing heuristics** -- handling of schema drift, timestamp format variations, content nesting differences, preamble detection, and edge cases that you would otherwise have to discover yourself
4. **Its search architecture** -- a practical two-phase approach for handling collections of mixed-size JSONL files efficiently

For building tools that interact with AI session data, the session format docs and the normalized schema are the most directly useful artifacts. The parsing logic in the Swift source (especially `SessionEventKind.from(role:type:)` and the various `SessionParser` implementations) serves as an authoritative reference for how to handle the many format variations across agents.
