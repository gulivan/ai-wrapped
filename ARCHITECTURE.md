# AI Stats — Architecture Spec

> Desktop analytics dashboard for AI coding agent session logs.
> Reads local JSONL/JSON session files from Claude Code, Codex CLI, Gemini CLI, OpenCode, Factory Droid, and Copilot CLI.
> Cross-platform via Electrobun + React + Tailwind + SQLite.

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Normalized Data Model](#2-normalized-data-model)
3. [SQLite Schema](#3-sqlite-schema)
4. [Session Discovery & Parsing Pipeline](#4-session-discovery--parsing-pipeline)
5. [Cost Computation](#5-cost-computation)
6. [RPC Schema](#6-rpc-schema)
7. [Component Tree](#7-component-tree)
8. [File-by-File Implementation Plan](#8-file-by-file-implementation-plan)
9. [Build & Dev Workflow](#9-build--dev-workflow)
10. [Data Flow Diagram](#10-data-flow-diagram)
11. [Main Process Behavior](#11-main-process-behavior-srcbunindexts)

---

## 1. Project Structure

```
ai-stats/
  src/
    bun/
      index.ts                  # Main process: window, tray, menu, RPC handlers, scan orchestration
      db.ts                     # SQLite schema, migrations, query helpers
      discovery/
        index.ts                # Unified discovery orchestrator (scans all agents)
        claude.ts               # Claude Code file discovery
        codex.ts                # Codex CLI file discovery
        gemini.ts               # Gemini CLI file discovery
        opencode.ts             # OpenCode file discovery
        droid.ts                # Factory Droid file discovery
        copilot.ts              # GitHub Copilot CLI file discovery
      parsers/
        index.ts                # Parser registry + dispatch
        claude.ts               # Claude Code JSONL parser
        codex.ts                # Codex CLI JSONL parser
        gemini.ts               # Gemini CLI JSON parser
        opencode.ts             # OpenCode multi-file parser
        droid.ts                # Factory Droid JSONL + settings parser
        copilot.ts              # Copilot CLI JSONL parser
      normalizer.ts             # Raw parsed events -> unified SessionEvent + Session
      aggregator.ts             # Compute daily/model/agent aggregates, write to SQLite
      pricing.ts                # Model pricing table + cost calculator
      scan.ts                   # Scan orchestrator: discovery -> parse -> normalize -> store -> aggregate
    shared/
      types.ts                  # Electrobun RPC type definitions
      schema.ts                 # SessionEvent, Session, SessionSource, etc.
      constants.ts              # Agent names, default paths, pricing
    mainview/
      index.html                # HTML shell (Vite entry)
      index.css                 # Tailwind v4 import + custom properties
      index.ts                  # React app entry + Electroview RPC setup
      App.tsx                   # Root layout: sidebar nav + content area
      components/
        Dashboard.tsx           # Main dashboard with charts
        DashboardCharts.tsx     # Recharts chart components (token timeline, cost pie, etc.)
        SessionList.tsx         # Session browser with search/filter
        SessionListItem.tsx     # Single session row
        SessionDetail.tsx       # Session detail view with event timeline
        EventTimeline.tsx       # Event list within a session
        EventItem.tsx           # Single event display
        FilterBar.tsx           # Date range, agent, model, repo filters
        SearchInput.tsx         # Search input with debounce
        StatsCards.tsx          # Summary stat cards (total tokens, cost, sessions)
        AgentBadge.tsx          # Colored agent indicator
        Sidebar.tsx             # Navigation sidebar
        Settings.tsx            # Settings panel (scan paths, theme)
        EmptyState.tsx          # Empty/loading/error states
      hooks/
        useRPC.ts               # Electroview RPC singleton + typed request helper
        useSessions.ts          # Session list with pagination, search, filters
        useDashboardData.ts     # Aggregated dashboard data
        useSessionDetail.ts     # Single session events
        useTrayStats.ts         # Quick stats for tray updates
      lib/
        formatters.ts           # Number, date, token, cost formatting
        constants.ts            # UI constants, colors per agent, chart config
        filters.ts              # Filter state management helpers
  electrobun.config.ts          # Electrobun build configuration
  vite.config.ts                # Vite config (React + Tailwind plugins)
  tsconfig.json
  package.json
```

---

## 2. Normalized Data Model

### `src/shared/schema.ts`

All agent-specific formats are normalized into these shared types. The schema is modeled after the [Agent Sessions](https://github.com/jazzyalex/agent-sessions) normalized schema, extended with token/cost fields for analytics.

```typescript
// ─── Agent Sources ───────────────────────────────────────────────

export type SessionSource = "claude" | "codex" | "gemini" | "opencode" | "droid" | "copilot";

export const SESSION_SOURCES: SessionSource[] = ["claude", "codex", "gemini", "opencode", "droid", "copilot"];

// ─── Event Kinds ─────────────────────────────────────────────────

export type SessionEventKind = "user" | "assistant" | "tool_call" | "tool_result" | "error" | "meta";

// ─── Token Usage ─────────────────────────────────────────────────

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;  // Gemini "thoughts", OpenCode "reasoning", Droid "thinking"
}

// ─── Session Event (normalized) ──────────────────────────────────

export interface SessionEvent {
  id: string;                          // Unique event ID (from source or generated)
  sessionId: string;                   // Parent session ID
  kind: SessionEventKind;
  timestamp: string | null;            // ISO 8601 (always normalized to ISO string)
  role: string | null;                 // Raw role if available
  text: string | null;                 // Extracted text content (user prompt / assistant response)
  toolName: string | null;             // Tool/function name for tool_call events
  toolInput: string | null;            // Serialized tool arguments
  toolOutput: string | null;           // Tool execution output (for tool_result)
  model: string | null;                // Model used for this specific event
  parentId: string | null;             // Parent event ID (for threaded conversations)
  messageId: string | null;            // For grouping streamed deltas
  isDelta: boolean;                    // True if streaming chunk
  tokens: TokenUsage | null;           // Per-event token counts (assistant events)
  costUsd: number | null;              // Computed cost in USD (null if not computable)
}

// ─── Session (normalized) ────────────────────────────────────────

export interface Session {
  id: string;                          // Session identifier
  source: SessionSource;               // Which agent
  filePath: string;                    // Absolute path to primary session file
  fileSizeBytes: number;               // File size on disk
  startTime: string | null;            // ISO 8601 — earliest event timestamp
  endTime: string | null;              // ISO 8601 — latest event timestamp
  durationMs: number | null;           // endTime - startTime in ms
  title: string | null;                // Derived from first user message
  model: string | null;                // Primary model (most frequent or first seen)
  cwd: string | null;                  // Working directory
  repoName: string | null;             // Extracted from cwd (last path component of git root)
  gitBranch: string | null;            // Git branch
  cliVersion: string | null;           // Agent CLI version
  eventCount: number;                  // Total normalized events
  messageCount: number;                // user + assistant events only
  totalTokens: TokenUsage;             // Summed across all events
  totalCostUsd: number | null;         // Summed cost
  toolCallCount: number;               // Number of tool_call events
  isHousekeeping: boolean;             // True if no meaningful user/assistant content
  parsedAt: string;                    // ISO 8601 — when we last parsed this file
}

// ─── Daily Aggregate ─────────────────────────────────────────────

export interface DailyAggregate {
  date: string;                        // YYYY-MM-DD
  source: SessionSource | "all";       // Per-agent or combined
  model: string | "all";               // Per-model or combined
  sessionCount: number;
  messageCount: number;
  toolCallCount: number;
  tokens: TokenUsage;
  costUsd: number;
  totalDurationMs: number;
}

// ─── Dashboard Summary ───────────────────────────────────────────

export interface DashboardSummary {
  totals: {
    sessions: number;
    messages: number;
    toolCalls: number;
    tokens: TokenUsage;
    costUsd: number;
    durationMs: number;
  };
  byAgent: Record<SessionSource, {
    sessions: number;
    tokens: TokenUsage;
    costUsd: number;
  }>;
  byModel: Array<{
    model: string;
    sessions: number;
    tokens: TokenUsage;
    costUsd: number;
  }>;
  dailyTimeline: DailyAggregate[];    // For time-series charts
  topRepos: Array<{ repo: string; sessions: number; costUsd: number }>;
  topTools: Array<{ tool: string; count: number }>;
}

// ─── Filter Parameters ───────────────────────────────────────────

export interface SessionFilters {
  query: string;                       // Free-text search
  sources: SessionSource[];            // Agent filter (empty = all)
  models: string[];                    // Model filter (empty = all)
  dateFrom: string | null;             // ISO date YYYY-MM-DD
  dateTo: string | null;               // ISO date YYYY-MM-DD
  repoName: string | null;             // Repository filter
  minCost: number | null;              // Minimum session cost
  sortBy: "date" | "cost" | "tokens" | "duration";
  sortDir: "asc" | "desc";
  offset: number;                      // Pagination
  limit: number;
}

// ─── Tray Stats ──────────────────────────────────────────────────

export interface TrayStats {
  todayTokens: number;
  todayCost: number;
  todaySessions: number;
  activeSessions: number;              // Sessions with events in last 30min
}
```

### Event Kind Resolution

Mapping from raw agent event types to normalized `SessionEventKind`:

| Raw type values | Normalized kind |
|----------------|-----------------|
| `user`, role=`user` | `user` |
| `assistant`, role=`assistant` | `assistant` |
| `tool_call`, `tool-call`, `tool_use`, `function_call` | `tool_call` |
| `tool_result`, `tool-result`, `function_call_output`, `function_result` | `tool_result` |
| `error`, `err` | `error` |
| `system`, `summary`, `file-history-snapshot`, `session_meta`, `turn_context`, `todo_state`, `session_start`, `progress` | `meta` |

Fallback when `type` is unrecognized: check `role` field, then default to `meta`.

---

## 3. SQLite Schema

### `src/bun/db.ts`

Database location: `~/.ai-stats/index.db` (user-writable, outside app bundle).

```sql
-- ─── Schema version tracking ────────────────────────────────────

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);

-- ─── Scan state (delta tracking per file) ───────────────────────

CREATE TABLE IF NOT EXISTS scan_state (
  file_path    TEXT PRIMARY KEY,
  source       TEXT NOT NULL,        -- SessionSource
  file_size    INTEGER NOT NULL,
  mtime_ms     INTEGER NOT NULL,     -- File modification time (Unix ms)
  parsed_at    TEXT NOT NULL,         -- ISO 8601
  session_id   TEXT                   -- Linked session ID (null if parse failed)
);

CREATE INDEX idx_scan_state_source ON scan_state(source);
CREATE INDEX idx_scan_state_session ON scan_state(session_id);

-- ─── Sessions ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY,
  source          TEXT NOT NULL,
  file_path       TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  start_time      TEXT,               -- ISO 8601
  end_time        TEXT,               -- ISO 8601
  duration_ms     INTEGER,
  title           TEXT,
  model           TEXT,
  cwd             TEXT,
  repo_name       TEXT,
  git_branch      TEXT,
  cli_version     TEXT,
  event_count     INTEGER NOT NULL DEFAULT 0,
  message_count   INTEGER NOT NULL DEFAULT 0,
  tool_call_count INTEGER NOT NULL DEFAULT 0,
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens   INTEGER NOT NULL DEFAULT 0,
  cost_usd        REAL,
  is_housekeeping INTEGER NOT NULL DEFAULT 0,
  parsed_at       TEXT NOT NULL
);

CREATE INDEX idx_sessions_source ON sessions(source);
CREATE INDEX idx_sessions_start_time ON sessions(start_time);
CREATE INDEX idx_sessions_model ON sessions(model);
CREATE INDEX idx_sessions_repo ON sessions(repo_name);
CREATE INDEX idx_sessions_cost ON sessions(cost_usd);

-- ─── Events (indexed subset — not full rawJSON) ────────────────

CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  timestamp   TEXT,
  role        TEXT,
  model       TEXT,
  tool_name   TEXT,
  text_preview TEXT,                  -- First 500 chars of text (for search)
  parent_id   TEXT,
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens   INTEGER NOT NULL DEFAULT 0,
  cost_usd    REAL,
  sort_order  INTEGER NOT NULL        -- Preserves event order within session
);

CREATE INDEX idx_events_session ON events(session_id);
CREATE INDEX idx_events_kind ON events(kind);
CREATE INDEX idx_events_tool ON events(tool_name);
CREATE INDEX idx_events_timestamp ON events(timestamp);

-- ─── Daily aggregates (materialized for fast dashboard queries) ─

CREATE TABLE IF NOT EXISTS daily_agg (
  date         TEXT NOT NULL,          -- YYYY-MM-DD
  source       TEXT NOT NULL,          -- SessionSource or "all"
  model        TEXT NOT NULL,          -- Model name or "all"
  session_count   INTEGER NOT NULL DEFAULT 0,
  message_count   INTEGER NOT NULL DEFAULT 0,
  tool_call_count INTEGER NOT NULL DEFAULT 0,
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  reasoning_tokens   INTEGER NOT NULL DEFAULT 0,
  cost_usd        REAL NOT NULL DEFAULT 0,
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, source, model)
);

CREATE INDEX idx_daily_agg_date ON daily_agg(date);
CREATE INDEX idx_daily_agg_source ON daily_agg(source);

-- ─── Tool call frequency ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tool_usage (
  tool_name    TEXT NOT NULL,
  source       TEXT NOT NULL,
  date         TEXT NOT NULL,          -- YYYY-MM-DD
  call_count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tool_name, source, date)
);

-- ─── Full-text search (session content) ─────────────────────────

CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
  text_preview,                        -- Searchable text content
  content='events',                    -- External content table
  content_rowid='rowid'
);

-- Triggers to keep FTS in sync with events table
CREATE TRIGGER events_ai AFTER INSERT ON events BEGIN
  INSERT INTO events_fts(rowid, text_preview) VALUES (new.rowid, new.text_preview);
END;
CREATE TRIGGER events_ad AFTER DELETE ON events BEGIN
  INSERT INTO events_fts(events_fts, rowid, text_preview) VALUES('delete', old.rowid, old.text_preview);
END;
CREATE TRIGGER events_au AFTER UPDATE ON events BEGIN
  INSERT INTO events_fts(events_fts, rowid, text_preview) VALUES('delete', old.rowid, old.text_preview);
  INSERT INTO events_fts(rowid, text_preview) VALUES (new.rowid, new.text_preview);
END;

-- ─── App settings (key-value store) ─────────────────────────────

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                  -- JSON-encoded value
);

-- Default settings inserted on first run:
-- INSERT OR IGNORE INTO settings VALUES ('scanOnLaunch', 'true');
-- INSERT OR IGNORE INTO settings VALUES ('scanIntervalMinutes', '5');
-- INSERT OR IGNORE INTO settings VALUES ('theme', '"system"');
-- INSERT OR IGNORE INTO settings VALUES ('customPaths', '{}');
```

### Query Helpers

The `db.ts` module exports a `DB` class wrapping `bun:sqlite`:

```typescript
class DB {
  constructor(dbPath: string)               // Opens/creates DB, runs migrations

  // Scan state
  getScanState(filePath: string): ScanState | null
  upsertScanState(state: ScanState): void

  // Sessions
  upsertSession(session: Session): void
  getSession(id: string): Session | null
  querySessions(filters: SessionFilters): { sessions: Session[]; total: number }
  deleteSession(id: string): void

  // Events
  insertEvents(events: SessionEvent[]): void  // Batch insert (uses transaction)
  getSessionEvents(sessionId: string): SessionEvent[]
  deleteSessionEvents(sessionId: string): void
  searchEvents(query: string, limit: number): Array<{ sessionId: string; text: string }> // FTS5

  // Aggregates
  rebuildDailyAggregates(date?: string): void  // Recompute from sessions table
  getDashboardSummary(dateFrom?: string, dateTo?: string): DashboardSummary
  getDailyTimeline(dateFrom: string, dateTo: string): DailyAggregate[]
  getTopTools(limit: number): Array<{ tool: string; count: number }>
  getTopRepos(limit: number): Array<{ repo: string; sessions: number; costUsd: number }>
  getTrayStats(): TrayStats

  // Filters metadata (for filter dropdowns)
  getDistinctModels(): string[]
  getDistinctRepos(): string[]
  getDistinctSources(): SessionSource[]

  // Settings (key-value, JSON-encoded values)
  getSetting<T>(key: string, defaultValue: T): T
  setSetting<T>(key: string, value: T): void
  getAllSettings(): AppSettings

  // Maintenance
  vacuum(): void
  getStats(): { sessionCount: number; eventCount: number; dbSizeBytes: number }
}
```

---

## 4. Session Discovery & Parsing Pipeline

### Overview

```
[Scan Trigger]
     │
     ▼
[Discovery]  ─── per agent ───►  List<FileCandidate>
     │                            { path, source, mtime, size }
     ▼
[Delta Check]  ─── compare vs scan_state ───►  List<ChangedFile>
     │                                          (new or mtime/size changed)
     ▼
[Parser]  ─── per agent ───►  RawParsedSession
     │                         { rawEvents[], metadata }
     ▼
[Normalizer]  ───►  { session: Session, events: SessionEvent[] }
     │
     ▼
[Store]  ─── upsert session + events into SQLite
     │
     ▼
[Aggregator]  ─── recompute daily_agg rows for affected dates
     │
     ▼
[Notify webview]  ─── RPC message: sessionsUpdated
```

### Discovery Module (`src/bun/discovery/`)

Each agent discoverer implements:

```typescript
interface FileCandidate {
  path: string;
  source: SessionSource;
  mtime: number;     // Unix ms
  size: number;      // bytes
}

interface AgentDiscoverer {
  source: SessionSource;
  discover(): Promise<FileCandidate[]>;
}
```

#### Agent-specific discovery:

**Claude Code** (`discovery/claude.ts`):
- Root: `~/.claude/projects/`
- Glob: `~/.claude/projects/*/*.jsonl`
- Also: `~/.claude/projects/*/*/subagents/agent-*.jsonl`
- Session ID: from `sessionId` field inside JSONL (first event)
- Skip files < 100 bytes (empty/corrupt)

**Codex CLI** (`discovery/codex.ts`):
- Root: `~/.codex/sessions/` (or `$CODEX_HOME/sessions/`)
- Glob: `~/.codex/sessions/????/??/??/rollout-*.jsonl`
- Session ID: extract ULID from filename (`rollout-<datetime>-<ULID>.jsonl`)
- Date-sharded: `YYYY/MM/DD/`

**Gemini CLI** (`discovery/gemini.ts`):
- Root: `~/.gemini/tmp/`
- Glob: `~/.gemini/tmp/*/chats/session-*.json`
- Format: single JSON file (NOT JSONL)
- CWD: read from `.project_root` file in parent directory, or use directory name
- Session ID: from `sessionId` field in JSON

**OpenCode** (`discovery/opencode.ts`):
- Root v2: `~/.local/share/opencode/storage/`
- Session glob: `~/.local/share/opencode/storage/session/*/*.json`
- Must also read associated message files: `storage/message/ses_*/*.json`
- And part files: `storage/part/msg_*/*.json`
- Returns the session JSON path as the `FileCandidate.path`, but parser reads sibling dirs

**Factory Droid** (`discovery/droid.ts`):
- Root: `~/.factory/sessions/`
- JSONL glob: `~/.factory/sessions/*.jsonl`
- Settings companion: same stem + `.settings.json`
- Session ID: from `session_start` event or filename stem

**Copilot CLI** (`discovery/copilot.ts`):
- Root: `~/.copilot/session-state/`
- Glob: `~/.copilot/session-state/*.jsonl`
- Session ID: filename stem

#### Unified discovery (`discovery/index.ts`):

```typescript
async function discoverAll(): Promise<FileCandidate[]> {
  const discoverers = [claude, codex, gemini, opencode, droid, copilot];
  const results = await Promise.all(discoverers.map(d => d.discover().catch(() => [])));
  return results.flat();
}
```

### Parser Module (`src/bun/parsers/`)

Each parser implements:

```typescript
interface RawParsedSession {
  sessionId: string;
  source: SessionSource;
  filePath: string;
  metadata: {
    cwd: string | null;
    gitBranch: string | null;
    model: string | null;
    cliVersion: string | null;
    title: string | null;
  };
  events: RawEvent[];  // Agent-specific, pre-normalization
}

// Each RawEvent carries enough info for the normalizer
interface RawEvent {
  id: string;
  kind: SessionEventKind;
  timestamp: string | null;       // Already normalized to ISO 8601
  role: string | null;
  text: string | null;
  toolName: string | null;
  toolInput: string | null;
  toolOutput: string | null;
  model: string | null;
  parentId: string | null;
  messageId: string | null;
  isDelta: boolean;
  tokens: TokenUsage | null;
  costUsd: number | null;         // Only OpenCode provides this directly
}
```

#### Parser specifics:

**Claude Code** (`parsers/claude.ts`):
- Read file line-by-line (JSONL)
- Event kind: map `type` field (`user` | `assistant` | `progress` | `summary` | `system` | `file-history-snapshot`)
- For `assistant` events:
  - Extract `message.model`
  - Extract tokens from `message.usage`: `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`
  - Extract tool calls from `message.content[]` where `type === "tool_use"` — emit separate `tool_call` events
- For `user` events:
  - Text: `message.content` (string)
- Session metadata: `sessionId`, `cwd`, `gitBranch`, `version` from first event

**Codex CLI** (`parsers/codex.ts`):
- Read file line-by-line (JSONL)
- Top-level: `{ timestamp, type, payload }`
- `session_meta` → extract `payload.id`, `payload.cwd`, `payload.git.branch`, `payload.cli_version`, `payload.model_provider`
- `response_item` with `payload.type === "message"` → user/assistant based on `payload.role`
- `response_item` with `payload.type === "function_call"` → `tool_call` event
- `response_item` with `payload.type === "function_call_output"` → `tool_result` event
- `turn_context` → extract `payload.model` (model may change per turn)
- `event_msg` with `payload.type === "token_count"` → meta event (rate limit info, no per-event tokens available)
- Note: Codex does not provide per-event token counts — tokens field stays null

**Gemini CLI** (`parsers/gemini.ts`):
- Read entire JSON file (single object, NOT JSONL)
- Top-level: `{ sessionId, projectHash, startTime, lastUpdated, messages[] }`
- Each message has `type: "user" | "gemini"`, `content`, `toolCalls[]`, `thoughts[]`, `tokens{}`
- For `gemini` messages:
  - Tokens: `{ input, output, cached, thoughts, tool, total }` → map to `TokenUsage`
  - Tool calls: emit separate `tool_call` events from `toolCalls[]` array
  - Model: `messages[].model`
- CWD: read `.project_root` file from parent directory of chat file

**OpenCode** (`parsers/opencode.ts`):
- Multi-file read:
  1. Session file: `storage/session/<projectHash>/ses_*.json` → extract `id`, `directory`, `title`, `time.created/updated`, `version`
  2. Message files: `storage/message/ses_<id>/msg_*.json` → extract `role`, `modelID`, `providerID`, `cost`, `tokens`, `time.created`
  3. Part files: `storage/part/msg_<id>/prt_*.json` → extract `type`, `text` (actual content)
- Timestamps: Unix milliseconds → convert to ISO 8601
- Cost: `message.cost` (USD float) — use directly
- Tokens: `message.tokens.{ input, output, reasoning, cache.read, cache.write }`

**Factory Droid** (`parsers/droid.ts`):
- Read JSONL file line-by-line
- `session_start` → session ID, title, owner
- `message` → user/assistant based on `message.role`
  - Content blocks: `message.content[]` — extract text, tool_use, tool_result
- Read companion `.settings.json`:
  - `tokenUsage.{ inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, thinkingTokens }`
  - `providerLock` → model provider
  - `assistantActiveTimeMs` → duration
- Token counts are session-level totals (not per-event) — distribute proportionally or store on synthetic meta event
- Model: from `.settings.json` `providerLock` + global `~/.factory/settings.json` `model`

**Copilot CLI** (`parsers/copilot.ts`):
- Stub parser (not installed on reference machine)
- Read JSONL, use generic kind resolution
- Version: `data.copilotVersion`

### Error Handling

Every parser wraps its work in a try/catch and returns `null` on failure. Errors are logged but never halt the scan.

```typescript
// In parsers/index.ts
async function parseFile(candidate: FileCandidate): Promise<RawParsedSession | null> {
  try {
    const parser = PARSERS[candidate.source];
    return await parser.parse(candidate);
  } catch (err) {
    console.error(`[parse] Failed ${candidate.source} ${candidate.path}: ${err}`);
    return null;  // Skip this file, continue with others
  }
}
```

**Per-line JSONL resilience** (Claude, Codex, Droid):
- Each JSONL line is parsed independently in a try/catch
- Malformed lines are skipped — the remaining events are still usable
- A session with 0 successfully parsed events returns `null`

**File-level failures** (Gemini, OpenCode):
- `JSON.parse` failure on the whole file → return `null`
- Missing companion files (OpenCode parts, Droid settings) → degrade gracefully:
  - OpenCode: messages without parts get `text: null`
  - Droid: sessions without `.settings.json` get `tokens: null` (no cost)

**Scan-level resilience**:
- Discovery `Promise.all` uses `.catch(() => [])` per agent — one agent's directory being unreadable doesn't block others
- Parse batch failures are counted in `ScanResult.errors`
- The DB transaction wrapping session+events upsert uses `db.transaction()` — a single session's storage failure rolls back only that session

### Normalizer (`src/bun/normalizer.ts`)

Takes `RawParsedSession` → `{ session: Session, events: SessionEvent[] }`:

1. Sort events by timestamp
2. Compute `startTime` / `endTime` from first/last timestamps
3. Compute `durationMs` = endTime - startTime
4. Extract `title` from first `user` event text (first 200 chars, strip whitespace)
5. Extract `repoName` from `cwd` (last path segment after git root detection)
6. Sum all token counts → `totalTokens`
7. Compute cost via pricing module → `totalCostUsd`
8. Count events by kind → `eventCount`, `messageCount`, `toolCallCount`
9. Determine `isHousekeeping`: true if messageCount === 0 or only meta events
10. Set `model` to most frequent model across assistant events

### Scan Orchestrator (`src/bun/scan.ts`)

```typescript
interface ScanOptions {
  fullScan?: boolean;      // Ignore delta, re-parse everything
  sources?: SessionSource[];  // Limit to specific agents
}

async function runScan(db: DB, options?: ScanOptions): Promise<ScanResult> {
  // 1. Discover all files
  const candidates = await discoverAll();

  // 2. Delta check against scan_state
  const changed = candidates.filter(c => {
    const state = db.getScanState(c.path);
    return !state || state.mtime_ms !== c.mtime || state.file_size !== c.size;
  });

  // 3. Parse changed files (in batches to limit memory)
  const BATCH_SIZE = 50;
  for (const batch of chunk(changed, BATCH_SIZE)) {
    const parsed = await Promise.all(batch.map(f => parseFile(f)));

    for (const result of parsed) {
      if (!result) continue;
      // 4. Normalize
      const { session, events } = normalize(result);
      // 5. Store
      db.upsertSession(session);
      db.deleteSessionEvents(session.id);
      db.insertEvents(events);
      db.upsertScanState({ ... });
    }
  }

  // 6. Rebuild aggregates for affected dates
  const affectedDates = new Set(changed.map(c => /* extract date from session */));
  for (const date of affectedDates) {
    db.rebuildDailyAggregates(date);
  }

  // 7. Return stats
  return { scanned: changed.length, total: candidates.length, errors: errorCount };
}
```

```typescript
interface ScanResult {
  scanned: number;    // Files successfully parsed
  total: number;      // Total files discovered
  errors: number;     // Files that failed to parse
}
```

---

## 5. Cost Computation

### `src/bun/pricing.ts`

Since most agents don't store cost directly, we compute it from token counts + a pricing table.

```typescript
interface ModelPricing {
  inputPer1M: number;           // USD per 1M input tokens
  outputPer1M: number;          // USD per 1M output tokens
  cacheReadPer1M: number;       // USD per 1M cache read tokens
  cacheWritePer1M: number;      // USD per 1M cache write tokens
}

// Pricing table (update periodically)
const PRICING: Record<string, ModelPricing> = {
  // Anthropic
  "claude-opus-4-6":                { inputPer1M: 15, outputPer1M: 75, cacheReadPer1M: 1.5, cacheWritePer1M: 18.75 },
  "claude-opus-4-5-20251101":       { inputPer1M: 15, outputPer1M: 75, cacheReadPer1M: 1.5, cacheWritePer1M: 18.75 },
  "claude-sonnet-4-20250514":       { inputPer1M: 3, outputPer1M: 15, cacheReadPer1M: 0.3, cacheWritePer1M: 3.75 },
  "claude-3-5-sonnet-20241022":     { inputPer1M: 3, outputPer1M: 15, cacheReadPer1M: 0.3, cacheWritePer1M: 3.75 },
  "claude-3-5-haiku-20241022":      { inputPer1M: 0.8, outputPer1M: 4, cacheReadPer1M: 0.08, cacheWritePer1M: 1 },

  // OpenAI
  "gpt-5.2-codex":                  { inputPer1M: 2, outputPer1M: 8, cacheReadPer1M: 0.5, cacheWritePer1M: 0 },
  "gpt-4o":                         { inputPer1M: 2.5, outputPer1M: 10, cacheReadPer1M: 1.25, cacheWritePer1M: 0 },
  "o1":                             { inputPer1M: 15, outputPer1M: 60, cacheReadPer1M: 7.5, cacheWritePer1M: 0 },
  "o3":                             { inputPer1M: 10, outputPer1M: 40, cacheReadPer1M: 2.5, cacheWritePer1M: 0 },

  // Google
  "gemini-2.5-pro":                 { inputPer1M: 1.25, outputPer1M: 10, cacheReadPer1M: 0.315, cacheWritePer1M: 4.5 },
  "gemini-2.5-flash":               { inputPer1M: 0.15, outputPer1M: 0.6, cacheReadPer1M: 0.0375, cacheWritePer1M: 1.0 },
};

function computeCost(tokens: TokenUsage, model: string | null): number | null {
  if (!model) return null;
  // Try exact match, then prefix match (handle date suffixes)
  const pricing = PRICING[model] ?? findPricingByPrefix(model);
  if (!pricing) return null;

  return (
    (tokens.inputTokens * pricing.inputPer1M / 1_000_000) +
    (tokens.outputTokens * pricing.outputPer1M / 1_000_000) +
    (tokens.cacheReadTokens * pricing.cacheReadPer1M / 1_000_000) +
    (tokens.cacheWriteTokens * pricing.cacheWritePer1M / 1_000_000)
  );
}
```

For **OpenCode**: use `message.cost` directly (already in USD).
For **Codex CLI**: per-event token data is not available; cost will be `null` for individual events. If future Codex versions add token info to `event_msg`, the parser can be extended.
For **Factory Droid**: session-level token totals from `.settings.json` produce a single session-level cost.

---

## 6. RPC Schema

### `src/shared/types.ts`

```typescript
import type { RPCSchema } from "electrobun/bun";
import type {
  Session, SessionEvent, SessionFilters, DashboardSummary,
  DailyAggregate, TrayStats, SessionSource
} from "./schema";

export type AIStatsRPC = {
  bun: RPCSchema<{
    requests: {
      // ─── Dashboard ──────────────────────────────────
      getDashboardSummary: {
        params: { dateFrom?: string; dateTo?: string };
        response: DashboardSummary;
      };
      getDailyTimeline: {
        params: { dateFrom: string; dateTo: string; source?: SessionSource };
        response: DailyAggregate[];
      };

      // ─── Sessions ──────────────────────────────────
      getSessions: {
        params: SessionFilters;
        response: { sessions: Session[]; total: number };
      };
      getSession: {
        params: { id: string };
        response: Session | null;
      };
      getSessionEvents: {
        params: { sessionId: string };
        response: SessionEvent[];
      };

      // ─── Filters metadata ──────────────────────────
      getDistinctModels: {
        params: {};
        response: string[];
      };
      getDistinctRepos: {
        params: {};
        response: string[];
      };

      // ─── Scan ──────────────────────────────────────
      triggerScan: {
        params: { fullScan?: boolean };
        response: { scanned: number; total: number };
      };
      getScanStatus: {
        params: {};
        response: { isScanning: boolean; lastScanAt: string | null; sessionCount: number };
      };

      // ─── Tray ──────────────────────────────────────
      getTrayStats: {
        params: {};
        response: TrayStats;
      };

      // ─── Settings ──────────────────────────────────
      getSettings: {
        params: {};
        response: AppSettings;
      };
      updateSettings: {
        params: Partial<AppSettings>;
        response: boolean;
      };
    };

    messages: {
      log: { msg: string; level?: "info" | "warn" | "error" };
    };
  }>;

  webview: RPCSchema<{
    requests: {};
    messages: {
      // Bun → Webview push notifications
      sessionsUpdated: { scanResult: { scanned: number; total: number } };
      scanProgress: { phase: string; current: number; total: number };
      scanStarted: {};
      scanCompleted: { scanned: number; total: number };
      navigate: { view: "dashboard" | "sessions" | "settings" };  // Menu-driven navigation
    };
  }>;
};

// ─── App Settings ──────────────────────────────────────────────

export interface AppSettings {
  scanOnLaunch: boolean;              // Auto-scan on app start (default: true)
  scanIntervalMinutes: number;        // Background scan interval (default: 5)
  theme: "system" | "light" | "dark";
  // Per-agent custom root overrides (empty = use defaults)
  customPaths: Partial<Record<SessionSource, string>>;
}
```

### RPC Flow Summary

| Direction | Type | Name | Purpose |
|-----------|------|------|---------|
| webview → bun | request | `getDashboardSummary` | Load dashboard data |
| webview → bun | request | `getDailyTimeline` | Chart time-series |
| webview → bun | request | `getSessions` | Paginated session list with filters |
| webview → bun | request | `getSession` | Single session metadata |
| webview → bun | request | `getSessionEvents` | Full event list for session detail |
| webview → bun | request | `getDistinctModels` | Populate model filter dropdown |
| webview → bun | request | `getDistinctRepos` | Populate repo filter dropdown |
| webview → bun | request | `triggerScan` | Manual rescan from UI / menu |
| webview → bun | request | `getScanStatus` | Check scan state |
| webview → bun | request | `getTrayStats` | Quick stats for tray menu |
| webview → bun | request | `getSettings` | Load app settings |
| webview → bun | request | `updateSettings` | Save app settings |
| webview → bun | message | `log` | Forward frontend logs to bun console |
| bun → webview | message | `sessionsUpdated` | Notify UI to refresh after scan |
| bun → webview | message | `scanProgress` | Live progress during scan |
| bun → webview | message | `scanStarted` | Scan lifecycle |
| bun → webview | message | `scanCompleted` | Scan lifecycle |
| bun → webview | message | `navigate` | Menu-driven view switching |

---

## 7. Component Tree

```
App.tsx
├── Sidebar.tsx
│   ├── nav: Dashboard | Sessions | Settings
│   ├── agent source filter chips
│   └── scan status indicator
│
├── [route: Dashboard]
│   └── Dashboard.tsx
│       ├── StatsCards.tsx
│       │   ├── Total Tokens card
│       │   ├── Total Cost card
│       │   ├── Total Sessions card
│       │   └── Total Tool Calls card
│       │
│       └── DashboardCharts.tsx
│           ├── Token usage over time (Recharts AreaChart — stacked by agent)
│           ├── Cost breakdown by agent (Recharts PieChart)
│           ├── Cost breakdown by model (Recharts BarChart — horizontal)
│           ├── Sessions per day (Recharts BarChart)
│           ├── Top tool calls (Recharts BarChart — horizontal)
│           └── Top repositories by cost (Recharts BarChart — horizontal)
│
├── [route: Sessions]
│   └── SessionList.tsx
│       ├── SearchInput.tsx
│       ├── FilterBar.tsx
│       │   ├── Date range picker
│       │   ├── Agent source multi-select
│       │   ├── Model dropdown
│       │   ├── Repo dropdown
│       │   └── Sort controls
│       ├── SessionListItem.tsx (repeated)
│       │   ├── AgentBadge.tsx
│       │   ├── Title + repo + branch
│       │   ├── Token count + cost
│       │   └── Duration + timestamp
│       └── Pagination controls
│
├── [route: Session Detail]
│   └── SessionDetail.tsx
│       ├── Session header (title, agent, model, duration, cost)
│       ├── Session stats bar (tokens, messages, tool calls)
│       └── EventTimeline.tsx
│           └── EventItem.tsx (repeated)
│               ├── Kind icon + timestamp
│               ├── Text content (collapsible for long messages)
│               ├── Tool call details (name, input preview)
│               └── Token count badge (for assistant events)
│
├── [route: Settings]
│   └── Settings.tsx
│       ├── Scan settings (auto-scan toggle, interval)
│       ├── Custom path overrides per agent
│       ├── Theme selector
│       └── DB stats + manual vacuum button
│
└── EmptyState.tsx (used in Dashboard/SessionList when no data)
```

### Routing

Simple state-based routing (no library needed — single-page app with 4 views):

```typescript
type View = "dashboard" | "sessions" | "session-detail" | "settings";
const [view, setView] = useState<View>("dashboard");
const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
```

---

## 8. File-by-File Implementation Plan

Implementation order follows dependency chain: shared types → database → discovery → parsers → normalizer → scan orchestrator → RPC handlers → main process → frontend.

### Phase 1: Foundation

| # | File | Purpose | Key Details |
|---|------|---------|-------------|
| 1 | `src/shared/schema.ts` | All TypeScript types | `SessionEvent`, `Session`, `TokenUsage`, `DailyAggregate`, `DashboardSummary`, `SessionFilters`, `TrayStats`, `AppSettings` |
| 2 | `src/shared/types.ts` | RPC type definitions | `AIStatsRPC` type with all bun requests/messages and webview messages |
| 3 | `src/shared/constants.ts` | Shared constants | Agent names, default session paths per OS, default settings |
| 4 | `src/bun/pricing.ts` | Cost computation | `PRICING` table, `computeCost(tokens, model)`, `findPricingByPrefix()` for date-suffixed model names |
| 5 | `src/bun/db.ts` | SQLite database | Schema creation, migrations, `DB` class with all query methods. Uses `bun:sqlite`. Location: `~/.ai-stats/index.db` |

### Phase 2: Discovery

| # | File | Purpose | Key Details |
|---|------|---------|-------------|
| 6 | `src/bun/discovery/claude.ts` | Claude Code discovery | Glob `~/.claude/projects/*/*.jsonl` + subagent files. Filter < 100 bytes. |
| 7 | `src/bun/discovery/codex.ts` | Codex CLI discovery | Glob `~/.codex/sessions/????/??/??/rollout-*.jsonl`. Support `$CODEX_HOME`. |
| 8 | `src/bun/discovery/gemini.ts` | Gemini CLI discovery | Glob `~/.gemini/tmp/*/chats/session-*.json`. Read `.project_root` for CWD. |
| 9 | `src/bun/discovery/opencode.ts` | OpenCode discovery | Glob `~/.local/share/opencode/storage/session/*/*.json`. Map session → message → part file tree. |
| 10 | `src/bun/discovery/droid.ts` | Factory Droid discovery | Glob `~/.factory/sessions/*.jsonl`. Pair with `.settings.json`. |
| 11 | `src/bun/discovery/copilot.ts` | Copilot CLI discovery | Glob `~/.copilot/session-state/*.jsonl`. |
| 12 | `src/bun/discovery/index.ts` | Unified orchestrator | `discoverAll()` runs all 6 discoverers in parallel via `Promise.all`. |

### Phase 3: Parsers

| # | File | Purpose | Key Details |
|---|------|---------|-------------|
| 13 | `src/bun/parsers/claude.ts` | Claude JSONL parser | Line-by-line JSONL. Extract assistant tool_use blocks as separate tool_call events. Map `message.usage` to `TokenUsage`. |
| 14 | `src/bun/parsers/codex.ts` | Codex JSONL parser | Wrap `{ timestamp, type, payload }` envelope. Handle `session_meta`, `response_item` (3 subtypes), `turn_context`, `event_msg`. |
| 15 | `src/bun/parsers/gemini.ts` | Gemini JSON parser | Parse single JSON object. Iterate `messages[]`. Extract `tokens{}` per gemini message. Emit tool_call events from `toolCalls[]`. |
| 16 | `src/bun/parsers/opencode.ts` | OpenCode multi-file parser | Read session → messages → parts. Join parts to messages by `messageID`. Unix ms → ISO 8601. Use `message.cost` directly. |
| 17 | `src/bun/parsers/droid.ts` | Droid JSONL + settings parser | Parse JSONL for events, read `.settings.json` for session-level token totals. Attach token totals to synthetic summary event or distribute. |
| 18 | `src/bun/parsers/copilot.ts` | Copilot JSONL parser | Generic JSONL parser with standard kind resolution. Stub until agent is installable for testing. |
| 19 | `src/bun/parsers/index.ts` | Parser registry | `parseFile(candidate: FileCandidate): Promise<RawParsedSession \| null>` — dispatches to correct parser by `source`. |

### Phase 4: Normalize, Aggregate, Scan

| # | File | Purpose | Key Details |
|---|------|---------|-------------|
| 20 | `src/bun/normalizer.ts` | Raw → normalized | Sort events by timestamp. Compute session metadata (title, duration, totals). Call `computeCost` per event. Determine `isHousekeeping`. |
| 21 | `src/bun/aggregator.ts` | Build daily aggregates | Query sessions table grouped by date/source/model. Upsert into `daily_agg`. Also compute "all" rollup rows. Rebuild `tool_usage` from events. |
| 22 | `src/bun/scan.ts` | Scan orchestrator | `runScan()`: discover → delta check → parse batch → normalize → store → aggregate → notify webview. Emits progress messages. |

### Phase 5: Main Process

| # | File | Purpose | Key Details |
|---|------|---------|-------------|
| 23 | `src/bun/index.ts` | Main process entry | Initialize DB. Create `BrowserWindow` with RPC handlers. Set up `ApplicationMenu`. Create `Tray` with quick stats. Schedule periodic scans. Handle menu actions. Detect Vite dev server for HMR. Window show/hide toggle on tray click. |

### Phase 6: Frontend

| # | File | Purpose | Key Details |
|---|------|---------|-------------|
| 24 | `src/mainview/index.html` | HTML shell | Minimal HTML with `<div id="root">`, links to `index.css`, script `index.ts` |
| 25 | `src/mainview/index.css` | Styles | `@import "tailwindcss"`. Custom properties for agent colors, chart theme colors. |
| 26 | `src/mainview/index.ts` | React entry | `Electroview.defineRPC<AIStatsRPC>()`, handle webview messages (`sessionsUpdated`, `scanProgress`). `createRoot` + render `<App />`. |
| 27 | `src/mainview/hooks/useRPC.ts` | RPC hook | Export `electroview` singleton. `useRPCRequest<T>(fn, params)` hook with loading/error state. |
| 28 | `src/mainview/hooks/useDashboardData.ts` | Dashboard data | Fetches `getDashboardSummary` + `getDailyTimeline`. Refetches on `sessionsUpdated` message. Date range state. |
| 29 | `src/mainview/hooks/useSessions.ts` | Session list data | Manages `SessionFilters` state. Fetches `getSessions`. Pagination, search debounce. |
| 30 | `src/mainview/hooks/useSessionDetail.ts` | Session detail data | Fetches `getSession` + `getSessionEvents` for a given ID. |
| 31 | `src/mainview/lib/formatters.ts` | Formatting utils | `formatTokens(n)` → "1.2M", `formatCost(usd)` → "$12.34", `formatDuration(ms)` → "2h 15m", `formatDate()`, `formatRelativeTime()` |
| 32 | `src/mainview/lib/constants.ts` | UI constants | Agent colors (`claude: "#E87B35"`, `codex: "#10B981"`, etc.), chart color palette, page sizes |
| 33 | `src/mainview/lib/filters.ts` | Filter helpers | `defaultFilters()`, `filtersToSearchParams()`, URL param sync |
| 34 | `src/mainview/App.tsx` | Root layout | State-based router. Sidebar + main content. Listen for `sessionsUpdated` to trigger refetch. |
| 35 | `src/mainview/components/Sidebar.tsx` | Navigation | View links (Dashboard/Sessions/Settings), scan status dot, last scan time |
| 36 | `src/mainview/components/Dashboard.tsx` | Dashboard view | Orchestrates `StatsCards` + `DashboardCharts`. Date range picker at top. |
| 37 | `src/mainview/components/StatsCards.tsx` | Summary cards | 4-card grid: Total Tokens, Total Cost, Sessions, Tool Calls. Each with trend indicator (vs previous period). |
| 38 | `src/mainview/components/DashboardCharts.tsx` | Chart grid | 6 Recharts charts (see component tree). Responsive 2-column grid. |
| 39 | `src/mainview/components/SessionList.tsx` | Session browser | Search + FilterBar + paginated list. Infinite scroll or page-based. |
| 40 | `src/mainview/components/SearchInput.tsx` | Search input | Debounced text input (300ms). Search icon + clear button. |
| 41 | `src/mainview/components/FilterBar.tsx` | Filter controls | Date range, agent chips, model select, repo select, sort. Fetches `getDistinctModels`/`getDistinctRepos` for dropdowns. |
| 42 | `src/mainview/components/SessionListItem.tsx` | Session row | AgentBadge, title, repo/branch, model, token count, cost, duration, relative time. Click → navigate to detail. |
| 43 | `src/mainview/components/AgentBadge.tsx` | Agent indicator | Colored dot/pill with agent name. Color from constants. |
| 44 | `src/mainview/components/SessionDetail.tsx` | Session detail | Header with metadata + EventTimeline. Back button to session list. |
| 45 | `src/mainview/components/EventTimeline.tsx` | Event list | Virtualized list of events (for sessions with 1000+ events). Sort by timestamp. |
| 46 | `src/mainview/components/EventItem.tsx` | Single event | Icon by kind, timestamp, text (collapsible), tool details, token badge. |
| 47 | `src/mainview/components/Settings.tsx` | Settings panel | Form for `AppSettings`. Save via `updateSettings` RPC. DB stats display. |
| 48 | `src/mainview/components/EmptyState.tsx` | Empty/loading states | Spinner for loading, illustration for no data, error message for failures. |

### Phase 7: Config & Build

| # | File | Purpose | Key Details |
|---|------|---------|-------------|
| 49 | `electrobun.config.ts` | Electrobun config | App name "AI Stats", identifier `com.aistats.app`. Copy `dist/` → `views/mainview/`. No `build.views` (Vite handles it). `exitOnLastWindowClosed: false` (tray mode). |
| 50 | `vite.config.ts` | Vite config | React + Tailwind plugins. Root: `src/mainview`. Build outDir: `../../dist`. Dev server port 5173. |
| 51 | `tsconfig.json` | TypeScript | Strict mode. Paths: `@shared/*` → `src/shared/*`. Target ES2022. |
| 52 | `package.json` | Dependencies | Remove `"type": "module"` and `"module"`. Scripts: `dev`, `dev:hmr`, `build`, `build:prod`. |

---

## 9. Build & Dev Workflow

### Dependencies

```bash
# Core
bun add electrobun

# Frontend
bun add react react-dom recharts
bun add -d @vitejs/plugin-react vite @tailwindcss/vite
bun add -d @types/react @types/react-dom

# Dev tooling
bun add -d concurrently typescript
```

### package.json Scripts

```json
{
  "name": "ai-stats",
  "private": true,
  "scripts": {
    "dev": "vite build && electrobun dev --console",
    "dev:hmr": "concurrently \"vite --port 5173\" \"electrobun dev --console\"",
    "build": "vite build && electrobun build",
    "build:prod": "vite build && electrobun build --env=stable",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist .electrobun"
  }
}
```

### Development Workflow

1. **`bun run dev:hmr`** — Runs Vite dev server (port 5173) + Electrobun dev mode concurrently.
   - Main process (`src/bun/index.ts`) detects Vite dev server and loads `http://localhost:5173` instead of bundled views.
   - Frontend changes hot-reload instantly via Vite HMR.
   - Bun-side changes require restarting `electrobun dev`.

2. **`bun run dev`** — Builds frontend with Vite first, then runs Electrobun dev mode.
   - No HMR, but tests the production-like flow.

3. **`bun run build:prod`** — Production build.
   - Vite builds optimized frontend → `dist/`
   - Electrobun bundles everything → `.electrobun/` artifacts

### electrobun.config.ts

```typescript
import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "AI Stats",
    identifier: "com.aistats.app",
    version: "0.1.0",
  },
  runtime: {
    exitOnLastWindowClosed: false,  // Keep running in tray
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    // No build.views — Vite handles frontend bundling
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
    },
    mac: { bundleCEF: false },
    linux: { bundleCEF: true },  // WebKitGTK has limitations
    win: { bundleCEF: false },
  },
} satisfies ElectrobunConfig;
```

### vite.config.ts

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: "src/mainview",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@shared": "../shared",
    },
  },
});
```

---

## 10. Data Flow Diagram

### App Startup

```
electrobun dev / app launch
     │
     ▼
src/bun/index.ts
     │
     ├── Open/create DB (~/.ai-stats/index.db)
     ├── Run migrations if needed
     ├── Create BrowserWindow (→ Vite dev server or views://mainview/)
     ├── Set up ApplicationMenu
     ├── Create Tray (quick stats)
     ├── If settings.scanOnLaunch → runScan()
     └── Schedule periodic scan (every N minutes)
```

### User Interaction Flow

```
[Dashboard View]
  │
  ├── Mount → useRPC.getDashboardSummary({ dateFrom, dateTo })
  │            useRPC.getDailyTimeline({ dateFrom, dateTo })
  │            → Bun queries daily_agg + sessions tables
  │            → Returns DashboardSummary + DailyAggregate[]
  │            → Render StatsCards + Recharts charts
  │
  └── Date range change → re-fetch with new params

[Session List View]
  │
  ├── Mount → useRPC.getSessions(filters)
  │            useRPC.getDistinctModels({})
  │            useRPC.getDistinctRepos({})
  │            → Bun queries sessions table with WHERE clauses
  │            → Returns paginated Session[]
  │
  ├── Search input → debounce 300ms → re-fetch with query
  ├── Filter change → re-fetch
  └── Click session → navigate to detail

[Session Detail View]
  │
  ├── Mount → useRPC.getSession({ id })
  │            useRPC.getSessionEvents({ sessionId })
  │            → Bun queries events table ORDER BY sort_order
  │            → Returns SessionEvent[]
  │            → Render EventTimeline
  │
  └── Back button → return to session list (preserve filters)

[Tray Menu]
  │
  ├── Show tray → Bun queries getTrayStats()
  │               → Today's tokens, cost, session count
  │
  └── "Rescan Sessions" → triggerScan() → progress messages → sessionsUpdated
```

### Scan Lifecycle

```
triggerScan (from menu, tray, auto, or settings)
     │
     ├── webview ← scanStarted message
     │
     ├── Discovery phase (parallel across 6 agents)
     │   └── webview ← scanProgress { phase: "discovery", current, total }
     │
     ├── Delta check (compare mtimes vs scan_state)
     │
     ├── Parse phase (batches of 50)
     │   └── webview ← scanProgress { phase: "parsing", current, total }
     │
     ├── Normalize + Store (upsert sessions + events)
     │
     ├── Aggregate (rebuild daily_agg for affected dates)
     │
     ├── webview ← scanCompleted { scanned, total }
     │
     └── webview ← sessionsUpdated { scanResult }
              │
              └── Frontend hooks detect message → refetch active queries
```

### Tray Update Cycle

```
Every 60 seconds (or on scanCompleted):
     │
     ├── db.getTrayStats()
     │   → SELECT COUNT, SUM tokens, SUM cost FROM sessions WHERE date(start_time) = date('now')
     │
     ├── tray.setTitle(`$${formatCost(stats.todayCost)}`)   // Shows cost in menu bar
     │
     └── tray.setMenu([
           { label: "Today: 1.2M tokens ($4.56)", enabled: false },
           { label: "3 sessions today", enabled: false },
           { type: "divider" },
           { label: "Show Dashboard", action: "show" },
           { label: "Rescan Sessions", action: "rescan" },
           { type: "divider" },
           { label: "Quit", action: "quit" },
         ])
```

---

## 11. Main Process Behavior (`src/bun/index.ts`)

### Window Management

The main window supports minimize-to-tray. Since `exitOnLastWindowClosed: false`, closing the window hides it instead of quitting:

```typescript
// Window creation
const mainWindow = new BrowserWindow({
  title: "AI Stats",
  url: await getMainViewUrl(),  // Vite dev server or views://mainview/
  frame: { width: 1100, height: 750, x: 200, y: 100 },
  titleBarStyle: "hiddenInset",
  rpc: { type: {} as AIStatsRPC, handlers: { /* ... */ } },
});

// Close → hide instead of quit (tray keeps running)
mainWindow.on("close", (e) => {
  // Hide the window, don't destroy it
  // On next "show" action, the window reappears with preserved state
});

// Tray click → toggle window visibility
tray.on("tray-clicked", (e) => {
  if (e.data.action === "show") {
    // Show and focus the window
  } else if (e.data.action === "rescan") {
    runScan(db, { fullScan: false });
  } else if (e.data.action === "quit") {
    Utils.quit();
  }
});
```

### Application Menu

```typescript
ApplicationMenu.setApplicationMenu([
  // App menu (macOS)
  {
    submenu: [
      { label: "About AI Stats", action: "about" },
      { type: "separator" },
      { label: "Preferences...", action: "preferences", accelerator: "CmdOrCtrl+," },
      { type: "separator" },
      { label: "Quit", role: "quit" },
    ],
  },
  // File
  {
    label: "File",
    submenu: [
      { label: "Rescan Sessions", action: "rescan", accelerator: "CmdOrCtrl+R" },
      { label: "Full Rescan", action: "full-rescan", accelerator: "CmdOrCtrl+Shift+R" },
      { type: "separator" },
      { role: "close" },
    ],
  },
  // Edit (standard)
  {
    label: "Edit",
    submenu: [
      { role: "undo" }, { role: "redo" }, { type: "separator" },
      { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" },
    ],
  },
  // View
  {
    label: "View",
    submenu: [
      { label: "Dashboard", action: "nav-dashboard", accelerator: "CmdOrCtrl+1" },
      { label: "Sessions", action: "nav-sessions", accelerator: "CmdOrCtrl+2" },
      { label: "Settings", action: "nav-settings", accelerator: "CmdOrCtrl+3" },
    ],
  },
]);

// Handle menu actions
Electrobun.events.on("application-menu-clicked", (e) => {
  switch (e.data.action) {
    case "rescan":      runScan(db); break;
    case "full-rescan": runScan(db, { fullScan: true }); break;
    case "preferences": mainWindow.rpc.send.navigate({ view: "settings" }); break;
    case "nav-dashboard": mainWindow.rpc.send.navigate({ view: "dashboard" }); break;
    case "nav-sessions":  mainWindow.rpc.send.navigate({ view: "sessions" }); break;
    case "nav-settings":  mainWindow.rpc.send.navigate({ view: "settings" }); break;
  }
});
```

### Periodic Scan Scheduling

```typescript
// On startup
const settings = db.getAllSettings();
if (settings.scanOnLaunch) {
  runScan(db);
}

// Periodic background scan
const intervalMs = settings.scanIntervalMinutes * 60 * 1000;
setInterval(() => {
  runScan(db);          // Delta scan only (skips unchanged files)
  updateTrayStats();    // Refresh tray menu with latest numbers
}, intervalMs);
```

### Settings Persistence

Settings are stored in the SQLite `settings` table as key-value pairs with JSON-encoded values. This avoids a separate settings file and keeps everything in the single `~/.ai-stats/index.db` database:

```typescript
// Read
const theme = db.getSetting("theme", "system");  // returns "system" if not set

// Write
db.setSetting("scanIntervalMinutes", 10);

// Bulk read for AppSettings
const all = db.getAllSettings();
// → { scanOnLaunch: true, scanIntervalMinutes: 5, theme: "system", customPaths: {} }
```

### Search Implementation

Session list search uses two strategies:

1. **Title/metadata search** — `LIKE '%query%'` on `sessions.title`, `sessions.repo_name`, `sessions.model`
2. **Content search** — FTS5 query on `events_fts` table, returns matching `session_id` values

```sql
-- Combined search: title match OR content match
SELECT DISTINCT s.* FROM sessions s
LEFT JOIN events e ON e.session_id = s.id
LEFT JOIN events_fts fts ON fts.rowid = e.rowid
WHERE s.title LIKE '%query%'
   OR s.repo_name LIKE '%query%'
   OR events_fts MATCH 'query'
ORDER BY s.start_time DESC
LIMIT ? OFFSET ?
```
