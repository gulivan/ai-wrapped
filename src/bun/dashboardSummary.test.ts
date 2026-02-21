import { describe, expect, test } from "bun:test";
import { buildTopRepos, tokenTotalFromStats } from "./dashboardSummary";
import { createEmptyDayStats, type DayStats } from "./store";

const makeStats = (overrides: Partial<DayStats>): DayStats => ({
  ...createEmptyDayStats(),
  ...overrides,
});

describe("dashboardSummary", () => {
  test("tokenTotalFromStats sums all token buckets", () => {
    const total = tokenTotalFromStats(
      makeStats({
        inputTokens: 100,
        outputTokens: 40,
        cacheReadTokens: 5,
        cacheWriteTokens: 3,
        reasoningTokens: 2,
      }),
    );

    expect(total).toBe(150);
  });

  test("buildTopRepos includes tokens and duration with stable ordering", () => {
    const byRepo = new Map<string, DayStats>([
      [
        "beta",
        makeStats({
          sessions: 2,
          inputTokens: 15,
          outputTokens: 5,
          costUsd: 0.25,
          durationMs: 120_000,
        }),
      ],
      [
        "alpha",
        makeStats({
          sessions: 2,
          inputTokens: 10,
          outputTokens: 20,
          cacheReadTokens: 3,
          reasoningTokens: 2,
          costUsd: 0.5,
          durationMs: 90_000,
        }),
      ],
      [
        "zero",
        makeStats({
          sessions: 0,
          inputTokens: 999,
          durationMs: 999,
        }),
      ],
    ]);

    const topRepos = buildTopRepos(byRepo);
    expect(topRepos).toHaveLength(2);
    expect(topRepos[0]).toEqual({
      repo: "alpha",
      sessions: 2,
      tokens: 35,
      costUsd: 0.5,
      durationMs: 90_000,
    });
    expect(topRepos[1]).toEqual({
      repo: "beta",
      sessions: 2,
      tokens: 20,
      costUsd: 0.25,
      durationMs: 120_000,
    });
  });
});
