import type { Session } from "./session-schema";
import {
  createEmptyDayStats,
  type DailyAggregateEntry,
  type DailyStore,
  type DayStats,
} from "./store";

const addStats = (target: DayStats, source: DayStats): void => {
  target.sessions += source.sessions;
  target.messages += source.messages;
  target.toolCalls += source.toolCalls;
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.cacheReadTokens += source.cacheReadTokens;
  target.cacheWriteTokens += source.cacheWriteTokens;
  target.reasoningTokens += source.reasoningTokens;
  target.costUsd += source.costUsd;
  target.durationMs += source.durationMs;
};

const toDayKey = (session: Session): string => {
  const timestamp = session.startTime ?? session.parsedAt;
  if (typeof timestamp === "string" && timestamp.length >= 10) {
    return timestamp.slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
};

const toSessionStats = (session: Session): DayStats => ({
  sessions: 1,
  messages: session.messageCount,
  toolCalls: session.toolCallCount,
  inputTokens: session.totalTokens.inputTokens,
  outputTokens: session.totalTokens.outputTokens,
  cacheReadTokens: session.totalTokens.cacheReadTokens,
  cacheWriteTokens: session.totalTokens.cacheWriteTokens,
  reasoningTokens: session.totalTokens.reasoningTokens,
  costUsd: session.totalCostUsd ?? 0,
  durationMs: session.durationMs ?? 0,
});

const toRepoKey = (repoName: string | null): string | null => {
  if (!repoName) return null;
  const trimmed = repoName.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const ensureDateEntry = (daily: DailyStore, date: string): DailyAggregateEntry => {
  const existing = daily[date];
  if (existing) {
    return existing;
  }

  const created: DailyAggregateEntry = {
    bySource: {},
    byModel: {},
    byRepo: {},
    totals: createEmptyDayStats(),
  };
  daily[date] = created;
  return created;
};

const sortedEntries = <T>(entries: Record<string, T>): Record<string, T> => {
  const keys = Object.keys(entries).sort((a, b) => a.localeCompare(b));
  const sorted: Record<string, T> = {};
  for (const key of keys) {
    sorted[key] = entries[key] as T;
  }
  return sorted;
};

const sortDailyStore = (daily: DailyStore): DailyStore => {
  const sortedDates = Object.keys(daily).sort((a, b) => a.localeCompare(b));
  const output: DailyStore = {};

  for (const date of sortedDates) {
    const entry = daily[date] as DailyAggregateEntry;
    output[date] = {
      bySource: sortedEntries(entry.bySource),
      byModel: sortedEntries(entry.byModel),
      byRepo: sortedEntries(entry.byRepo),
      totals: { ...entry.totals },
    };
  }

  return output;
};

export const aggregateSessionsByDate = (sessions: Session[]): DailyStore => {
  const daily: DailyStore = {};

  for (const session of sessions) {
    const date = toDayKey(session);
    const entry = ensureDateEntry(daily, date);
    const modelKey = session.model && session.model.trim().length > 0 ? session.model : "unknown";
    const repoKey = toRepoKey(session.repoName);
    const stats = toSessionStats(session);

    if (!entry.bySource[session.source]) {
      entry.bySource[session.source] = createEmptyDayStats();
    }
    if (!entry.byModel[modelKey]) {
      entry.byModel[modelKey] = createEmptyDayStats();
    }
    if (repoKey && !entry.byRepo[repoKey]) {
      entry.byRepo[repoKey] = createEmptyDayStats();
    }

    addStats(entry.bySource[session.source] as DayStats, stats);
    addStats(entry.byModel[modelKey] as DayStats, stats);
    if (repoKey) {
      addStats(entry.byRepo[repoKey] as DayStats, stats);
    }
    addStats(entry.totals, stats);
  }

  return sortDailyStore(daily);
};

export const mergeDailyAggregates = (existing: DailyStore, incoming: DailyStore): DailyStore => {
  const merged: DailyStore = structuredClone(existing);

  for (const [date, entry] of Object.entries(incoming)) {
    merged[date] = structuredClone(entry);
  }

  return sortDailyStore(merged);
};
