import { describe, expect, test } from "bun:test";
import type { SessionEvent } from "./session-schema";
import { normalizeSession, normalizeTokenUsage } from "./normalizer";
import type { RawParsedSession } from "./parsers/types";

const makeEvent = (overrides: Partial<SessionEvent>): SessionEvent => ({
  id: "event-1",
  sessionId: "placeholder",
  kind: "assistant",
  timestamp: "2026-02-21T10:00:00.000Z",
  role: "assistant",
  text: "hello",
  toolName: null,
  toolInput: null,
  toolOutput: null,
  model: "gpt-5",
  parentId: null,
  messageId: null,
  isDelta: false,
  tokens: null,
  costUsd: null,
  ...overrides,
});

const makeRawSession = (sessionId: string, events: SessionEvent[]): RawParsedSession => ({
  sessionId,
  source: "codex",
  filePath: `/tmp/${sessionId}.jsonl`,
  fileSizeBytes: 123,
  metadata: {
    cwd: "/tmp/repo",
    gitBranch: "main",
    model: "gpt-5",
    cliVersion: "1.0.0",
    title: null,
  },
  events,
});

describe("normalizeSession event ids", () => {
  test("scopes event ids by session", () => {
    const first = normalizeSession(
      makeRawSession("session-a", [makeEvent({ id: "shared-id", sessionId: "session-a" })]),
    );
    const second = normalizeSession(
      makeRawSession("session-b", [makeEvent({ id: "shared-id", sessionId: "session-b" })]),
    );

    expect(first.events[0]?.id).toBe("session-a:event:shared-id");
    expect(second.events[0]?.id).toBe("session-b:event:shared-id");
    expect(first.events[0]?.id).not.toBe(second.events[0]?.id);
  });

  test("deduplicates repeated ids within the same session", () => {
    const result = normalizeSession(
      makeRawSession("session-c", [
        makeEvent({ id: "dup", timestamp: "2026-02-21T10:00:00.000Z" }),
        makeEvent({ id: "dup", timestamp: "2026-02-21T10:00:01.000Z" }),
      ]),
    );

    const ids = result.events.map((event) => event.id);
    expect(ids).toEqual(["session-c:event:dup", "session-c:event:dup:dup:1"]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("normalizeSession costs", () => {
  test("prefers provided event costUsd over computed pricing", () => {
    const result = normalizeSession(
      makeRawSession("session-cost", [
        makeEvent({
          id: "cost-event",
          model: "gpt-5-codex",
          tokens: {
            inputTokens: 200_000,
            outputTokens: 20_000,
            cacheReadTokens: 100_000,
            cacheWriteTokens: 0,
            reasoningTokens: 5_000,
          },
          costUsd: 0.42,
        }),
      ]),
    );

    expect(result.events[0]?.costUsd).toBe(0.42);
    expect(result.session.totalCostUsd).toBe(0.42);
  });
});

describe("normalizeTokenUsage", () => {
  test("supports prompt/completion and cached/reasoning fields", () => {
    const usage = normalizeTokenUsage({
      prompt_tokens: 1200,
      completion_tokens: 300,
      cached_input_tokens: 700,
      reasoning_output_tokens: 90,
    });

    expect(usage).toEqual({
      inputTokens: 1200,
      outputTokens: 300,
      cacheReadTokens: 700,
      cacheWriteTokens: 0,
      reasoningTokens: 90,
    });
  });

  test("supports nested prompt_tokens_details cached tokens", () => {
    const usage = normalizeTokenUsage({
      input_tokens: 512,
      output_tokens: 128,
      prompt_tokens_details: { cached_tokens: 256 },
    });

    expect(usage).toEqual({
      inputTokens: 512,
      outputTokens: 128,
      cacheReadTokens: 256,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    });
  });
});
