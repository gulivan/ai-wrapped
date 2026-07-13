import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SessionSource } from "../../shared/schema";
import { normalizeSession } from "../normalizer";
import { parseFile } from "./index";

const fixture = (name: string): string => mkdtempSync(join(tmpdir(), `ai-stats-${name}-`));

const parse = async (path: string, source: SessionSource) => {
  const fileStat = statSync(path);
  return parseFile({ path, source, mtime: fileStat.mtimeMs, size: fileStat.size });
};

const firstSession = async (path: string, source: SessionSource) => {
  const sessions = await parse(path, source);
  expect(sessions).toHaveLength(1);
  const parsed = sessions[0];
  expect(parsed).toBeDefined();
  if (!parsed) throw new Error("Expected parsed session");
  return normalizeSession(parsed).session;
};

describe("additional harness parsers", () => {
  test("parses Amp thread usage", async () => {
    const dir = fixture("amp");
    try {
      const path = join(dir, "T-thread.json");
      writeFileSync(path, JSON.stringify({
        id: "amp-thread",
        usageLedger: { events: [{ id: "evt", timestamp: "2026-07-01T12:00:00Z", model: "gpt-5.6", tokens: { input: 10, output: 5 } }] },
      }));
      const session = await firstSession(path, "amp");
      expect(session.modelUsage[0]?.model).toBe("gpt-5.6");
      expect(session.totalTokens).toMatchObject({ inputTokens: 10, outputTokens: 5 });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("parses Codebuff assistant usage", async () => {
    const dir = fixture("codebuff");
    try {
      const path = join(dir, "chat-messages.json");
      writeFileSync(path, JSON.stringify([{
        id: "message", role: "assistant", timestamp: "2026-07-01T12:00:00Z",
        metadata: { model: "claude-fable-5", usage: { inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 3 } },
      }]));
      const session = await firstSession(path, "codebuff");
      expect(session.modelUsage[0]?.model).toBe("claude-fable-5");
      expect(session.totalTokens).toMatchObject({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 3 });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("parses Goose sessions from SQLite", async () => {
    const dir = fixture("goose");
    try {
      const path = join(dir, "sessions.db");
      const db = new Database(path);
      db.exec("CREATE TABLE sessions (id TEXT, model_config_json TEXT, created_at TEXT, input_tokens INTEGER, output_tokens INTEGER, total_tokens INTEGER, accumulated_input_tokens INTEGER, accumulated_output_tokens INTEGER, accumulated_total_tokens INTEGER)");
      db.query("INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run("goose-1", '{"model_name":"gpt-5.6-terra"}', "2026-07-01 12:00:00", 0, 0, 0, 10, 5, 18);
      db.close();
      const session = await firstSession(path, "goose");
      expect(session.modelUsage[0]?.model).toBe("gpt-5.6-terra");
      expect(session.totalTokens).toMatchObject({ inputTokens: 10, outputTokens: 5, reasoningTokens: 3 });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("parses Hermes sessions from SQLite", async () => {
    const dir = fixture("hermes");
    try {
      const path = join(dir, "state.db");
      const db = new Database(path);
      db.exec("CREATE TABLE sessions (id TEXT, model TEXT, started_at REAL, message_count INTEGER, input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER, cache_write_tokens INTEGER, reasoning_tokens INTEGER, estimated_cost_usd REAL, actual_cost_usd REAL)");
      db.query("INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run("hermes-1", "gpt-5.6-sol", 1_783_000_000, 2, 10, 5, 3, 1, 2, 0.1, 0.2);
      db.close();
      const session = await firstSession(path, "hermes");
      expect(session.modelUsage[0]?.model).toBe("gpt-5.6-sol");
      expect(session.totalCostUsd).toBe(0.2);
      expect(session.totalTokens).toMatchObject({ cacheReadTokens: 3, cacheWriteTokens: 1, reasoningTokens: 2 });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("parses Kilo messages from SQLite", async () => {
    const dir = fixture("kilo");
    try {
      const path = join(dir, "kilo.db");
      const db = new Database(path);
      db.exec("CREATE TABLE message (id TEXT, session_id TEXT, data TEXT)");
      db.query("INSERT INTO message VALUES (?, ?, ?)").run("row-1", "kilo-1", JSON.stringify({
        id: "message-1", role: "assistant", modelID: "claude-fable-5", time: { created: 1_783_000_000_000 },
        tokens: { input: 10, output: 5, reasoning: 2, cache: { read: 3, write: 1 } }, cost: 0.2,
      }));
      db.close();
      const session = await firstSession(path, "kilo");
      expect(session.modelUsage[0]?.model).toBe("claude-fable-5");
      expect(session.totalTokens).toMatchObject({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 3, cacheWriteTokens: 1, reasoningTokens: 2 });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("parses Kimi wire usage", async () => {
    const dir = fixture("kimi");
    try {
      const path = join(dir, "wire.jsonl");
      writeFileSync(path, JSON.stringify({ type: "usage.record", usage_scope: "turn", time: 1_783_000_000_000, model: "kimi-code/k2", usage: { input_other: 10, output: 5, input_cache_read: 3, input_cache_creation: 1 } }) + "\n");
      const session = await firstSession(path, "kimi");
      expect(session.modelUsage[0]?.model).toBe("k2");
      expect(session.totalTokens).toMatchObject({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 3, cacheWriteTokens: 1 });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("parses OpenClaw model changes and assistant usage", async () => {
    const dir = fixture("openclaw");
    try {
      const path = join(dir, "session.jsonl");
      writeFileSync(path, [
        JSON.stringify({ type: "model_change", data: { modelId: "gpt-5.6-terra" } }),
        JSON.stringify({ type: "message", message: { role: "assistant", timestamp: 1_783_000_000_000, usage: { input: 10, output: 5, cacheRead: 3, cacheWrite: 1, cost: { total: 0.2 } } } }),
      ].join("\n"));
      const session = await firstSession(path, "openclaw");
      expect(session.modelUsage[0]?.model).toBe("gpt-5.6-terra");
      expect(session.totalCostUsd).toBe(0.2);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("parses pi assistant usage", async () => {
    const dir = fixture("pi");
    try {
      const path = join(dir, "session.jsonl");
      writeFileSync(path, JSON.stringify({ timestamp: "2026-07-01T12:00:00Z", message: { role: "assistant", model: "gpt-5.6-sol", usage: { input: 10, output: 5, cacheRead: 3, cacheWrite: 1, cost: { total: 0.2 } } } }) + "\n");
      const session = await firstSession(path, "pi");
      expect(session.modelUsage[0]?.model).toBe("gpt-5.6-sol");
      expect(session.totalCostUsd).toBe(0.2);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test("parses Qwen assistant usage metadata", async () => {
    const dir = fixture("qwen");
    try {
      const path = join(dir, "chat.jsonl");
      writeFileSync(path, JSON.stringify({ type: "assistant", timestamp: "2026-07-01T12:00:00Z", model: "qwen3-coder", usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 2, cachedContentTokenCount: 3 } }) + "\n");
      const session = await firstSession(path, "qwen");
      expect(session.modelUsage[0]?.model).toBe("qwen3-coder");
      expect(session.totalTokens).toMatchObject({ inputTokens: 10, outputTokens: 5, reasoningTokens: 2, cacheReadTokens: 3 });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
