import { describe, expect, test } from "bun:test";
import { EMPTY_TOKEN_USAGE } from "../shared/schema";
import { aggregateSessionsByDate } from "./aggregator";
import type { Session } from "./session-schema";

const makeSession = (overrides: Partial<Session>): Session => ({
  id: "session-1",
  source: "codex",
  filePath: "/tmp/session-1.jsonl",
  fileSizeBytes: 100,
  startTime: "2026-02-21T10:00:00.000Z",
  endTime: "2026-02-21T10:01:00.000Z",
  durationMs: 60_000,
  title: "Test session",
  model: "gpt-5",
  cwd: "/tmp/ai-stats",
  repoName: "ai-stats",
  gitBranch: "main",
  cliVersion: "1.0.0",
  eventCount: 4,
  messageCount: 2,
  totalTokens: { ...EMPTY_TOKEN_USAGE },
  totalCostUsd: 0.5,
  toolCallCount: 1,
  isHousekeeping: false,
  parsedAt: "2026-02-21T10:02:00.000Z",
  ...overrides,
});

describe("aggregateSessionsByDate", () => {
  test("tracks per-repository totals in byRepo", () => {
    const daily = aggregateSessionsByDate([
      makeSession({ id: "s1", totalCostUsd: 1.25 }),
      makeSession({ id: "s2", totalCostUsd: 0.75 }),
      makeSession({ id: "s3", repoName: "other-repo", totalCostUsd: 2.0 }),
      makeSession({ id: "s4", repoName: null, totalCostUsd: 3.0 }),
    ]);

    const entry = daily["2026-02-21"];
    expect(entry).toBeDefined();
    expect(Object.keys(entry?.byRepo ?? {})).toEqual(["ai-stats", "other-repo"]);

    expect(entry?.byRepo["ai-stats"]?.sessions).toBe(2);
    expect(entry?.byRepo["ai-stats"]?.costUsd).toBe(2);
    expect(entry?.byRepo["other-repo"]?.sessions).toBe(1);
    expect(entry?.byRepo["other-repo"]?.costUsd).toBe(2);
    expect(entry?.totals.sessions).toBe(4);
  });
});
