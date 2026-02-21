export type SessionSource = "claude" | "codex" | "gemini" | "opencode" | "droid" | "copilot";

export const SESSION_SOURCES: SessionSource[] = ["claude", "codex", "gemini", "opencode", "droid", "copilot"];

export type SessionEventKind = "user" | "assistant" | "tool_call" | "tool_result" | "error" | "meta";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
}

export const EMPTY_TOKEN_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
};

export interface SessionEvent {
  id: string;
  sessionId: string;
  kind: SessionEventKind;
  timestamp: string | null;
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
  costUsd: number | null;
}

export interface Session {
  id: string;
  source: SessionSource;
  filePath: string;
  fileSizeBytes: number;
  startTime: string | null;
  endTime: string | null;
  durationMs: number | null;
  title: string | null;
  model: string | null;
  cwd: string | null;
  repoName: string | null;
  gitBranch: string | null;
  cliVersion: string | null;
  eventCount: number;
  messageCount: number;
  totalTokens: TokenUsage;
  totalCostUsd: number | null;
  toolCallCount: number;
  isHousekeeping: boolean;
  parsedAt: string;
}

export interface DailyAggregate {
  date: string;
  source: SessionSource | "all";
  model: string | "all";
  sessionCount: number;
  messageCount: number;
  toolCallCount: number;
  tokens: TokenUsage;
  costUsd: number;
  totalDurationMs: number;
}

export interface DashboardSummary {
  totals: {
    sessions: number;
    events: number;
    messages: number;
    toolCalls: number;
    tokens: TokenUsage;
    costUsd: number;
    durationMs: number;
  };
  byAgent: Record<SessionSource, {
    sessions: number;
    events: number;
    tokens: TokenUsage;
    costUsd: number;
  }>;
  byModel: Array<{
    model: string;
    sessions: number;
    tokens: TokenUsage;
    costUsd: number;
  }>;
  dailyTimeline: DailyAggregate[];
  topRepos: Array<{ repo: string; sessions: number; costUsd: number }>;
  topTools: Array<{ tool: string; count: number }>;
}

export interface SessionFilters {
  query: string;
  sources: SessionSource[];
  models: string[];
  dateFrom: string | null;
  dateTo: string | null;
  repoName: string | null;
  minCost: number | null;
  sortBy: "date" | "cost" | "tokens" | "duration";
  sortDir: "asc" | "desc";
  offset: number;
  limit: number;
}

export interface TrayStats {
  todayTokens: number;
  todayCost: number;
  todaySessions: number;
  todayEvents: number;
  activeSessions: number;
}

export interface ScanState {
  file_path: string;
  source: SessionSource;
  file_size: number;
  mtime_ms: number;
  parsed_at: string;
  session_id: string | null;
}
