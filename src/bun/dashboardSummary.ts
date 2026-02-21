import type { DashboardSummary } from "../shared/schema";
import type { DayStats } from "./store";

export const tokenTotalFromStats = (stats: DayStats): number =>
  stats.inputTokens +
  stats.outputTokens +
  stats.cacheReadTokens +
  stats.cacheWriteTokens +
  stats.reasoningTokens;

export const buildTopRepos = (byRepoMap: Map<string, DayStats>): DashboardSummary["topRepos"] =>
  [...byRepoMap.entries()]
    .map(([repo, stats]) => ({
      repo,
      sessions: stats.sessions,
      tokens: tokenTotalFromStats(stats),
      costUsd: stats.costUsd,
      durationMs: stats.durationMs,
    }))
    .filter((entry) => entry.sessions > 0)
    .sort((left, right) => {
      if (right.sessions !== left.sessions) return right.sessions - left.sessions;
      if (right.costUsd !== left.costUsd) return right.costUsd - left.costUsd;
      return left.repo.localeCompare(right.repo);
    })
    .slice(0, 24);
