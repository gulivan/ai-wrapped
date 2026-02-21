import { useCallback, useEffect, useMemo, useState } from "react";
import type { DashboardSummary, DailyAggregate, SessionSource, TokenUsage } from "@shared/schema";
import { SESSION_SOURCES } from "@shared/schema";
import { SOURCE_LABELS } from "../lib/constants";
import { rpcRequest, useRPC } from "./useRPC";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const MIN_SELECTABLE_YEAR = 2024;

const daysAgoISO = (daysAgo: number): string => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
};

const todayISO = (): string => new Date().toISOString().slice(0, 10);

const tokenTotal = (tokens: TokenUsage): number =>
  tokens.inputTokens +
  tokens.outputTokens +
  tokens.cacheReadTokens +
  tokens.cacheWriteTokens +
  tokens.reasoningTokens;

const rangeLengthDays = (dateFrom: string, dateTo: string): number => {
  const from = Date.parse(`${dateFrom}T00:00:00Z`);
  const to = Date.parse(`${dateTo}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
  return Math.floor((to - from) / ONE_DAY_MS) + 1;
};

const calculateCurrentStreakDays = (activeDates: Set<string>, dateFrom: string, dateTo: string): number => {
  const from = Date.parse(`${dateFrom}T00:00:00Z`);
  const to = Date.parse(`${dateTo}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;

  let streak = 0;
  for (let day = to; day >= from; day -= ONE_DAY_MS) {
    const key = new Date(day).toISOString().slice(0, 10);
    if (!activeDates.has(key)) break;
    streak += 1;
  }

  return streak;
};

const currentYear = (): number => new Date().getFullYear();

export type DashboardDateRange = "last365" | `year:${number}`;

export interface DashboardDateRangeOption {
  value: DashboardDateRange;
  label: string;
}

const parseYearSelection = (selection: DashboardDateRange): number | null => {
  if (!selection.startsWith("year:")) return null;
  const parsed = Number(selection.slice(5));
  return Number.isInteger(parsed) ? parsed : null;
};

const buildRangeOptions = (): DashboardDateRangeOption[] => {
  const thisYear = currentYear();
  const options: DashboardDateRangeOption[] = [{ value: "last365", label: "Last 365 days" }];
  for (let year = thisYear; year >= MIN_SELECTABLE_YEAR; year -= 1) {
    options.push({
      value: `year:${year}` as DashboardDateRange,
      label: year === thisYear ? `${year} (Current year)` : String(year),
    });
  }
  return options;
};

const resolveDateRange = (selection: DashboardDateRange): { dateFrom: string; dateTo: string } => {
  const today = todayISO();
  const selectedYear = parseYearSelection(selection);

  if (selectedYear === null) {
    return {
      dateFrom: daysAgoISO(364),
      dateTo: today,
    };
  }

  return {
    dateFrom: `${selectedYear}-01-01`,
    dateTo: selectedYear === currentYear() ? today : `${selectedYear}-12-31`,
  };
};

export interface TimelinePoint {
  date: string;
  sessions: number;
  tokens: number;
  costUsd: number;
  durationMs: number;
  messages: number;
  toolCalls: number;
}

export interface AgentBreakdown {
  source: SessionSource;
  label: string;
  sessions: number;
  tokens: number;
  costUsd: number;
}

export interface ModelBreakdown {
  model: string;
  sessions: number;
  tokens: number;
  costUsd: number;
}

export type DailyAgentTokensByDate = Record<string, Record<SessionSource, number>>;
export type DailyAgentCostsByDate = Record<string, Record<SessionSource, number>>;

export interface DashboardTotals {
  totalSessions: number;
  totalTokens: number;
  totalCostUsd: number;
  totalDurationMs: number;
  averageSessionDurationMs: number;
  longestSessionEstimateMs: number;
  activeDays: number;
  currentStreakDays: number;
  dateSpanDays: number;
  dailyAverageCostUsd: number;
  mostExpensiveDay: TimelinePoint | null;
}

const emptyTotals: DashboardTotals = {
  totalSessions: 0,
  totalTokens: 0,
  totalCostUsd: 0,
  totalDurationMs: 0,
  averageSessionDurationMs: 0,
  longestSessionEstimateMs: 0,
  activeDays: 0,
  currentStreakDays: 0,
  dateSpanDays: 0,
  dailyAverageCostUsd: 0,
  mostExpensiveDay: null,
};

const createEmptySourceTokenMap = (): Record<SessionSource, number> => ({
  claude: 0,
  codex: 0,
  gemini: 0,
  opencode: 0,
  droid: 0,
  copilot: 0,
});

const createEmptySourceCostMap = (): Record<SessionSource, number> => ({
  claude: 0,
  codex: 0,
  gemini: 0,
  opencode: 0,
  droid: 0,
  copilot: 0,
});

const buildDailyAgentTokensByDate = (
  rowsBySource: Array<{ source: SessionSource; rows: DailyAggregate[] }>,
): DailyAgentTokensByDate => {
  const byDate: DailyAgentTokensByDate = {};

  for (const { source, rows } of rowsBySource) {
    for (const row of rows) {
      const current = byDate[row.date] ?? createEmptySourceTokenMap();
      current[source] = tokenTotal(row.tokens);
      byDate[row.date] = current;
    }
  }

  return byDate;
};

const buildDailyAgentCostsByDate = (
  rowsBySource: Array<{ source: SessionSource; rows: DailyAggregate[] }>,
): DailyAgentCostsByDate => {
  const byDate: DailyAgentCostsByDate = {};

  for (const { source, rows } of rowsBySource) {
    for (const row of rows) {
      const current = byDate[row.date] ?? createEmptySourceCostMap();
      current[source] = row.costUsd;
      byDate[row.date] = current;
    }
  }

  return byDate;
};

export const useDashboardData = () => {
  const rpc = useRPC();
  const [selectedRange, setSelectedRange] = useState<DashboardDateRange>("last365");
  const rangeOptions = useMemo<DashboardDateRangeOption[]>(() => buildRangeOptions(), []);
  const { dateFrom, dateTo } = useMemo(() => resolveDateRange(selectedRange), [selectedRange]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [timeline, setTimeline] = useState<DailyAggregate[]>([]);
  const [dailyAgentTokensByDate, setDailyAgentTokensByDate] = useState<DailyAgentTokensByDate>({});
  const [dailyAgentCostsByDate, setDailyAgentCostsByDate] = useState<DailyAgentCostsByDate>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [summaryResult, timelineResult, ...timelineBySourceResults] = await Promise.all([
        rpcRequest("getDashboardSummary", { dateFrom, dateTo }),
        rpcRequest("getDailyTimeline", { dateFrom, dateTo }),
        ...SESSION_SOURCES.map((source) => rpcRequest("getDailyTimeline", { dateFrom, dateTo, source })),
      ]);

      setSummary(summaryResult);
      setTimeline(timelineResult);
      setDailyAgentTokensByDate(
        buildDailyAgentTokensByDate(
          timelineBySourceResults.map((rows, index) => ({
            source: SESSION_SOURCES[index],
            rows,
          })),
        ),
      );
      setDailyAgentCostsByDate(
        buildDailyAgentCostsByDate(
          timelineBySourceResults.map((rows, index) => ({
            source: SESSION_SOURCES[index],
            rows,
          })),
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const listener = () => {
      void refresh();
    };

    rpc.addMessageListener("sessionsUpdated", listener);
    rpc.addMessageListener("scanCompleted", listener);

    return () => {
      rpc.removeMessageListener("sessionsUpdated", listener);
      rpc.removeMessageListener("scanCompleted", listener);
    };
  }, [refresh, rpc]);

  const timelinePoints = useMemo<TimelinePoint[]>(
    () =>
      timeline
        .map((entry) => ({
          date: entry.date,
          sessions: entry.sessionCount,
          tokens: tokenTotal(entry.tokens),
          costUsd: entry.costUsd,
          durationMs: entry.totalDurationMs,
          messages: entry.messageCount,
          toolCalls: entry.toolCallCount,
        }))
        .sort((left, right) => left.date.localeCompare(right.date)),
    [timeline],
  );

  const totals = useMemo<DashboardTotals>(() => {
    if (!summary) return emptyTotals;

    const spanDays = rangeLengthDays(dateFrom, dateTo);
    const activeDates = new Set(
      timelinePoints.filter((entry) => entry.sessions > 0).map((entry) => entry.date),
    );
    const activeDays = activeDates.size;
    const currentStreakDays = calculateCurrentStreakDays(activeDates, dateFrom, dateTo);
    const mostExpensiveDay =
      timelinePoints.length === 0
        ? null
        : timelinePoints.reduce((max, entry) => (entry.costUsd > max.costUsd ? entry : max), timelinePoints[0]);

    return {
      totalSessions: summary.totals.sessions,
      totalTokens: tokenTotal(summary.totals.tokens),
      totalCostUsd: summary.totals.costUsd,
      totalDurationMs: summary.totals.durationMs,
      averageSessionDurationMs:
        summary.totals.sessions > 0 ? summary.totals.durationMs / summary.totals.sessions : 0,
      longestSessionEstimateMs: timelinePoints.reduce((max, entry) => {
        if (entry.sessions <= 0) return max;
        return Math.max(max, entry.durationMs / entry.sessions);
      }, 0),
      activeDays,
      currentStreakDays,
      dateSpanDays: spanDays,
      dailyAverageCostUsd: spanDays > 0 ? summary.totals.costUsd / spanDays : 0,
      mostExpensiveDay,
    };
  }, [dateFrom, dateTo, summary, timelinePoints]);

  const agentBreakdown = useMemo<AgentBreakdown[]>(() => {
    if (!summary) return [];

    return SESSION_SOURCES.map((source) => ({
      source,
      label: SOURCE_LABELS[source],
      sessions: summary.byAgent[source].sessions,
      tokens: tokenTotal(summary.byAgent[source].tokens),
      costUsd: summary.byAgent[source].costUsd,
    })).filter((entry) => entry.sessions > 0 || entry.tokens > 0 || entry.costUsd > 0);
  }, [summary]);

  const modelBreakdown = useMemo<ModelBreakdown[]>(() => {
    if (!summary) return [];

    return summary.byModel
      .map((entry) => ({
        model: entry.model,
        sessions: entry.sessions,
        tokens: tokenTotal(entry.tokens),
        costUsd: entry.costUsd,
      }))
      .filter((entry) => entry.sessions > 0 || entry.tokens > 0 || entry.costUsd > 0)
      .sort((left, right) => {
        if (right.tokens !== left.tokens) return right.tokens - left.tokens;
        if (right.sessions !== left.sessions) return right.sessions - left.sessions;
        return right.costUsd - left.costUsd;
      });
  }, [summary]);

  const topRepos = useMemo(
    () =>
      (summary?.topRepos ?? [])
        .map((entry) => ({
          repo: entry.repo,
          sessions: entry.sessions,
          costUsd: entry.costUsd,
        }))
        .slice(0, 8),
    [summary],
  );

  return {
    dateFrom,
    dateTo,
    selectedRange,
    setSelectedRange,
    rangeOptions,
    dailyAgentTokensByDate,
    dailyAgentCostsByDate,
    summary,
    timeline: timelinePoints,
    loading,
    error,
    refresh,
    totals,
    agentBreakdown,
    modelBreakdown,
    topRepos,
  };
};
