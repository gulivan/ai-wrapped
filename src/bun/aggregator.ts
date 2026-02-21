import type { Session } from "./session-schema";
import {
  createEmptyDayStats,
  type DailyAggregateEntry,
  type DailyStore,
  type DayStats,
} from "./store";

const DEFAULT_TIME_ZONE = "UTC";

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

const parseSessionTimestamp = (session: Session): Date | null => {
  const timestamp = session.startTime ?? session.parsedAt;
  if (typeof timestamp !== "string" || timestamp.length < 10) {
    return null;
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const resolveFormatterTimeZone = (timeZone?: string): string => {
  const candidate =
    typeof timeZone === "string" && timeZone.trim().length > 0
      ? timeZone.trim()
      : Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!candidate) {
    return DEFAULT_TIME_ZONE;
  }

  try {
    // Validate the zone before use. Falls back to UTC for invalid identifiers.
    void new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
};

const formatDateKey = (date: Date, formatter: Intl.DateTimeFormat): string => {
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return date.toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
};

const formatHourKey = (date: Date, formatter: Intl.DateTimeFormat): string | null => {
  const hourValue = formatter.formatToParts(date).find((part) => part.type === "hour")?.value;
  if (!hourValue) return null;

  const hourNum = Number(hourValue);
  if (!Number.isFinite(hourNum)) return null;

  return String(hourNum).padStart(2, "0");
};

const toDayKey = (session: Session, dateFormatter: Intl.DateTimeFormat): string => {
  const parsed = parseSessionTimestamp(session);
  if (parsed) {
    return formatDateKey(parsed, dateFormatter);
  }

  const fallback = session.startTime ?? session.parsedAt;
  if (typeof fallback === "string" && fallback.length >= 10) {
    return fallback.slice(0, 10);
  }

  return formatDateKey(new Date(), dateFormatter);
};

const toHourKey = (session: Session, hourFormatter: Intl.DateTimeFormat): string | null => {
  const parsed = parseSessionTimestamp(session);
  if (!parsed) return null;

  return formatHourKey(parsed, hourFormatter);
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
    byHour: {},
    byHourSource: {},
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
    const sortedByHourSource: Record<string, Record<string, DayStats>> = {};
    for (const [hour, sources] of Object.entries(sortedEntries(entry.byHourSource))) {
      sortedByHourSource[hour] = sortedEntries(sources);
    }

    output[date] = {
      bySource: sortedEntries(entry.bySource),
      byModel: sortedEntries(entry.byModel),
      byRepo: sortedEntries(entry.byRepo),
      byHour: sortedEntries(entry.byHour),
      byHourSource: sortedByHourSource,
      totals: { ...entry.totals },
    };
  }

  return output;
};

export interface AggregateSessionsOptions {
  timeZone?: string;
}

export const resolveAggregationTimeZone = (timeZone?: string): string =>
  resolveFormatterTimeZone(timeZone);

export const aggregateSessionsByDate = (
  sessions: Session[],
  options: AggregateSessionsOptions = {},
): DailyStore => {
  const timeZone = resolveFormatterTimeZone(options.timeZone);
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const hourFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  });

  const daily: DailyStore = {};

  for (const session of sessions) {
    const date = toDayKey(session, dateFormatter);
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

    const hourKey = toHourKey(session, hourFormatter);
    if (hourKey !== null) {
      if (!entry.byHour[hourKey]) {
        entry.byHour[hourKey] = createEmptyDayStats();
      }
      if (!entry.byHourSource[hourKey]) {
        entry.byHourSource[hourKey] = {};
      }
      if (!entry.byHourSource[hourKey][session.source]) {
        entry.byHourSource[hourKey][session.source] = createEmptyDayStats();
      }
    }

    addStats(entry.bySource[session.source] as DayStats, stats);
    addStats(entry.byModel[modelKey] as DayStats, stats);
    if (repoKey) {
      addStats(entry.byRepo[repoKey] as DayStats, stats);
    }
    if (hourKey !== null) {
      addStats(entry.byHour[hourKey] as DayStats, stats);
      addStats(entry.byHourSource[hourKey][session.source] as DayStats, stats);
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
