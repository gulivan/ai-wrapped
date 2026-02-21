import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Session } from "@shared/schema";
import SessionListItem from "./SessionListItem";

describe("SessionListItem", () => {
  test("shows token count and cost", () => {
    const session: Session = {
      id: "session-1",
      source: "codex",
      filePath: "/tmp/s1.jsonl",
      fileSizeBytes: 1200,
      startTime: "2026-02-20T10:00:00.000Z",
      endTime: "2026-02-20T10:10:00.000Z",
      durationMs: 600000,
      title: "Session title",
      model: "gpt-5",
      cwd: "/tmp",
      repoName: "ai-stats",
      gitBranch: "main",
      cliVersion: "1.0.0",
      eventCount: 20,
      messageCount: 10,
      totalTokens: {
        inputTokens: 1000,
        outputTokens: 500,
        cacheReadTokens: 100,
        cacheWriteTokens: 50,
        reasoningTokens: 25,
      },
      totalCostUsd: 0.25,
      toolCallCount: 3,
      isHousekeeping: false,
      parsedAt: "2026-02-20T10:10:01.000Z",
    };

    const html = renderToStaticMarkup(
      createElement(SessionListItem, {
        session,
        onOpen: () => {},
      }),
    );

    expect(html).toContain("1.7K tokens");
    expect(html).toContain("$0.25 cost");
  });
});
