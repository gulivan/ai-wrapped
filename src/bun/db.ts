import { mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Database } from "bun:sqlite";
import {
  EMPTY_TOKEN_USAGE,
  SESSION_SOURCES,
  type DailyAggregate,
  type DashboardSummary,
  type ScanState,
  type Session,
  type SessionEvent,
  type SessionFilters,
  type SessionSource,
  type TokenUsage,
  type TrayStats,
} from "../shared/schema";
import type { AppSettings } from "../shared/types";

const DEFAULT_DB_PATH = join(homedir(), ".ai-stats", "index.db");
const SCHEMA_VERSION = 1;

const DEFAULT_SETTINGS: AppSettings = {
  scanOnLaunch: true,
  scanIntervalMinutes: 5,
  theme: "system",
  customPaths: {},
};

const schemaStatements = [
  "PRAGMA foreign_keys = ON",
  "PRAGMA journal_mode = WAL",
  "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)",
  `INSERT INTO schema_version(version)
   SELECT ${SCHEMA_VERSION}
   WHERE NOT EXISTS (SELECT 1 FROM schema_version)`,
  `UPDATE schema_version
   SET version = CASE WHEN version < ${SCHEMA_VERSION} THEN ${SCHEMA_VERSION} ELSE version END`,
  `CREATE TABLE IF NOT EXISTS scan_state (
    file_path    TEXT PRIMARY KEY,
    source       TEXT NOT NULL,
    file_size    INTEGER NOT NULL,
    mtime_ms     INTEGER NOT NULL,
    parsed_at    TEXT NOT NULL,
    session_id   TEXT
  )`,
  "CREATE INDEX IF NOT EXISTS idx_scan_state_source ON scan_state(source)",
  "CREATE INDEX IF NOT EXISTS idx_scan_state_session ON scan_state(session_id)",
  `CREATE TABLE IF NOT EXISTS sessions (
    id              TEXT PRIMARY KEY,
    source          TEXT NOT NULL,
    file_path       TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    start_time      TEXT,
    end_time        TEXT,
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
    input_tokens       INTEGER NOT NULL DEFAULT 0,
    output_tokens      INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    reasoning_tokens   INTEGER NOT NULL DEFAULT 0,
    cost_usd        REAL,
    is_housekeeping INTEGER NOT NULL DEFAULT 0,
    parsed_at       TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_sessions_source ON sessions(source)",
  "CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time)",
  "CREATE INDEX IF NOT EXISTS idx_sessions_model ON sessions(model)",
  "CREATE INDEX IF NOT EXISTS idx_sessions_repo ON sessions(repo_name)",
  "CREATE INDEX IF NOT EXISTS idx_sessions_cost ON sessions(cost_usd)",
  `CREATE TABLE IF NOT EXISTS events (
    id           TEXT PRIMARY KEY,
    session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL,
    timestamp    TEXT,
    role         TEXT,
    model        TEXT,
    tool_name    TEXT,
    text_preview TEXT,
    parent_id    TEXT,
    input_tokens       INTEGER NOT NULL DEFAULT 0,
    output_tokens      INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    reasoning_tokens   INTEGER NOT NULL DEFAULT 0,
    cost_usd     REAL,
    sort_order   INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id)",
  "CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind)",
  "CREATE INDEX IF NOT EXISTS idx_events_tool ON events(tool_name)",
  "CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)",
  `CREATE TABLE IF NOT EXISTS daily_agg (
    date            TEXT NOT NULL,
    source          TEXT NOT NULL,
    model           TEXT NOT NULL,
    session_count   INTEGER NOT NULL DEFAULT 0,
    message_count   INTEGER NOT NULL DEFAULT 0,
    tool_call_count INTEGER NOT NULL DEFAULT 0,
    input_tokens       INTEGER NOT NULL DEFAULT 0,
    output_tokens      INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    reasoning_tokens   INTEGER NOT NULL DEFAULT 0,
    cost_usd        REAL NOT NULL DEFAULT 0,
    duration_ms     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (date, source, model)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_daily_agg_date ON daily_agg(date)",
  "CREATE INDEX IF NOT EXISTS idx_daily_agg_source ON daily_agg(source)",
  `CREATE TABLE IF NOT EXISTS tool_usage (
    tool_name  TEXT NOT NULL,
    source     TEXT NOT NULL,
    date       TEXT NOT NULL,
    call_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tool_name, source, date)
  )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS events_fts USING fts5(
    text_preview,
    content='events',
    content_rowid='rowid'
  )`,
  `CREATE TRIGGER IF NOT EXISTS events_ai AFTER INSERT ON events BEGIN
    INSERT INTO events_fts(rowid, text_preview) VALUES (new.rowid, new.text_preview);
  END`,
  `CREATE TRIGGER IF NOT EXISTS events_ad AFTER DELETE ON events BEGIN
    INSERT INTO events_fts(events_fts, rowid, text_preview) VALUES('delete', old.rowid, old.text_preview);
  END`,
  `CREATE TRIGGER IF NOT EXISTS events_au AFTER UPDATE ON events BEGIN
    INSERT INTO events_fts(events_fts, rowid, text_preview) VALUES('delete', old.rowid, old.text_preview);
    INSERT INTO events_fts(rowid, text_preview) VALUES(new.rowid, new.text_preview);
  END`,
  `CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
];

interface SessionRow {
  id: string;
  source: SessionSource;
  file_path: string;
  file_size_bytes: number;
  start_time: string | null;
  end_time: string | null;
  duration_ms: number | null;
  title: string | null;
  model: string | null;
  cwd: string | null;
  repo_name: string | null;
  git_branch: string | null;
  cli_version: string | null;
  event_count: number;
  message_count: number;
  tool_call_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  cost_usd: number | null;
  is_housekeeping: number;
  parsed_at: string;
}

interface EventRow {
  id: string;
  session_id: string;
  kind: SessionEvent["kind"];
  timestamp: string | null;
  role: string | null;
  model: string | null;
  tool_name: string | null;
  text_preview: string | null;
  parent_id: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  cost_usd: number | null;
  sort_order: number;
}

const toTokenUsage = (row: {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
}): TokenUsage => ({
  inputTokens: row.input_tokens ?? 0,
  outputTokens: row.output_tokens ?? 0,
  cacheReadTokens: row.cache_read_tokens ?? 0,
  cacheWriteTokens: row.cache_write_tokens ?? 0,
  reasoningTokens: row.reasoning_tokens ?? 0,
});

const mapSessionRow = (row: SessionRow): Session => ({
  id: row.id,
  source: row.source,
  filePath: row.file_path,
  fileSizeBytes: row.file_size_bytes,
  startTime: row.start_time,
  endTime: row.end_time,
  durationMs: row.duration_ms,
  title: row.title,
  model: row.model,
  cwd: row.cwd,
  repoName: row.repo_name,
  gitBranch: row.git_branch,
  cliVersion: row.cli_version,
  eventCount: row.event_count,
  messageCount: row.message_count,
  totalTokens: toTokenUsage(row),
  totalCostUsd: row.cost_usd,
  toolCallCount: row.tool_call_count,
  isHousekeeping: row.is_housekeeping === 1,
  parsedAt: row.parsed_at,
});

const mapEventRow = (row: EventRow): SessionEvent => ({
  id: row.id,
  sessionId: row.session_id,
  kind: row.kind,
  timestamp: row.timestamp,
  role: row.role,
  text: row.text_preview,
  toolName: row.tool_name,
  toolInput: null,
  toolOutput: null,
  model: row.model,
  parentId: row.parent_id,
  messageId: null,
  isDelta: false,
  tokens: toTokenUsage(row),
  costUsd: row.cost_usd,
});

const dateFromTimestamp = (timestamp: string | null, fallback: string): string => {
  if (!timestamp) return fallback.slice(0, 10);
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return fallback.slice(0, 10);
  return new Date(parsed).toISOString().slice(0, 10);
};

export class DB {
  private readonly sqlite: Database;
  private readonly dbPath: string;

  constructor(dbPath = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
    mkdirSync(dirname(dbPath), { recursive: true });
    this.sqlite = new Database(dbPath);
    this.migrate();
    this.ensureDefaultSettings();
  }

  private migrate(): void {
    for (const statement of schemaStatements) {
      this.sqlite.run(statement);
    }
  }

  private ensureDefaultSettings(): void {
    this.setSetting("scanOnLaunch", DEFAULT_SETTINGS.scanOnLaunch);
    this.setSetting("scanIntervalMinutes", DEFAULT_SETTINGS.scanIntervalMinutes);
    this.setSetting("theme", DEFAULT_SETTINGS.theme);
    this.setSetting("customPaths", DEFAULT_SETTINGS.customPaths);
  }

  getScanState(filePath: string): ScanState | null {
    const row = this.sqlite
      .query<ScanState, [string]>(
        `SELECT file_path, source, file_size, mtime_ms, parsed_at, session_id
         FROM scan_state
         WHERE file_path = ?`,
      )
      .get(filePath);

    return row ?? null;
  }

  upsertScanState(state: ScanState): void {
    this.sqlite
      .query(
        `INSERT INTO scan_state (file_path, source, file_size, mtime_ms, parsed_at, session_id)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(file_path) DO UPDATE SET
           source = excluded.source,
           file_size = excluded.file_size,
           mtime_ms = excluded.mtime_ms,
           parsed_at = excluded.parsed_at,
           session_id = excluded.session_id`,
      )
      .run(
        state.file_path,
        state.source,
        state.file_size,
        state.mtime_ms,
        state.parsed_at,
        state.session_id,
      );
  }

  upsertSession(session: Session): void {
    this.sqlite
      .query(
        `INSERT INTO sessions (
          id, source, file_path, file_size_bytes, start_time, end_time, duration_ms,
          title, model, cwd, repo_name, git_branch, cli_version,
          event_count, message_count, tool_call_count,
          input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens,
          cost_usd, is_housekeeping, parsed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          source = excluded.source,
          file_path = excluded.file_path,
          file_size_bytes = excluded.file_size_bytes,
          start_time = excluded.start_time,
          end_time = excluded.end_time,
          duration_ms = excluded.duration_ms,
          title = excluded.title,
          model = excluded.model,
          cwd = excluded.cwd,
          repo_name = excluded.repo_name,
          git_branch = excluded.git_branch,
          cli_version = excluded.cli_version,
          event_count = excluded.event_count,
          message_count = excluded.message_count,
          tool_call_count = excluded.tool_call_count,
          input_tokens = excluded.input_tokens,
          output_tokens = excluded.output_tokens,
          cache_read_tokens = excluded.cache_read_tokens,
          cache_write_tokens = excluded.cache_write_tokens,
          reasoning_tokens = excluded.reasoning_tokens,
          cost_usd = excluded.cost_usd,
          is_housekeeping = excluded.is_housekeeping,
          parsed_at = excluded.parsed_at`,
      )
      .run(
        session.id,
        session.source,
        session.filePath,
        session.fileSizeBytes,
        session.startTime,
        session.endTime,
        session.durationMs,
        session.title,
        session.model,
        session.cwd,
        session.repoName,
        session.gitBranch,
        session.cliVersion,
        session.eventCount,
        session.messageCount,
        session.toolCallCount,
        session.totalTokens.inputTokens,
        session.totalTokens.outputTokens,
        session.totalTokens.cacheReadTokens,
        session.totalTokens.cacheWriteTokens,
        session.totalTokens.reasoningTokens,
        session.totalCostUsd,
        session.isHousekeeping ? 1 : 0,
        session.parsedAt,
      );
  }

  getSession(id: string): Session | null {
    const row = this.sqlite
      .query<SessionRow, [string]>(
        `SELECT
          id, source, file_path, file_size_bytes, start_time, end_time, duration_ms,
          title, model, cwd, repo_name, git_branch, cli_version,
          event_count, message_count, tool_call_count,
          input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens,
          cost_usd, is_housekeeping, parsed_at
         FROM sessions
         WHERE id = ?`,
      )
      .get(id);

    return row ? mapSessionRow(row) : null;
  }

  querySessions(filters: SessionFilters): { sessions: Session[]; total: number } {
    const where: string[] = [];
    const params: Array<string | number> = [];

    if (filters.query.trim().length > 0) {
      const q = `%${filters.query.trim()}%`;
      where.push("(title LIKE ? OR model LIKE ? OR repo_name LIKE ? OR id LIKE ?)");
      params.push(q, q, q, q);
    }

    if (filters.sources.length > 0) {
      const placeholders = filters.sources.map(() => "?").join(", ");
      where.push(`source IN (${placeholders})`);
      params.push(...filters.sources);
    }

    if (filters.models.length > 0) {
      const placeholders = filters.models.map(() => "?").join(", ");
      where.push(`model IN (${placeholders})`);
      params.push(...filters.models);
    }

    if (filters.dateFrom) {
      where.push("date(start_time) >= date(?)");
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      where.push("date(start_time) <= date(?)");
      params.push(filters.dateTo);
    }

    if (filters.repoName) {
      where.push("repo_name = ?");
      params.push(filters.repoName);
    }

    if (filters.minCost !== null && filters.minCost !== undefined) {
      where.push("COALESCE(cost_usd, 0) >= ?");
      params.push(filters.minCost);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const sortColumnMap: Record<SessionFilters["sortBy"], string> = {
      date: "COALESCE(start_time, parsed_at)",
      cost: "COALESCE(cost_usd, 0)",
      tokens:
        "(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens + reasoning_tokens)",
      duration: "COALESCE(duration_ms, 0)",
    };

    const sortDirection = filters.sortDir === "asc" ? "ASC" : "DESC";
    const sortColumn = sortColumnMap[filters.sortBy] ?? sortColumnMap.date;

    const totalRow = this.sqlite
      .query<{ total: number }, Array<string | number>>(`SELECT COUNT(*) AS total FROM sessions ${whereSql}`)
      .get(...params);

    const sessionsRows = this.sqlite
      .query<SessionRow, Array<string | number>>(
        `SELECT
          id, source, file_path, file_size_bytes, start_time, end_time, duration_ms,
          title, model, cwd, repo_name, git_branch, cli_version,
          event_count, message_count, tool_call_count,
          input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens,
          cost_usd, is_housekeeping, parsed_at
         FROM sessions
         ${whereSql}
         ORDER BY ${sortColumn} ${sortDirection}
         LIMIT ? OFFSET ?`,
      )
      .all(...params, filters.limit, filters.offset);

    return {
      sessions: sessionsRows.map(mapSessionRow),
      total: totalRow?.total ?? 0,
    };
  }

  deleteSession(id: string): void {
    this.sqlite.query("DELETE FROM sessions WHERE id = ?").run(id);
  }

  insertEvents(events: SessionEvent[]): void {
    const insert = this.sqlite.query(
      `INSERT INTO events (
        id, session_id, kind, timestamp, role, model, tool_name, text_preview, parent_id,
        input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens,
        cost_usd, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const tx = this.sqlite.transaction((input: SessionEvent[]) => {
      for (let index = 0; index < input.length; index += 1) {
        const event = input[index] as SessionEvent;
        const tokens = event.tokens ?? EMPTY_TOKEN_USAGE;
        const textPreview =
          (event.text ?? event.toolOutput ?? event.toolInput ?? "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 500) || null;

        insert.run(
          event.id,
          event.sessionId,
          event.kind,
          event.timestamp,
          event.role,
          event.model,
          event.toolName,
          textPreview,
          event.parentId,
          tokens.inputTokens,
          tokens.outputTokens,
          tokens.cacheReadTokens,
          tokens.cacheWriteTokens,
          tokens.reasoningTokens,
          event.costUsd,
          index,
        );
      }
    });

    tx(events);
  }

  getSessionEvents(sessionId: string): SessionEvent[] {
    const rows = this.sqlite
      .query<EventRow, [string]>(
        `SELECT
          id, session_id, kind, timestamp, role, model, tool_name, text_preview, parent_id,
          input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens,
          cost_usd, sort_order
         FROM events
         WHERE session_id = ?
         ORDER BY sort_order ASC`,
      )
      .all(sessionId);

    return rows.map(mapEventRow);
  }

  deleteSessionEvents(sessionId: string): void {
    this.sqlite.query("DELETE FROM events WHERE session_id = ?").run(sessionId);
  }

  searchEvents(query: string, limit: number): Array<{ sessionId: string; text: string }> {
    if (!query.trim()) return [];

    const rows = this.sqlite
      .query<{ sessionId: string; text: string }, [string, number]>(
        `SELECT events.session_id AS sessionId, events.text_preview AS text
         FROM events_fts
         JOIN events ON events.rowid = events_fts.rowid
         WHERE events_fts MATCH ?
         LIMIT ?`,
      )
      .all(query.trim(), limit);

    return rows;
  }

  rebuildDailyAggregates(date?: string): void {
    type AggregateSessionRow = {
      source: SessionSource;
      model: string | null;
      start_time: string | null;
      parsed_at: string;
      message_count: number;
      tool_call_count: number;
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cache_write_tokens: number;
      reasoning_tokens: number;
      cost_usd: number | null;
      duration_ms: number | null;
    };

    const sessions: AggregateSessionRow[] = date
      ? this.sqlite
          .query<AggregateSessionRow, string>(
            `SELECT source, model, start_time, parsed_at, message_count, tool_call_count,
                     input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens,
                     cost_usd, duration_ms
               FROM sessions
               WHERE date(COALESCE(start_time, parsed_at)) = date(?)`,
          )
          .all(date)
      : this.sqlite
          .query<AggregateSessionRow, []>(
            `SELECT source, model, start_time, parsed_at, message_count, tool_call_count,
                     input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens,
                     cost_usd, duration_ms
               FROM sessions`,
          )
          .all();

    const key = (d: string, s: string, m: string) => `${d}|${s}|${m}`;

    const aggregates = new Map<
      string,
      {
        date: string;
        source: SessionSource | "all";
        model: string | "all";
        sessionCount: number;
        messageCount: number;
        toolCallCount: number;
        tokens: TokenUsage;
        costUsd: number;
        durationMs: number;
      }
    >();

    const updateAggregate = (targetDate: string, source: SessionSource | "all", model: string | "all", row: {
      message_count: number;
      tool_call_count: number;
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cache_write_tokens: number;
      reasoning_tokens: number;
      cost_usd: number | null;
      duration_ms: number | null;
    }) => {
      const mapKey = key(targetDate, source, model);
      const existing =
        aggregates.get(mapKey) ??
        ({
          date: targetDate,
          source,
          model,
          sessionCount: 0,
          messageCount: 0,
          toolCallCount: 0,
          tokens: { ...EMPTY_TOKEN_USAGE },
          costUsd: 0,
          durationMs: 0,
        } as const);

      const next = {
        ...existing,
        sessionCount: existing.sessionCount + 1,
        messageCount: existing.messageCount + (row.message_count ?? 0),
        toolCallCount: existing.toolCallCount + (row.tool_call_count ?? 0),
        tokens: {
          inputTokens: existing.tokens.inputTokens + (row.input_tokens ?? 0),
          outputTokens: existing.tokens.outputTokens + (row.output_tokens ?? 0),
          cacheReadTokens: existing.tokens.cacheReadTokens + (row.cache_read_tokens ?? 0),
          cacheWriteTokens: existing.tokens.cacheWriteTokens + (row.cache_write_tokens ?? 0),
          reasoningTokens: existing.tokens.reasoningTokens + (row.reasoning_tokens ?? 0),
        },
        costUsd: existing.costUsd + (row.cost_usd ?? 0),
        durationMs: existing.durationMs + (row.duration_ms ?? 0),
      };

      aggregates.set(mapKey, next);
    };

    for (const row of sessions) {
      const aggregateDate = dateFromTimestamp(row.start_time, row.parsed_at);
      const model = row.model ?? "unknown";

      updateAggregate(aggregateDate, row.source, model, row);
      updateAggregate(aggregateDate, row.source, "all", row);
      updateAggregate(aggregateDate, "all", model, row);
      updateAggregate(aggregateDate, "all", "all", row);
    }

    const tx = this.sqlite.transaction(() => {
      if (date) {
        this.sqlite.query("DELETE FROM daily_agg WHERE date = ?").run(date);
      } else {
        this.sqlite.run("DELETE FROM daily_agg");
      }

      const insertAgg = this.sqlite.query(
        `INSERT INTO daily_agg (
          date, source, model,
          session_count, message_count, tool_call_count,
          input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens,
          cost_usd, duration_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      for (const agg of aggregates.values()) {
        insertAgg.run(
          agg.date,
          agg.source,
          agg.model,
          agg.sessionCount,
          agg.messageCount,
          agg.toolCallCount,
          agg.tokens.inputTokens,
          agg.tokens.outputTokens,
          agg.tokens.cacheReadTokens,
          agg.tokens.cacheWriteTokens,
          agg.tokens.reasoningTokens,
          agg.costUsd,
          agg.durationMs,
        );
      }

      if (date) {
        this.sqlite.query("DELETE FROM tool_usage WHERE date = ?").run(date);
      } else {
        this.sqlite.run("DELETE FROM tool_usage");
      }

      if (date) {
        this.sqlite
          .query(
            `INSERT INTO tool_usage (tool_name, source, date, call_count)
             SELECT
               e.tool_name,
               s.source,
               date(COALESCE(e.timestamp, s.start_time, s.parsed_at)) AS date,
               COUNT(*) AS call_count
             FROM events e
             JOIN sessions s ON s.id = e.session_id
             WHERE e.kind = 'tool_call'
               AND e.tool_name IS NOT NULL
               AND date(COALESCE(e.timestamp, s.start_time, s.parsed_at)) = date(?)
             GROUP BY e.tool_name, s.source, date(COALESCE(e.timestamp, s.start_time, s.parsed_at))`,
          )
          .run(date);
      } else {
        this.sqlite.run(
          `INSERT INTO tool_usage (tool_name, source, date, call_count)
           SELECT
             e.tool_name,
             s.source,
             date(COALESCE(e.timestamp, s.start_time, s.parsed_at)) AS date,
             COUNT(*) AS call_count
           FROM events e
           JOIN sessions s ON s.id = e.session_id
           WHERE e.kind = 'tool_call'
             AND e.tool_name IS NOT NULL
           GROUP BY e.tool_name, s.source, date(COALESCE(e.timestamp, s.start_time, s.parsed_at))`,
        );
      }
    });

    tx();
  }

  getDashboardSummary(dateFrom?: string, dateTo?: string): DashboardSummary {
    const where: string[] = [];
    const params: string[] = [];

    if (dateFrom) {
      where.push("date(COALESCE(start_time, parsed_at)) >= date(?)");
      params.push(dateFrom);
    }
    if (dateTo) {
      where.push("date(COALESCE(start_time, parsed_at)) <= date(?)");
      params.push(dateTo);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const totalsRow = this.sqlite
      .query<
        {
          sessions: number;
          events: number;
          messages: number;
          tool_calls: number;
          input_tokens: number;
          output_tokens: number;
          cache_read_tokens: number;
          cache_write_tokens: number;
          reasoning_tokens: number;
          cost_usd: number;
          duration_ms: number;
        },
        string[]
      >(
        `SELECT
          COUNT(*) AS sessions,
          COALESCE(SUM(event_count), 0) AS events,
          COALESCE(SUM(message_count), 0) AS messages,
          COALESCE(SUM(tool_call_count), 0) AS tool_calls,
          COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens,
          COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
          COALESCE(SUM(cache_write_tokens), 0) AS cache_write_tokens,
          COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
          COALESCE(SUM(cost_usd), 0) AS cost_usd,
          COALESCE(SUM(duration_ms), 0) AS duration_ms
         FROM sessions
         ${whereSql}`,
      )
      .get(...params);

    const byAgentRows = this.sqlite
      .query<
        {
          source: SessionSource;
          sessions: number;
          events: number;
          input_tokens: number;
          output_tokens: number;
          cache_read_tokens: number;
          cache_write_tokens: number;
          reasoning_tokens: number;
          cost_usd: number;
        },
        string[]
      >(
        `SELECT
          source,
          COUNT(*) AS sessions,
          COALESCE(SUM(event_count), 0) AS events,
          COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens,
          COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
          COALESCE(SUM(cache_write_tokens), 0) AS cache_write_tokens,
          COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
          COALESCE(SUM(cost_usd), 0) AS cost_usd
         FROM sessions
         ${whereSql}
         GROUP BY source`,
      )
      .all(...params);

    const byModelRows = this.sqlite
      .query<
        {
          model: string;
          sessions: number;
          input_tokens: number;
          output_tokens: number;
          cache_read_tokens: number;
          cache_write_tokens: number;
          reasoning_tokens: number;
          cost_usd: number;
        },
        string[]
      >(
        `SELECT
          COALESCE(model, 'unknown') AS model,
          COUNT(*) AS sessions,
          COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens,
          COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
          COALESCE(SUM(cache_write_tokens), 0) AS cache_write_tokens,
          COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
          COALESCE(SUM(cost_usd), 0) AS cost_usd
         FROM sessions
         ${whereSql}
         GROUP BY COALESCE(model, 'unknown')
         ORDER BY sessions DESC, cost_usd DESC
         LIMIT 20`,
      )
      .all(...params);

    const byAgent: DashboardSummary["byAgent"] = {
      claude: { sessions: 0, events: 0, tokens: { ...EMPTY_TOKEN_USAGE }, costUsd: 0 },
      codex: { sessions: 0, events: 0, tokens: { ...EMPTY_TOKEN_USAGE }, costUsd: 0 },
      gemini: { sessions: 0, events: 0, tokens: { ...EMPTY_TOKEN_USAGE }, costUsd: 0 },
      opencode: { sessions: 0, events: 0, tokens: { ...EMPTY_TOKEN_USAGE }, costUsd: 0 },
      droid: { sessions: 0, events: 0, tokens: { ...EMPTY_TOKEN_USAGE }, costUsd: 0 },
      copilot: { sessions: 0, events: 0, tokens: { ...EMPTY_TOKEN_USAGE }, costUsd: 0 },
    };

    for (const row of byAgentRows) {
      if (!SESSION_SOURCES.includes(row.source)) continue;
      byAgent[row.source] = {
        sessions: row.sessions,
        events: row.events,
        tokens: {
          inputTokens: row.input_tokens,
          outputTokens: row.output_tokens,
          cacheReadTokens: row.cache_read_tokens,
          cacheWriteTokens: row.cache_write_tokens,
          reasoningTokens: row.reasoning_tokens,
        },
        costUsd: row.cost_usd,
      };
    }

    const byModel = byModelRows.map((row) => ({
      model: row.model,
      sessions: row.sessions,
      tokens: {
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        cacheReadTokens: row.cache_read_tokens,
        cacheWriteTokens: row.cache_write_tokens,
        reasoningTokens: row.reasoning_tokens,
      },
      costUsd: row.cost_usd,
    }));

    let dailyTimeline: DailyAggregate[] = [];
    if (dateFrom && dateTo) {
      dailyTimeline = this.getDailyTimeline(dateFrom, dateTo);
    }

    return {
      totals: {
        sessions: totalsRow?.sessions ?? 0,
        events: totalsRow?.events ?? 0,
        messages: totalsRow?.messages ?? 0,
        toolCalls: totalsRow?.tool_calls ?? 0,
        tokens: {
          inputTokens: totalsRow?.input_tokens ?? 0,
          outputTokens: totalsRow?.output_tokens ?? 0,
          cacheReadTokens: totalsRow?.cache_read_tokens ?? 0,
          cacheWriteTokens: totalsRow?.cache_write_tokens ?? 0,
          reasoningTokens: totalsRow?.reasoning_tokens ?? 0,
        },
        costUsd: totalsRow?.cost_usd ?? 0,
        durationMs: totalsRow?.duration_ms ?? 0,
      },
      byAgent,
      byModel,
      dailyTimeline,
      topRepos: this.getTopRepos(10, dateFrom, dateTo),
      topTools: this.getTopTools(10, dateFrom, dateTo),
    };
  }

  getDailyTimeline(dateFrom: string, dateTo: string, source?: SessionSource): DailyAggregate[] {
    type DailyAggRow = {
      date: string;
      source: SessionSource | "all";
      model: string | "all";
      session_count: number;
      message_count: number;
      tool_call_count: number;
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cache_write_tokens: number;
      reasoning_tokens: number;
      cost_usd: number;
      duration_ms: number;
    };

    const rows: DailyAggRow[] = source
      ? this.sqlite
          .query<DailyAggRow, [string, string, SessionSource]>(
            `SELECT date, source, model, session_count, message_count, tool_call_count,
                      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens,
                      cost_usd, duration_ms
               FROM daily_agg
               WHERE date BETWEEN ? AND ?
                 AND source = ?
                 AND model = 'all'
               ORDER BY date ASC`,
          )
          .all(dateFrom, dateTo, source)
      : this.sqlite
          .query<DailyAggRow, [string, string]>(
            `SELECT date, source, model, session_count, message_count, tool_call_count,
                      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens,
                      cost_usd, duration_ms
               FROM daily_agg
               WHERE date BETWEEN ? AND ?
                 AND source = 'all'
                 AND model = 'all'
               ORDER BY date ASC`,
          )
          .all(dateFrom, dateTo);

    return rows.map((row) => ({
      date: row.date,
      source: row.source,
      model: row.model,
      sessionCount: row.session_count,
      messageCount: row.message_count,
      toolCallCount: row.tool_call_count,
      tokens: {
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        cacheReadTokens: row.cache_read_tokens,
        cacheWriteTokens: row.cache_write_tokens,
        reasoningTokens: row.reasoning_tokens,
      },
      costUsd: row.cost_usd,
      totalDurationMs: row.duration_ms,
    }));
  }

  getTopTools(limit: number, dateFrom?: string, dateTo?: string): Array<{ tool: string; count: number }> {
    const where: string[] = [];
    const params: Array<number | string> = [];

    if (dateFrom) {
      where.push("date >= date(?)");
      params.push(dateFrom);
    }
    if (dateTo) {
      where.push("date <= date(?)");
      params.push(dateTo);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const rows = this.sqlite
      .query<{ tool: string; count: number }, Array<number | string>>(
        `SELECT tool_name AS tool, SUM(call_count) AS count
         FROM tool_usage
         ${whereSql}
         GROUP BY tool_name
         ORDER BY count DESC, tool_name ASC
         LIMIT ?`,
      )
      .all(...params, limit);

    return rows;
  }

  getTopRepos(
    limit: number,
    dateFrom?: string,
    dateTo?: string,
  ): Array<{ repo: string; sessions: number; costUsd: number }> {
    const where: string[] = ["repo_name IS NOT NULL", "repo_name <> ''"];
    const params: Array<number | string> = [];

    if (dateFrom) {
      where.push("date(COALESCE(start_time, parsed_at)) >= date(?)");
      params.push(dateFrom);
    }
    if (dateTo) {
      where.push("date(COALESCE(start_time, parsed_at)) <= date(?)");
      params.push(dateTo);
    }

    const rows = this.sqlite
      .query<{ repo: string; sessions: number; costUsd: number }, Array<number | string>>(
        `SELECT repo_name AS repo, COUNT(*) AS sessions, COALESCE(SUM(cost_usd), 0) AS costUsd
         FROM sessions
         WHERE ${where.join(" AND ")}
         GROUP BY repo_name
         ORDER BY costUsd DESC, sessions DESC
         LIMIT ?`,
      )
      .all(...params, limit);

    return rows;
  }

  getTrayStats(): TrayStats {
    const today = new Date().toISOString().slice(0, 10);

    const todayRow = this.sqlite
      .query<
        {
          sessions: number;
          events: number;
          input_tokens: number;
          output_tokens: number;
          cache_read_tokens: number;
          cache_write_tokens: number;
          reasoning_tokens: number;
          cost_usd: number;
        },
        [string]
      >(
        `SELECT
          COUNT(*) AS sessions,
          COALESCE(SUM(event_count), 0) AS events,
          COALESCE(SUM(input_tokens), 0) AS input_tokens,
          COALESCE(SUM(output_tokens), 0) AS output_tokens,
          COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
          COALESCE(SUM(cache_write_tokens), 0) AS cache_write_tokens,
          COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
          COALESCE(SUM(cost_usd), 0) AS cost_usd
         FROM sessions
         WHERE date(COALESCE(start_time, parsed_at)) = date(?)`,
      )
      .get(today);

    const activeSince = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const activeRow = this.sqlite
      .query<{ active: number }, [string]>(
        `SELECT COUNT(DISTINCT session_id) AS active
         FROM events
         WHERE timestamp IS NOT NULL
           AND timestamp >= ?`,
      )
      .get(activeSince);

    return {
      todayTokens:
        (todayRow?.input_tokens ?? 0) +
        (todayRow?.output_tokens ?? 0) +
        (todayRow?.cache_read_tokens ?? 0) +
        (todayRow?.cache_write_tokens ?? 0) +
        (todayRow?.reasoning_tokens ?? 0),
      todayCost: todayRow?.cost_usd ?? 0,
      todaySessions: todayRow?.sessions ?? 0,
      todayEvents: todayRow?.events ?? 0,
      activeSessions: activeRow?.active ?? 0,
    };
  }

  getDistinctModels(): string[] {
    const rows = this.sqlite
      .query<{ model: string }, []>(
        `SELECT DISTINCT model
         FROM sessions
         WHERE model IS NOT NULL AND model <> ''
         ORDER BY model ASC`,
      )
      .all();

    return rows.map((row) => row.model);
  }

  getDistinctRepos(): string[] {
    const rows = this.sqlite
      .query<{ repo: string }, []>(
        `SELECT DISTINCT repo_name AS repo
         FROM sessions
         WHERE repo_name IS NOT NULL AND repo_name <> ''
         ORDER BY repo_name ASC`,
      )
      .all();

    return rows.map((row) => row.repo);
  }

  getDistinctSources(): SessionSource[] {
    const rows = this.sqlite
      .query<{ source: SessionSource }, []>(
        `SELECT DISTINCT source
         FROM sessions
         ORDER BY source ASC`,
      )
      .all();

    return rows
      .map((row) => row.source)
      .filter((source): source is SessionSource => SESSION_SOURCES.includes(source));
  }

  getSetting<T>(key: string, defaultValue: T): T {
    const row = this.sqlite
      .query<{ value: string }, [string]>(
        `SELECT value
         FROM settings
         WHERE key = ?`,
      )
      .get(key);

    if (!row) return defaultValue;

    try {
      return JSON.parse(row.value) as T;
    } catch {
      return defaultValue;
    }
  }

  setSetting<T>(key: string, value: T): void {
    this.sqlite
      .query(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`)
      .run(key, JSON.stringify(value));
    this.sqlite
      .query(`UPDATE settings SET value = ? WHERE key = ?`)
      .run(JSON.stringify(value), key);
  }

  getAllSettings(): AppSettings {
    return {
      scanOnLaunch: this.getSetting("scanOnLaunch", DEFAULT_SETTINGS.scanOnLaunch),
      scanIntervalMinutes: this.getSetting("scanIntervalMinutes", DEFAULT_SETTINGS.scanIntervalMinutes),
      theme: this.getSetting("theme", DEFAULT_SETTINGS.theme),
      customPaths: this.getSetting("customPaths", DEFAULT_SETTINGS.customPaths),
    };
  }

  vacuum(): void {
    this.sqlite.run("VACUUM");
  }

  getStats(): { sessionCount: number; eventCount: number; dbSizeBytes: number } {
    const sessionRow = this.sqlite.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM sessions").get();
    const eventRow = this.sqlite.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM events").get();

    let dbSizeBytes = 0;
    try {
      dbSizeBytes = statSync(this.dbPath).size;
    } catch {
      dbSizeBytes = 0;
    }

    return {
      sessionCount: sessionRow?.count ?? 0,
      eventCount: eventRow?.count ?? 0,
      dbSizeBytes,
    };
  }

  close(): void {
    this.sqlite.close();
  }
}

export const openDatabase = (path = DEFAULT_DB_PATH) => new DB(path);
