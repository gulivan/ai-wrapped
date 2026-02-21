export type SessionSource = "claude" | "codex" | "gemini" | "opencode" | "droid" | "copilot";

export const SESSION_SOURCES: SessionSource[] = ["claude", "codex", "gemini", "opencode", "droid", "copilot"];

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
}

export type { Session, SessionEvent, SessionEventKind, SessionFilters, SessionSortBy, SessionSortDir } from "./session-types";

export const EMPTY_TOKEN_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
};

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
  byAgent: Record<
    SessionSource,
    {
      sessions: number;
      events: number;
      tokens: TokenUsage;
      costUsd: number;
    }
  >;
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

export interface TrayStats {
  todayTokens: number;
  todayCost: number;
  todaySessions: number;
  todayEvents: number;
  activeSessions: number;
}
