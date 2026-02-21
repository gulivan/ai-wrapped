import { describe, expect, test } from "bun:test";
import type { SessionEvent } from "@shared/schema";
import { normalizeSession } from "./normalizer";
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
