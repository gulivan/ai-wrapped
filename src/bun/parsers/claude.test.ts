import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeSession } from "../normalizer";
import { claudeParser } from "./claude";

describe("claudeParser cost handling", () => {
  test("uses record costUSD once even when tool sub-events are emitted", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "ai-stats-claude-"));

    try {
      const filePath = join(fixtureDir, "session.jsonl");
      const content = JSON.stringify({
        sessionId: "claude-session-1",
        type: "assistant",
        timestamp: "2026-02-21T10:00:00.000Z",
        costUSD: 0.1234,
        message: {
          id: "msg-1",
          role: "assistant",
          model: "claude-sonnet-4-20250514",
          usage: {
            input_tokens: 100,
            output_tokens: 50,
          },
          content: [
            { type: "text", text: "I'll run a command." },
            { type: "tool_use", id: "tool-1", name: "bash", input: { command: "ls -la" } },
          ],
        },
      });

      writeFileSync(filePath, content, "utf8");
      const fileStat = statSync(filePath);

      const parsed = await claudeParser.parse({
        path: filePath,
        source: "claude",
        mtime: fileStat.mtimeMs,
        size: fileStat.size,
      });

      expect(parsed).not.toBeNull();
      if (!parsed) return;

      const normalized = normalizeSession(parsed);
      const assistantEvent = normalized.events.find((event) => event.kind === "assistant");
      const toolCallEvent = normalized.events.find((event) => event.kind === "tool_call");

      expect(assistantEvent?.costUsd).toBeCloseTo(0.1234, 10);
      expect(toolCallEvent?.costUsd).toBeNull();
      expect(normalized.session.totalCostUsd ?? 0).toBeCloseTo(0.1234, 10);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
