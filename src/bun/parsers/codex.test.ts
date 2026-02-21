import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeSession } from "../normalizer";
import { codexParser } from "./codex";

describe("codexParser", () => {
  test("generates unique event IDs when tool call and output share call_id", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "ai-stats-codex-"));

    try {
      const filePath = join(fixtureDir, "rollout-2026-02-03T11-38-55-test-session.jsonl");
      const content = [
        JSON.stringify({
          type: "session_meta",
          timestamp: "2026-02-03T11:38:55Z",
          payload: {
            id: "session-1",
            cwd: "/tmp/project",
            model_provider: "gpt-5",
          },
        }),
        JSON.stringify({
          type: "response_item",
          timestamp: "2026-02-03T11:39:00Z",
          payload: {
            type: "function_call",
            call_id: "call_shared",
            name: "search_docs",
            arguments: { q: "duplicate ids" },
          },
        }),
        JSON.stringify({
          type: "response_item",
          timestamp: "2026-02-03T11:39:01Z",
          payload: {
            type: "function_call_output",
            call_id: "call_shared",
            output: "ok",
          },
        }),
      ].join("\n");

      writeFileSync(filePath, content, "utf8");
      const fileStat = statSync(filePath);

      const parsed = await codexParser.parse({
        path: filePath,
        source: "codex",
        mtime: fileStat.mtimeMs,
        size: fileStat.size,
      });

      expect(parsed).not.toBeNull();
      if (!parsed) return;

      const ids = parsed.events.map((event) => event.id);
      expect(new Set(ids).size).toBe(ids.length);

      const toolCall = parsed.events.find((event) => event.kind === "tool_call");
      const toolResult = parsed.events.find((event) => event.kind === "tool_result");

      expect(toolCall).toBeDefined();
      expect(toolResult).toBeDefined();
      expect(toolCall?.messageId).toBe("call_shared");
      expect(toolResult?.messageId).toBe("call_shared");
      expect(toolCall?.id).not.toBe(toolResult?.id);
      expect(toolResult?.parentId).toBe("call_shared");
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test("counts token_count events once and ignores duplicate cumulative snapshots", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "ai-stats-codex-"));

    try {
      const filePath = join(fixtureDir, "rollout-2026-02-03T11-38-55-token-count.jsonl");
      const content = [
        JSON.stringify({
          type: "session_meta",
          timestamp: "2026-02-03T11:38:55Z",
          payload: {
            id: "session-token-count",
            cwd: "/tmp/project",
            model_provider: "openai",
          },
        }),
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
              last_token_usage: {
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
              last_token_usage: {
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
              last_token_usage: {
                input_tokens: 70,
                cached_input_tokens: 30,
                output_tokens: 15,
                reasoning_output_tokens: 5,
              },
            },
          },
        }),
      ].join("\n");

      writeFileSync(filePath, content, "utf8");
      const fileStat = statSync(filePath);

      const parsed = await codexParser.parse({
        path: filePath,
        source: "codex",
        mtime: fileStat.mtimeMs,
        size: fileStat.size,
      });

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
});
