import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeSession } from "../normalizer";
import { parseGeneric } from "./generic";

describe("parseGeneric token extraction", () => {
  test("parses top-level usage objects (droid completion style)", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "ai-stats-generic-"));

    try {
      const filePath = join(fixtureDir, "stream.jsonl");
      const content = JSON.stringify({
        type: "completion",
        sessionId: "sid-top-level-usage",
        timestamp: 1767812644000,
        finalText: "Done",
        usage: { input_tokens: 10, output_tokens: 4 },
      });

      writeFileSync(filePath, content, "utf8");
      const fileStat = statSync(filePath);

      const parsed = await parseGeneric(
        {
          path: filePath,
          source: "droid",
          mtime: fileStat.mtimeMs,
          size: fileStat.size,
        },
        "droid",
      );

      expect(parsed).not.toBeNull();
      if (!parsed) return;

      expect(parsed.events[0]?.tokens).toEqual({
        inputTokens: 10,
        outputTokens: 4,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0,
      });
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test("parses payload.info.last_token_usage shapes", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "ai-stats-generic-"));

    try {
      const filePath = join(fixtureDir, "token-count.jsonl");
      const content = JSON.stringify({
        type: "event_msg",
        timestamp: "2026-02-03T11:39:00Z",
        payload: {
          type: "token_count",
          info: {
            last_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 30,
              output_tokens: 15,
              reasoning_output_tokens: 5,
            },
          },
        },
      });

      writeFileSync(filePath, content, "utf8");
      const fileStat = statSync(filePath);

      const parsed = await parseGeneric(
        {
          path: filePath,
          source: "codex",
          mtime: fileStat.mtimeMs,
          size: fileStat.size,
        },
        "codex",
      );

      expect(parsed).not.toBeNull();
      if (!parsed) return;

      expect(parsed.events[0]?.tokens).toEqual({
        inputTokens: 70,
        outputTokens: 10,
        cacheReadTokens: 30,
        cacheWriteTokens: 0,
        reasoningTokens: 5,
      });
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test("derives token deltas from cumulative total_token_usage snapshots", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "ai-stats-generic-"));

    try {
      const filePath = join(fixtureDir, "token-count-total.jsonl");
      const content = [
        JSON.stringify({
          type: "event_msg",
          timestamp: "2026-02-03T11:39:00Z",
          payload: {
            type: "token_count",
            info: {
              total_token_usage: {
                input_tokens: 100,
                cached_input_tokens: 50,
                output_tokens: 20,
                reasoning_output_tokens: 10,
              },
            },
          },
        }),
        JSON.stringify({
          type: "event_msg",
          timestamp: "2026-02-03T11:39:01Z",
          payload: {
            type: "token_count",
            info: {
              total_token_usage: {
                input_tokens: 100,
                cached_input_tokens: 50,
                output_tokens: 20,
                reasoning_output_tokens: 10,
              },
            },
          },
        }),
        JSON.stringify({
          type: "event_msg",
          timestamp: "2026-02-03T11:39:02Z",
          payload: {
            type: "token_count",
            info: {
              total_token_usage: {
                input_tokens: 170,
                cached_input_tokens: 80,
                output_tokens: 35,
                reasoning_output_tokens: 15,
              },
            },
          },
        }),
      ].join("\n");

      writeFileSync(filePath, content, "utf8");
      const fileStat = statSync(filePath);

      const parsed = await parseGeneric(
        {
          path: filePath,
          source: "codex",
          mtime: fileStat.mtimeMs,
          size: fileStat.size,
        },
        "codex",
      );

      expect(parsed).not.toBeNull();
      if (!parsed) return;

      const normalized = normalizeSession(parsed);
      expect(normalized.session.totalTokens).toEqual({
        inputTokens: 90,
        outputTokens: 20,
        cacheReadTokens: 80,
        cacheWriteTokens: 0,
        reasoningTokens: 15,
      });
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test("derives cost deltas from cumulative total_cost_usd snapshots", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "ai-stats-generic-"));

    try {
      const filePath = join(fixtureDir, "token-count-cost-total.jsonl");
      const content = [
        JSON.stringify({
          type: "event_msg",
          timestamp: "2026-02-03T11:39:00Z",
          payload: {
            type: "token_count",
            info: {
              total_cost_usd: 0.015,
              total_token_usage: {
                input_tokens: 100,
                cached_input_tokens: 50,
                output_tokens: 20,
                reasoning_output_tokens: 10,
              },
            },
          },
        }),
        JSON.stringify({
          type: "event_msg",
          timestamp: "2026-02-03T11:39:01Z",
          payload: {
            type: "token_count",
            info: {
              total_cost_usd: 0.015,
              total_token_usage: {
                input_tokens: 100,
                cached_input_tokens: 50,
                output_tokens: 20,
                reasoning_output_tokens: 10,
              },
            },
          },
        }),
        JSON.stringify({
          type: "event_msg",
          timestamp: "2026-02-03T11:39:02Z",
          payload: {
            type: "token_count",
            info: {
              total_cost_usd: 0.021,
              total_token_usage: {
                input_tokens: 170,
                cached_input_tokens: 80,
                output_tokens: 35,
                reasoning_output_tokens: 15,
              },
            },
          },
        }),
      ].join("\n");

      writeFileSync(filePath, content, "utf8");
      const fileStat = statSync(filePath);

      const parsed = await parseGeneric(
        {
          path: filePath,
          source: "codex",
          mtime: fileStat.mtimeMs,
          size: fileStat.size,
        },
        "codex",
      );

      expect(parsed).not.toBeNull();
      if (!parsed) return;

      const normalized = normalizeSession(parsed);
      const costEvents = normalized.events
        .filter((event) => event.kind === "meta")
        .map((event) => event.costUsd ?? 0);

      expect(costEvents).toHaveLength(3);
      expect(costEvents[0] ?? 0).toBeCloseTo(0.015, 10);
      expect(costEvents[1] ?? 0).toBeCloseTo(0, 10);
      expect(costEvents[2] ?? 0).toBeCloseTo(0.006, 10);
      expect(normalized.session.totalCostUsd ?? 0).toBeCloseTo(0.021, 10);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test("derives cost deltas from top-level total_cost_usd snapshots", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "ai-stats-generic-"));

    try {
      const filePath = join(fixtureDir, "token-count-cost-top-level-total.jsonl");
      const content = [
        JSON.stringify({
          type: "event_msg",
          timestamp: "2026-02-03T11:39:00Z",
          payload: {
            type: "token_count",
            total_cost_usd: 0.015,
            info: {
              total_token_usage: {
                input_tokens: 100,
                cached_input_tokens: 50,
                output_tokens: 20,
                reasoning_output_tokens: 10,
              },
            },
          },
        }),
        JSON.stringify({
          type: "event_msg",
          timestamp: "2026-02-03T11:39:01Z",
          payload: {
            type: "token_count",
            total_cost_usd: 0.015,
            info: {
              total_token_usage: {
                input_tokens: 100,
                cached_input_tokens: 50,
                output_tokens: 20,
                reasoning_output_tokens: 10,
              },
            },
          },
        }),
        JSON.stringify({
          type: "event_msg",
          timestamp: "2026-02-03T11:39:02Z",
          payload: {
            type: "token_count",
            total_cost_usd: 0.021,
            info: {
              total_token_usage: {
                input_tokens: 170,
                cached_input_tokens: 80,
                output_tokens: 35,
                reasoning_output_tokens: 15,
              },
            },
          },
        }),
      ].join("\n");

      writeFileSync(filePath, content, "utf8");
      const fileStat = statSync(filePath);

      const parsed = await parseGeneric(
        {
          path: filePath,
          source: "codex",
          mtime: fileStat.mtimeMs,
          size: fileStat.size,
        },
        "codex",
      );

      expect(parsed).not.toBeNull();
      if (!parsed) return;

      const normalized = normalizeSession(parsed);
      const costEvents = normalized.events
        .filter((event) => event.kind === "meta")
        .map((event) => event.costUsd ?? 0);

      expect(costEvents).toHaveLength(3);
      expect(costEvents[0] ?? 0).toBeCloseTo(0.015, 10);
      expect(costEvents[1] ?? 0).toBeCloseTo(0, 10);
      expect(costEvents[2] ?? 0).toBeCloseTo(0.006, 10);
      expect(normalized.session.totalCostUsd ?? 0).toBeCloseTo(0.021, 10);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
