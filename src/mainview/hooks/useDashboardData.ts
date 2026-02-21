import { useCallback, useEffect, useMemo, useState } from "react";
import type { DashboardSummary, DailyAggregate, SessionSource, TokenUsage } from "@shared/schema";
import { SESSION_SOURCES } from "@shared/schema";
import { SOURCE_LABELS } from "../lib/constants";
import { rpcRequest, useRPC } from "./useRPC";

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

type SourceTimelines = Partial<Record<SessionSource, DailyAggregate[]>>;

export const useDashboardData = (selectedSources: SessionSource[]) => {
  const rpc = useRPC();
  const [dateFrom, setDateFrom] = useState<string>(daysAgoISO(29));
  const [dateTo, setDateTo] = useState<string>(todayISO());
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [timeline, setTimeline] = useState<DailyAggregate[]>([]);
  const [sourceTimelines, setSourceTimelines] = useState<SourceTimelines>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const sourceCalls = selectedSources.map(async (source) => {
        const rows = await rpcRequest("getDailyTimeline", { dateFrom, dateTo, source });
        return { source, rows };
      });

      const [summaryResult, timelineResult, ...sourceResults] = await Promise.all([
        rpcRequest("getDashboardSummary", { dateFrom, dateTo }),
        rpcRequest("getDailyTimeline", { dateFrom, dateTo }),
        ...sourceCalls,
      ]);

      const nextSourceTimelines: SourceTimelines = {};
      for (const { source, rows } of sourceResults) {
        nextSourceTimelines[source] = rows;
      }

      setSummary(summaryResult);
      setTimeline(timelineResult);
      setSourceTimelines(nextSourceTimelines);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, selectedSources]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const listener = () => {
      void refresh();
    };

    rpc.addMessageListener("sessionsUpdated", listener);
    return () => {
      rpc.removeMessageListener("sessionsUpdated", listener);
    };
  }, [refresh, rpc]);

  const costByAgent = useMemo(() => {
    if (!summary) return [];

    return SESSION_SOURCES.filter((source) => selectedSources.includes(source)).map((source) => ({
      source,
      label: SOURCE_LABELS[source],
      costUsd: summary.byAgent[source].costUsd,
    }));
  }, [selectedSources, summary]);

  const costByModel = useMemo(() => {
    if (!summary) return [];
    return summary.byModel
      .filter((item) => item.sessions > 0 || item.costUsd > 0)
      .slice(0, 8)
      .map((item) => ({
        model: item.model,
        costUsd: item.costUsd,
      }));
  }, [summary]);

  const tokenUsageOverTime = useMemo(() => {
    const dateMap = new Map<string, { date: string } & Record<SessionSource, number>>();

    for (const entry of timeline) {
      dateMap.set(entry.date, {
        date: entry.date,
        claude: 0,
        codex: 0,
        gemini: 0,
        opencode: 0,
        droid: 0,
        copilot: 0,
      });
    }

    for (const source of selectedSources) {
      const sourceRows = sourceTimelines[source] ?? [];
      for (const row of sourceRows) {
        const existing = dateMap.get(row.date) ?? {
          date: row.date,
          claude: 0,
          codex: 0,
          gemini: 0,
          opencode: 0,
          droid: 0,
          copilot: 0,
        };
        existing[source] = tokenTotal(row.tokens);
        dateMap.set(row.date, existing);
      }
    }

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [selectedSources, sourceTimelines, timeline]);

  return {
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    summary,
    timeline,
    loading,
    error,
    refresh,
    cards: {
      totalTokens: summary ? tokenTotal(summary.totals.tokens) : 0,
      totalCostUsd: summary?.totals.costUsd ?? 0,
      totalSessions: summary?.totals.sessions ?? 0,
      totalToolCalls: summary?.totals.toolCalls ?? 0,
    },
    chartData: {
      tokenUsageOverTime,
      costByAgent,
      costByModel,
      sessionsPerDay: timeline.map((entry) => ({
        date: entry.date,
        sessions: entry.sessionCount,
      })),
      topTools: (summary?.topTools ?? []).map((item) => ({
        tool: item.tool,
        calls: item.count,
      })),
      topReposByCost: (summary?.topRepos ?? []).map((item) => ({
        repo: item.repo,
        costUsd: item.costUsd,
      })),
    },
  };
};
