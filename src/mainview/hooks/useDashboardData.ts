import { useCallback, useEffect, useMemo, useState } from "react";
import type { DashboardSummary, DailyAggregate, SessionSource, TokenUsage } from "@shared/schema";
import { SESSION_SOURCES } from "@shared/schema";
import { SOURCE_LABELS } from "../lib/constants";
import { rpcRequest, useRPC } from "./useRPC";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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

export interface DashboardTotals {
  totalSessions: number;
  totalTokens: number;
  totalCostUsd: number;
  totalDurationMs: number;
  averageSessionDurationMs: number;
  longestSessionEstimateMs: number;
  activeDays: number;
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
  dateSpanDays: 0,
  dailyAverageCostUsd: 0,
  mostExpensiveDay: null,
};

export const useDashboardData = () => {
  const rpc = useRPC();
  const [dateFrom] = useState<string>(daysAgoISO(364));
  const [dateTo] = useState<string>(todayISO());
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [timeline, setTimeline] = useState<DailyAggregate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [summaryResult, timelineResult] = await Promise.all([
        rpcRequest("getDashboardSummary", { dateFrom, dateTo }),
        rpcRequest("getDailyTimeline", { dateFrom, dateTo }),
      ]);

      setSummary(summaryResult);
      setTimeline(timelineResult);
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
    const activeDays = timelinePoints.filter((entry) => entry.sessions > 0).length;
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
      .sort((left, right) => right.tokens - left.tokens)
      .slice(0, 8);
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
