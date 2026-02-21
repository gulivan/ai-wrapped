import { describe, expect, test } from "bun:test";
import type { SharePayload } from "./shareData";
import {
  decodeShareData,
  decodeShareSummaryData,
  encodeShareData,
  encodeShareSummaryData,
  toShareSummaryPayload,
  type ShareSummaryPayload,
} from "./shareData";

const payloadFixture: SharePayload = {
  v: 1,
  range: "last365",
  dateFrom: "2025-01-01",
  dateTo: "2025-12-31",
  totalSessions: 10,
  totalCostUsd: 12.34,
  totalTokens: 56789,
  totalToolCalls: 4321,
  totalDurationMs: 3600000,
  averageSessionDurationMs: 360000,
  longestSessionEstimateMs: 720000,
  currentStreakDays: 4,
  currentStreakStartDate: "2025-12-28",
  activeDays: 25,
  dateSpanDays: 365,
  modelBreakdown: [{ model: "gpt-4.1", tokens: 2000, sessions: 2, costUsd: 1.23 }],
  agentBreakdown: [{ source: "codex", label: "Codex", tokens: 2000, sessions: 2, costUsd: 1.23 }],
  timeline: [
    {
      date: "2025-12-31",
      tokens: 2000,
      sessions: 2,
      costUsd: 1.23,
      durationMs: 120000,
      messages: 100,
      toolCalls: 10,
    },
  ],
  dailyAgentTokensByDate: {
    "2025-12-31": { claude: 0, codex: 2000, gemini: 0, opencode: 0, droid: 0, copilot: 0 },
  },
  dailyAgentCostsByDate: {
    "2025-12-31": { claude: 0, codex: 1.23, gemini: 0, opencode: 0, droid: 0, copilot: 0 },
  },
  dailyModelCostsByDate: {
    "2025-12-31": { "gpt-4.1": 1.23 },
  },
  dailyAverageCostUsd: 0.12,
  mostExpensiveDay: {
    date: "2025-12-31",
    tokens: 2000,
    sessions: 2,
    costUsd: 1.23,
    durationMs: 120000,
    messages: 100,
    toolCalls: 10,
  },
  topRepos: [{ repo: "acme/repo", sessions: 2, tokens: 2000, costUsd: 1.23, durationMs: 120000 }],
  hourlyBreakdown: [
    {
      hour: 9,
      label: "9am",
      sessions: 2,
      tokens: 2000,
      costUsd: 1.23,
      durationMs: 120000,
      byAgent: [{ source: "codex", label: "Codex", sessions: 2, tokens: 2000, costUsd: 1.23 }],
    },
  ],
  weekendSessionPercent: 20,
  busiestDayOfWeek: "Tuesday",
  busiestSingleDay: { date: "2025-12-31", tokens: 2000 },
};

const summaryFixture: ShareSummaryPayload = {
  v: 1,
  range: "last365",
  dateFrom: "2025-01-01",
  dateTo: "2025-12-31",
  totalSessions: 10,
  totalCostUsd: 12.34,
  totalTokens: 56789,
  totalToolCalls: 4321,
  activeDays: 25,
  dateSpanDays: 365,
  longestStreakDays: 1,
  topAgents: [{ source: "codex", label: "Codex", percentage: 100, tokens: 56789 }],
};

describe("share data codec", () => {
  test("round-trips payload through encode/decode", () => {
    const encoded = encodeShareData(payloadFixture);
    const decoded = decodeShareData(encoded);

    expect(decoded).toEqual(payloadFixture);
  });

  test("accepts hashes with leading '#'", () => {
    const encoded = encodeShareData(payloadFixture);
    expect(decodeShareData(`#${encoded}`)).toEqual(payloadFixture);
  });

  test("returns null for invalid data", () => {
    expect(decodeShareData("not-valid")).toBeNull();
  });

  test("returns null for unsupported payload versions", () => {
    const encoded = encodeShareData(payloadFixture);
    const decoded = decodeShareData(encoded);
    expect(decoded).not.toBeNull();

    const wrongVersion = {
      ...decoded,
      v: 999,
    };

    const wrongVersionEncoded = encodeShareData(wrongVersion as unknown as SharePayload);
    expect(decodeShareData(wrongVersionEncoded)).toBeNull();
  });

  test("returns null for malformed payload shapes", () => {
    const malformedEncoded = encodeShareData({ v: 1 } as unknown as SharePayload);
    expect(decodeShareData(malformedEncoded)).toBeNull();
  });

  test("round-trips summary payload through encode/decode", () => {
    const encoded = encodeShareSummaryData(summaryFixture);
    const decoded = decodeShareSummaryData(encoded);

    expect(decoded).toEqual(summaryFixture);
  });

  test("derives summary payload from full payload", () => {
    const summary = toShareSummaryPayload(payloadFixture);
    expect(summary.v).toBe(1);
    expect(summary.totalSessions).toBe(payloadFixture.totalSessions);
    expect(summary.totalTokens).toBe(payloadFixture.totalTokens);
    expect(summary.topAgents.length).toBeGreaterThan(0);
    expect(summary.topAgents[0]?.label).toBe("Codex");
    expect(summary.longestStreakDays).toBe(1);
  });

  test("returns null for malformed summary payload shapes", () => {
    const malformedSummary = encodeShareSummaryData({ v: 1 } as ShareSummaryPayload);
    expect(decodeShareSummaryData(malformedSummary)).toBeNull();
  });
});
