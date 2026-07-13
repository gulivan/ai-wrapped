import { Database } from "bun:sqlite";
import { readFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import type { SessionSource, TokenUsage } from "../../shared/schema";
import type { FileCandidate } from "../discovery";
import { extractText, normalizeTimestamp } from "../normalizer";
import type { SessionEvent } from "../session-schema";
import type { RawParsedSession } from "./types";

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const string = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

const number = (...values: unknown[]): number => {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return 0;
};

const nested = (value: unknown, ...keys: string[]): unknown => {
  let current: unknown = value;
  for (const key of keys) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[key];
  }
  return current;
};

const toTokens = (value: Partial<TokenUsage>): TokenUsage => ({
  inputTokens: Math.max(0, value.inputTokens ?? 0),
  outputTokens: Math.max(0, value.outputTokens ?? 0),
  cacheReadTokens: Math.max(0, value.cacheReadTokens ?? 0),
  cacheWriteTokens: Math.max(0, value.cacheWriteTokens ?? 0),
  reasoningTokens: Math.max(0, value.reasoningTokens ?? 0),
});

const hasTokens = (tokens: TokenUsage): boolean =>
  tokens.inputTokens + tokens.outputTokens + tokens.cacheReadTokens + tokens.cacheWriteTokens + tokens.reasoningTokens > 0;

const parseJsonLines = (content: string): JsonRecord[] =>
  content
    .split(/\r?\n/)
    .map((line) => {
      try {
        return asRecord(JSON.parse(line) as unknown);
      } catch {
        return null;
      }
    })
    .filter((value): value is JsonRecord => value !== null);

const timestamp = (value: unknown, fallback: number): string =>
  normalizeTimestamp(value) ?? new Date(fallback).toISOString();

const event = (
  sessionId: string,
  index: number,
  options: {
    timestamp: unknown;
    fallbackTimestamp: number;
    model?: string | null;
    tokens: TokenUsage;
    costUsd?: number | null;
    text?: string | null;
    id?: string | null;
  },
): SessionEvent => ({
  id: options.id ?? `${sessionId}:usage:${index}`,
  sessionId,
  kind: "assistant",
  timestamp: timestamp(options.timestamp, options.fallbackTimestamp),
  role: "assistant",
  text: options.text ?? null,
  toolName: null,
  toolInput: null,
  toolOutput: null,
  model: options.model ?? null,
  parentId: null,
  messageId: options.id ?? null,
  isDelta: false,
  tokens: hasTokens(options.tokens) ? options.tokens : null,
  costUsd: options.costUsd !== null && options.costUsd !== undefined && Number.isFinite(options.costUsd)
    ? Math.max(0, options.costUsd)
    : null,
});

const rawSession = (
  candidate: FileCandidate,
  sessionId: string,
  events: SessionEvent[],
  model: string | null = null,
): RawParsedSession | null =>
  events.length === 0
    ? null
    : {
        sessionId,
        source: candidate.source,
        filePath: candidate.path,
        fileSizeBytes: candidate.size,
        metadata: { cwd: null, gitBranch: null, model, cliVersion: null, title: null },
        events,
      };

const oneOrNone = (session: RawParsedSession | null): RawParsedSession[] => (session ? [session] : []);

const fileSessionId = (candidate: FileCandidate): string => basename(candidate.path).replace(/\.[^.]+(?:\.[^.]+)?$/, "");

const ampTokens = (usage: JsonRecord): TokenUsage =>
  toTokens({
    inputTokens: number(usage.inputTokens, usage.input_tokens, usage.input),
    outputTokens: number(usage.outputTokens, usage.output_tokens, usage.output, usage.totalTokens, usage.total_tokens, usage.total),
    cacheReadTokens: number(usage.cacheReadInputTokens, usage.cache_read_input_tokens),
    cacheWriteTokens: number(usage.cacheCreationInputTokens, usage.cache_creation_input_tokens),
  });

export const parseAmp = async (candidate: FileCandidate): Promise<RawParsedSession[]> => {
  const root = asRecord(JSON.parse(await readFile(candidate.path, "utf8")) as unknown);
  if (!root) return [];
  const sessionId = string(root.id) ?? fileSessionId(candidate);
  const messages = asArray(root.messages).map(asRecord).filter((value): value is JsonRecord => value !== null);
  const ledger = asRecord(root.usageLedger);
  const ledgerEvents = asArray(ledger?.events).map(asRecord).filter((value): value is JsonRecord => value !== null);
  const source = ledgerEvents.length > 0 ? ledgerEvents : messages.filter((message) => string(message.role) === "assistant");
  const events = source.flatMap((entry, index) => {
    const usage = asRecord(entry.tokens) ?? asRecord(entry.usage);
    if (!usage) return [];
    const tokens = ampTokens(usage);
    return hasTokens(tokens)
      ? [event(sessionId, index, {
          timestamp: entry.timestamp,
          fallbackTimestamp: candidate.mtime,
          model: string(entry.model, usage.model),
          tokens,
          id: string(entry.id),
        })]
      : [];
  });
  return oneOrNone(rawSession(candidate, sessionId, events));
};

const standardTokens = (usage: JsonRecord): TokenUsage => {
  const cache = asRecord(usage.cache);
  return toTokens({
    inputTokens: number(usage.inputTokens, usage.input_tokens, usage.promptTokens, usage.prompt_tokens, usage.input),
    outputTokens: number(usage.outputTokens, usage.output_tokens, usage.completionTokens, usage.completion_tokens, usage.output),
    cacheReadTokens: number(
      usage.cacheReadInputTokens,
      usage.cache_read_input_tokens,
      nested(usage, "promptTokensDetails", "cachedTokens"),
      nested(usage, "prompt_tokens_details", "cached_tokens"),
      cache?.read,
      usage.cacheRead,
    ),
    cacheWriteTokens: number(
      usage.cacheCreationInputTokens,
      usage.cache_creation_input_tokens,
      usage.cacheWrite,
      cache?.write,
    ),
    reasoningTokens: number(usage.reasoning, usage.reasoningTokens, usage.thoughtsTokenCount, usage.thoughts_token_count),
  });
};

export const parseCodebuff = async (candidate: FileCandidate): Promise<RawParsedSession[]> => {
  const parsed = JSON.parse(await readFile(candidate.path, "utf8")) as unknown;
  if (!Array.isArray(parsed)) return [];
  const sessionId = dirname(candidate.path).split("/").slice(-3).join("/") || fileSessionId(candidate);
  const events = parsed.flatMap((value, index) => {
    const message = asRecord(value);
    if (!message || !["assistant", "agent", "ai"].includes(string(message.role, message.variant) ?? "")) return [];
    const metadata = asRecord(message.metadata);
    const codebuff = asRecord(metadata?.codebuff);
    const usage = asRecord(metadata?.usage) ?? asRecord(codebuff?.usage);
    if (!usage) return [];
    const tokens = standardTokens(usage);
    return hasTokens(tokens)
      ? [event(sessionId, index, {
          timestamp: message.timestamp,
          fallbackTimestamp: candidate.mtime,
          model: string(metadata?.model, codebuff?.model),
          tokens,
          costUsd: number(message.costUsd, message.cost_usd) || null,
          id: string(message.id),
        })]
      : [];
  });
  return oneOrNone(rawSession(candidate, sessionId, events));
};

const sqliteRows = (path: string, query: string): JsonRecord[] => {
  const db = new Database(path, { readonly: true });
  try {
    return db.query(query).all() as JsonRecord[];
  } finally {
    db.close();
  }
};

export const parseGoose = async (candidate: FileCandidate): Promise<RawParsedSession[]> => {
  try {
    const rows = sqliteRows(candidate.path, `
      SELECT id, model_config_json, created_at,
        COALESCE(accumulated_input_tokens, input_tokens, 0) AS input_tokens,
        COALESCE(accumulated_output_tokens, output_tokens, 0) AS output_tokens,
        COALESCE(accumulated_total_tokens, total_tokens, 0) AS total_tokens
      FROM sessions WHERE model_config_json IS NOT NULL`);
    return rows.flatMap((row) => {
      const config = asRecord(JSON.parse(String(row.model_config_json)) as unknown);
      const model = string(config?.model_name);
      const inputTokens = number(row.input_tokens);
      const outputTokens = number(row.output_tokens);
      const tokens = toTokens({ inputTokens, outputTokens, reasoningTokens: Math.max(0, number(row.total_tokens) - inputTokens - outputTokens) });
      const sessionId = string(row.id);
      const parsed = sessionId && model && hasTokens(tokens)
        ? rawSession(candidate, sessionId, [event(sessionId, 0, { timestamp: row.created_at, fallbackTimestamp: candidate.mtime, model, tokens, id: sessionId })], model)
        : null;
      return parsed ? [parsed] : [];
    });
  } catch {
    return [];
  }
};

export const parseHermes = async (candidate: FileCandidate): Promise<RawParsedSession[]> => {
  try {
    const rows = sqliteRows(candidate.path, `
      SELECT id, model, started_at, message_count, input_tokens, output_tokens,
        cache_read_tokens, cache_write_tokens, reasoning_tokens, estimated_cost_usd, actual_cost_usd
      FROM sessions WHERE model IS NOT NULL AND TRIM(model) != ''`);
    return rows.flatMap((row) => {
      const sessionId = string(row.id);
      const model = string(row.model);
      const tokens = toTokens({
        inputTokens: number(row.input_tokens), outputTokens: number(row.output_tokens),
        cacheReadTokens: number(row.cache_read_tokens), cacheWriteTokens: number(row.cache_write_tokens),
        reasoningTokens: number(row.reasoning_tokens),
      });
      const parsed = sessionId && model && (hasTokens(tokens) || number(row.actual_cost_usd, row.estimated_cost_usd) > 0)
        ? rawSession(candidate, sessionId, [event(sessionId, 0, {
            timestamp: row.started_at, fallbackTimestamp: candidate.mtime, model, tokens,
            costUsd: number(row.actual_cost_usd, row.estimated_cost_usd) || null, id: sessionId,
          })], model)
        : null;
      return parsed ? [parsed] : [];
    });
  } catch {
    return [];
  }
};

export const parseKilo = async (candidate: FileCandidate): Promise<RawParsedSession[]> => {
  try {
    const rows = sqliteRows(candidate.path, "SELECT id, session_id, data FROM message");
    return rows.flatMap((row) => {
      const data = asRecord(JSON.parse(String(row.data)) as unknown);
      if (!data || string(data.role) !== "assistant") return [];
      const tokenData = asRecord(data.tokens);
      if (!tokenData) return [];
      const tokens = standardTokens(tokenData);
      const sessionId = string(data.sessionId, row.session_id);
      const model = string(data.modelID, data.model);
      const created = nested(data, "time", "created");
      const parsed = sessionId && model && hasTokens(tokens)
        ? rawSession(candidate, sessionId, [event(sessionId, 0, {
            timestamp: created, fallbackTimestamp: candidate.mtime, model, tokens,
            costUsd: number(data.cost) || null, id: string(data.id, row.id),
          })], model)
        : null;
      return parsed ? [parsed] : [];
    });
  } catch {
    return [];
  }
};

export const parseKimi = async (candidate: FileCandidate): Promise<RawParsedSession[]> => {
  const sessionId = fileSessionId(candidate);
  const events = parseJsonLines(await readFile(candidate.path, "utf8")).flatMap((line, index) => {
    const usage = asRecord(line.usage) ?? asRecord(nested(line, "message", "payload", "token_usage"));
    const isTurn = string(line.type) === "usage.record" ? string(line.usage_scope) === "turn" : Boolean(usage);
    if (!usage || !isTurn) return [];
    const tokens = toTokens({
      inputTokens: number(usage.input_other), outputTokens: number(usage.output),
      cacheReadTokens: number(usage.input_cache_read), cacheWriteTokens: number(usage.input_cache_creation),
    });
    const model = (string(line.model, nested(line, "message", "payload", "model")) ?? "kimi-code")
      .replace(/^kimi-code\//, "");
    return hasTokens(tokens)
      ? [event(sessionId, index, { timestamp: line.time ?? line.timestamp, fallbackTimestamp: candidate.mtime, model, tokens })]
      : [];
  });
  return oneOrNone(rawSession(candidate, sessionId, events));
};

export const parseOpenclaw = async (candidate: FileCandidate): Promise<RawParsedSession[]> => {
  const sessionId = fileSessionId(candidate);
  let model: string | null = null;
  const events = parseJsonLines(await readFile(candidate.path, "utf8")).flatMap((line, index) => {
    const type = string(line.type);
    if (type === "model_change" || (type === "custom" && string(line.customType) === "model-snapshot")) {
      model = string(nested(line, "data", "modelId"), nested(line, "data", "model"), line.modelId, line.model) ?? model;
      return [];
    }
    const message = asRecord(line.message);
    if (type !== "message" || string(message?.role) !== "assistant") return [];
    const usage = asRecord(message?.usage);
    if (!usage) return [];
    const tokens = standardTokens(usage);
    const messageModel = string(message?.modelId, message?.model, model);
    return hasTokens(tokens)
      ? [event(sessionId, index, {
          timestamp: message?.timestamp ?? line.timestamp, fallbackTimestamp: candidate.mtime, model: messageModel, tokens,
          costUsd: number(nested(usage, "cost", "total")) || null,
        })]
      : [];
  });
  return oneOrNone(rawSession(candidate, sessionId, events, model));
};

export const parsePi = async (candidate: FileCandidate): Promise<RawParsedSession[]> => {
  const sessionId = fileSessionId(candidate);
  const events = parseJsonLines(await readFile(candidate.path, "utf8")).flatMap((line, index) => {
    const message = asRecord(line.message);
    if (string(message?.role) !== "assistant") return [];
    const usage = asRecord(message?.usage);
    if (!usage) return [];
    const tokens = standardTokens(usage);
    return hasTokens(tokens)
      ? [event(sessionId, index, {
          timestamp: line.timestamp, fallbackTimestamp: candidate.mtime, model: string(message?.model), tokens,
          costUsd: number(nested(usage, "cost", "total")) || null,
        })]
      : [];
  });
  return oneOrNone(rawSession(candidate, sessionId, events));
};

export const parseQwen = async (candidate: FileCandidate): Promise<RawParsedSession[]> => {
  const sessionId = fileSessionId(candidate);
  const events = parseJsonLines(await readFile(candidate.path, "utf8")).flatMap((line, index) => {
    if (string(line.type) !== "assistant") return [];
    const usage = asRecord(line.usageMetadata);
    if (!usage) return [];
    const prompt = number(usage.promptTokenCount, usage.prompt_token_count);
    const output = number(usage.candidatesTokenCount, usage.candidates_token_count);
    const reasoning = number(usage.thoughtsTokenCount, usage.thoughts_token_count);
    const tokens = toTokens({
      inputTokens: prompt, outputTokens: output, reasoningTokens: reasoning,
      cacheReadTokens: number(usage.cachedContentTokenCount, usage.cached_content_token_count),
    });
    return hasTokens(tokens)
      ? [event(sessionId, index, { timestamp: line.timestamp, fallbackTimestamp: candidate.mtime, model: string(line.model) ?? "unknown", tokens })]
      : [];
  });
  return oneOrNone(rawSession(candidate, sessionId, events));
};
