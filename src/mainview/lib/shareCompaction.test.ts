import { describe, expect, test } from "bun:test";
import { decodeShareData, encodeShareData, type SharePayload } from "@shared/shareData";
import { compactSharePayloadForTargetLength } from "./shareCompaction";

const buildPayload = (days: number): SharePayload => {
  const timeline = Array.from({ length: days }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return {
      date: `2025-01-${day}`,
      sessions: 1 + (index % 3),
      tokens: 1200 + index * 10,
      costUsd: 0.5 + index * 0.02,
      durationMs: 60000 + index * 250,
      messages: 12 + index,
      toolCalls: 3 + (index % 4),
    };
  });

  const dailyAgentTokensByDate = Object.fromEntries(
    timeline.map((entry) => [
      entry.date,
      { claude: 0, codex: entry.tokens, gemini: 0, opencode: 0, droid: 0, copilot: 0 },
    ]),
  );

  const dailyAgentCostsByDate = Object.fromEntries(
    timeline.map((entry) => [
      entry.date,
      { claude: 0, codex: entry.costUsd, gemini: 0, opencode: 0, droid: 0, copilot: 0 },
    ]),
  );

  const dailyModelCostsByDate = Object.fromEntries(
    timeline.map((entry) => [
      entry.date,
      { "gpt-5": entry.costUsd * 0.8, "claude-3.7": entry.costUsd * 0.2 },
    ]),
  );

  return {
    v: 1,
    range: "last365",
    dateFrom: timeline[0]?.date ?? "2025-01-01",
    dateTo: timeline[timeline.length - 1]?.date ?? "2025-01-01",
    totalSessions: timeline.reduce((sum, row) => sum + row.sessions, 0),
    totalCostUsd: timeline.reduce((sum, row) => sum + row.costUsd, 0),
    totalTokens: timeline.reduce((sum, row) => sum + row.tokens, 0),
    totalToolCalls: timeline.reduce((sum, row) => sum + row.toolCalls, 0),
    totalDurationMs: timeline.reduce((sum, row) => sum + row.durationMs, 0),
    averageSessionDurationMs:
      timeline.length === 0
        ? 0
        : timeline.reduce((sum, row) => sum + row.durationMs, 0) /
          Math.max(1, timeline.reduce((sum, row) => sum + row.sessions, 0)),
    longestSessionEstimateMs: 720000,
    currentStreakDays: Math.min(days, 9),
    currentStreakStartDate: timeline[Math.max(0, timeline.length - 9)]?.date ?? null,
    activeDays: days,
    dateSpanDays: days,
    modelBreakdown: Array.from({ length: 12 }, (_, index) => ({
      model: `model-${index + 1}`,
      tokens: 5000 - index * 130,
      sessions: 40 - index,
      costUsd: 22 - index * 0.75,
    })),
    agentBreakdown: [
      { source: "codex", label: "Codex", tokens: 40000, sessions: 180, costUsd: 120 },
      { source: "claude", label: "Claude Code", tokens: 18000, sessions: 80, costUsd: 48 },
    ],
    timeline,
    dailyAgentTokensByDate,
    dailyAgentCostsByDate,
    dailyModelCostsByDate,
    dailyAverageCostUsd: days === 0 ? 0 : timeline.reduce((sum, row) => sum + row.costUsd, 0) / days,
    mostExpensiveDay: timeline[timeline.length - 1] ?? null,
    topRepos: Array.from({ length: 8 }, (_, index) => ({
      repo: `org/repo-${index + 1}`,
      sessions: 20 - index,
      tokens: 10000 - index * 430,
      costUsd: 12 - index * 0.9,
      durationMs: 200000 - index * 3200,
    })),
    hourlyBreakdown: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: `${hour}h`,
      sessions: 3 + (hour % 4),
      tokens: 800 + hour * 40,
      costUsd: 0.7 + hour * 0.04,
      durationMs: 50000 + hour * 700,
      byAgent: [
        { source: "codex", label: "Codex", sessions: 2 + (hour % 3), tokens: 500 + hour * 20, costUsd: 0.35 },
        { source: "claude", label: "Claude Code", sessions: 1, tokens: 200 + hour * 10, costUsd: 0.15 },
      ],
    })),
    weekendSessionPercent: 30,
    busiestDayOfWeek: "Tuesday",
    busiestSingleDay: timeline[timeline.length - 1]
      ? { date: timeline[timeline.length - 1].date, tokens: timeline[timeline.length - 1].tokens }
      : null,
  };
};

describe("share compaction", () => {
  test("does not compact when payload already meets target length", () => {
    const payload = buildPayload(5);
    const originalEncoded = encodeShareData(payload);
    const { encoded, appliedSteps } = compactSharePayloadForTargetLength(payload, originalEncoded.length + 25);

    expect(encoded).toBe(originalEncoded);
    expect(appliedSteps).toEqual([]);
  });

  test("drops daily cost maps during aggressive compaction", () => {
    const payload = buildPayload(28);
    const { encoded, appliedSteps } = compactSharePayloadForTargetLength(payload, 2000);
    const decoded = decodeShareData(encoded);

    expect(decoded).not.toBeNull();
    expect(appliedSteps).toContain("drop-daily-agent-costs");
    expect(appliedSteps).toContain("drop-daily-model-costs");
    expect(encoded.length).toBeLessThan(encodeShareData(payload).length);
  });

  test("strips timeline detail without rewriting dates", () => {
    const payload = buildPayload(20);
    payload.dailyAgentTokensByDate = {};
    payload.dailyAgentCostsByDate = {};
    payload.dailyModelCostsByDate = {};
    payload.hourlyBreakdown = [];
    payload.topRepos = [];
    payload.modelBreakdown = payload.modelBreakdown.slice(0, 1);
    payload.agentBreakdown = payload.agentBreakdown.slice(0, 1);

    const originalEncoded = encodeShareData(payload);
    const { encoded, appliedSteps } = compactSharePayloadForTargetLength(payload, originalEncoded.length - 10);
    const decoded = decodeShareData(encoded);

    expect(decoded).not.toBeNull();
    expect(appliedSteps).toContain("strip-timeline-detail");

    if (!decoded) return;

    const originalDates = new Set(payload.timeline.map((entry) => entry.date));
    expect(decoded.timeline).toHaveLength(payload.timeline.length);
    for (const row of decoded.timeline) {
      expect(originalDates.has(row.date)).toBe(true);
      expect(row.durationMs).toBe(0);
      expect(row.messages).toBe(0);
      expect(row.toolCalls).toBe(0);
    }
  });
});
