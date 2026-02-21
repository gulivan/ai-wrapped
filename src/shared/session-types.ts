import type { SessionSource, TokenUsage } from "./schema";

export type SessionEventKind = "user" | "assistant" | "tool_call" | "tool_result" | "error" | "meta";

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

export type SessionSortBy = "date" | "cost" | "tokens" | "duration";
export type SessionSortDir = "asc" | "desc";

export interface SessionFilters {
  query: string;
  sources: SessionSource[];
  models: string[];
  dateFrom: string | null;
  dateTo: string | null;
  repoName: string | null;
  minCost: number | null;
  sortBy: SessionSortBy;
  sortDir: SessionSortDir;
  offset: number;
  limit: number;
}
