import { basename } from "node:path";
import {
  EMPTY_TOKEN_USAGE,
  type Session,
  type SessionEvent,
  type SessionEventKind,
  type TokenUsage,
} from "../shared/schema";
import { computeCost } from "./pricing";
import type { RawParsedSession } from "./parsers/types";

const TOOL_CALL_TYPES = new Set([
  "tool_call",
  "tool-call",
  "tool_use",
  "function_call",
  "custom_tool_call",
  "web_search_call",
]);

const TOOL_RESULT_TYPES = new Set([
  "tool_result",
  "tool-result",
  "function_result",
  "function_call_output",
  "custom_tool_call_output",
  "web_search_call_output",
]);

const ERROR_TYPES = new Set(["error", "err"]);

const META_TYPES = new Set([
  "system",
  "summary",
  "file-history-snapshot",
  "session_meta",
  "turn_context",
  "todo_state",
  "session_start",
  "progress",
  "queue-operation",
  "assistant.turn_start",
  "assistant.turn_end",
  "session.truncation",
  "environment_context",
  "thread_rolled_back",
  "task_started",
  "task_complete",
  "turn_aborted",
  "reasoning",
  "agent_reasoning",
  "token_count",
]);

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const normalizeTimestamp = (input: unknown): string | null => {
  if (input === null || input === undefined || input === "") return null;

  if (typeof input === "string") {
    const numeric = toFiniteNumber(input);
    if (numeric !== null) {
      return normalizeTimestamp(numeric);
    }

    const time = Date.parse(input);
    if (!Number.isNaN(time)) {
      return new Date(time).toISOString();
    }
    return null;
  }

  const numeric = toFiniteNumber(input);
  if (numeric === null) return null;

  // Heuristic: <= 10 digits is epoch seconds, > 10 digits is epoch milliseconds.
  const asMs = numeric < 100_000_000_000 ? numeric * 1000 : numeric;
  const date = new Date(asMs);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const collectText = (value: unknown, output: string[], depth = 0): void => {
  if (value === null || value === undefined || depth > 6) return;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) output.push(trimmed);
    return;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    output.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectText(entry, output, depth + 1);
    }
    return;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    const preferredKeys: Array<keyof typeof record> = [
      "text",
      "message",
      "summary",
      "description",
      "thinking",
      "content",
      "output",
      "input",
    ];

    for (const key of preferredKeys) {
      if (key in record) {
        collectText(record[key], output, depth + 1);
      }
    }

    if ("args" in record) {
      collectText(record.args, output, depth + 1);
    }
  }
};

export const extractText = (value: unknown): string | null => {
  const chunks: string[] = [];
  collectText(value, chunks);
  if (chunks.length === 0) return null;
  return chunks.join("\n").trim() || null;
};

const getNested = (value: unknown, path: string[]): unknown => {
  let current: unknown = value;
  for (const part of path) {
    if (!current || typeof current !== "object" || !(part in (current as Record<string, unknown>))) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
};

export const normalizeTokenUsage = (value: unknown): TokenUsage | null => {
  if (!value || typeof value !== "object") return null;

  const source = value as Record<string, unknown>;

  const firstNumber = (...candidates: unknown[]): number => {
    for (const candidate of candidates) {
      const parsed = toFiniteNumber(candidate);
      if (parsed !== null) return parsed;
    }
    return 0;
  };

  const inputTokens = firstNumber(source.inputTokens, source.input_tokens, source.input);
  const outputTokens = firstNumber(source.outputTokens, source.output_tokens, source.output);
  const cacheReadTokens = firstNumber(
    source.cacheReadTokens,
    source.cache_read_tokens,
    source.cache_read_input_tokens,
    source.cached,
    getNested(source, ["cache", "read"]),
  );
  const cacheWriteTokens = firstNumber(
    source.cacheWriteTokens,
    source.cache_write_tokens,
    source.cache_write_input_tokens,
    source.cache_creation_input_tokens,
    source.cacheCreationTokens,
    getNested(source, ["cache", "write"]),
  );
  const reasoningTokens = firstNumber(
    source.reasoningTokens,
    source.reasoning_tokens,
    source.reasoning,
    source.thinkingTokens,
    source.thoughts,
  );

  const hasAnyField =
    "inputTokens" in source ||
    "input_tokens" in source ||
    "input" in source ||
    "outputTokens" in source ||
    "output_tokens" in source ||
    "output" in source ||
    "cacheReadTokens" in source ||
    "cache_read_tokens" in source ||
    "cache_read_input_tokens" in source ||
    "cache" in source ||
    "cacheWriteTokens" in source ||
    "cache_write_tokens" in source ||
    "cache_creation_input_tokens" in source ||
    "reasoningTokens" in source ||
    "reasoning_tokens" in source ||
    "thoughts" in source ||
    "thinkingTokens" in source;

  if (!hasAnyField && inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens + reasoningTokens === 0) {
    return null;
  }

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    reasoningTokens,
  };
};

export const resolveEventKind = (rawType: unknown, rawRole: unknown): SessionEventKind => {
  const type = typeof rawType === "string" ? rawType.toLowerCase().trim() : "";
  const role = typeof rawRole === "string" ? rawRole.toLowerCase().trim() : "";

  if (type === "user" || role === "user") return "user";
  if (type === "assistant" || role === "assistant") return "assistant";
  if (TOOL_CALL_TYPES.has(type)) return "tool_call";
  if (TOOL_RESULT_TYPES.has(type) || role === "tool") return "tool_result";
  if (ERROR_TYPES.has(type)) return "error";
  if (META_TYPES.has(type) || role === "system") return "meta";

  return "meta";
};

export const addTokenUsage = (left: TokenUsage, right: TokenUsage | null): TokenUsage => {
  if (!right) return left;

  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
    reasoningTokens: left.reasoningTokens + right.reasoningTokens,
  };
};

const toEventIdSuffix = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
};

const scopeEventId = (sessionId: string, value: unknown, fallbackIndex?: number): string | null => {
  const suffix = toEventIdSuffix(value) ?? (typeof fallbackIndex === "number" ? `index:${fallbackIndex}` : null);
  if (!suffix) return null;

  const prefix = `${sessionId}:event:`;
  if (suffix.startsWith(prefix)) {
    return suffix;
  }

  return `${prefix}${suffix}`;
};

const normalizeEventShape = (event: SessionEvent, index: number, sessionId: string): SessionEvent => {
  const tokens = normalizeTokenUsage(event.tokens);
  const scopedId = scopeEventId(sessionId, event.id, index) ?? `${sessionId}:event:index:${index}`;

  return {
    id: scopedId,
    sessionId,
    kind: event.kind,
    timestamp: normalizeTimestamp(event.timestamp),
    role: event.role ?? null,
    text: event.text ?? null,
    toolName: event.toolName ?? null,
    toolInput: event.toolInput ?? null,
    toolOutput: event.toolOutput ?? null,
    model: event.model ?? null,
    parentId: scopeEventId(sessionId, event.parentId),
    messageId: event.messageId ?? null,
    isDelta: Boolean(event.isDelta),
    tokens,
    costUsd: typeof event.costUsd === "number" && Number.isFinite(event.costUsd) ? event.costUsd : null,
  };
};

const extractRepoName = (cwd: string | null): string | null => {
  if (!cwd) return null;
  const repo = basename(cwd.replace(/[\\/]+$/, ""));
  return repo.length > 0 ? repo : null;
};

const findSessionModel = (events: SessionEvent[], fallback: string | null): string | null => {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.kind !== "assistant" || !event.model) continue;
    counts.set(event.model, (counts.get(event.model) ?? 0) + 1);
  }

  let winner: string | null = null;
  let max = 0;
  for (const [model, count] of counts) {
    if (count > max) {
      max = count;
      winner = model;
    }
  }

  return winner ?? fallback;
};

const deriveTitle = (events: SessionEvent[], explicit: string | null): string | null => {
  if (explicit && explicit.trim().length > 0) return explicit.trim();

  const firstUser = events.find((event) => event.kind === "user" && event.text && event.text.trim().length > 0);
  if (!firstUser?.text) return null;
  return firstUser.text.replace(/\s+/g, " ").trim().slice(0, 200);
};

export const normalizeSession = (parsed: RawParsedSession): { session: Session; events: SessionEvent[] } => {
  const normalizedEvents = parsed.events
    .map((event, index) => normalizeEventShape(event, index, parsed.sessionId))
    .map((event) => {
      const costFromPricing = event.costUsd ?? computeCost(event.tokens, event.model ?? parsed.metadata.model);
      return { ...event, costUsd: costFromPricing };
    });

  const eventsWithIndex = normalizedEvents.map((event, index) => ({ event, index }));
  eventsWithIndex.sort((left, right) => {
    if (!left.event.timestamp && !right.event.timestamp) return left.index - right.index;
    if (!left.event.timestamp) return 1;
    if (!right.event.timestamp) return -1;

    const leftTime = Date.parse(left.event.timestamp);
    const rightTime = Date.parse(right.event.timestamp);
    if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return left.index - right.index;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return left.index - right.index;
  });

  const seenEventIds = new Map<string, number>();
  const events = eventsWithIndex.map(({ event }) => {
    const seenCount = seenEventIds.get(event.id) ?? 0;
    seenEventIds.set(event.id, seenCount + 1);

    if (seenCount === 0) {
      return event;
    }

    return {
      ...event,
      id: `${event.id}:dup:${seenCount}`,
    };
  });

  const timestamped = events
    .map((event) => event.timestamp)
    .filter((timestamp): timestamp is string => Boolean(timestamp));

  const startTime = timestamped.length > 0 ? timestamped[0] ?? null : null;
  const endTime = timestamped.length > 0 ? timestamped[timestamped.length - 1] ?? null : null;

  let durationMs: number | null = null;
  if (startTime && endTime) {
    const diff = Date.parse(endTime) - Date.parse(startTime);
    durationMs = Number.isFinite(diff) ? Math.max(0, diff) : null;
  }

  let totalTokens = { ...EMPTY_TOKEN_USAGE };
  let totalCost = 0;
  let hasCost = false;
  let messageCount = 0;
  let toolCallCount = 0;

  for (const event of events) {
    totalTokens = addTokenUsage(totalTokens, event.tokens);

    if (typeof event.costUsd === "number" && Number.isFinite(event.costUsd)) {
      totalCost += event.costUsd;
      hasCost = true;
    }

    if (event.kind === "user" || event.kind === "assistant") {
      messageCount += 1;
    }

    if (event.kind === "tool_call") {
      toolCallCount += 1;
    }
  }

  const housekeeping = messageCount === 0 || events.every((event) => event.kind === "meta");

  const session: Session = {
    id: parsed.sessionId,
    source: parsed.source,
    filePath: parsed.filePath,
    fileSizeBytes: parsed.fileSizeBytes,
    startTime,
    endTime,
    durationMs,
    title: deriveTitle(events, parsed.metadata.title),
    model: findSessionModel(events, parsed.metadata.model),
    cwd: parsed.metadata.cwd,
    repoName: extractRepoName(parsed.metadata.cwd),
    gitBranch: parsed.metadata.gitBranch,
    cliVersion: parsed.metadata.cliVersion,
    eventCount: events.length,
    messageCount,
    totalTokens,
    totalCostUsd: hasCost ? totalCost : null,
    toolCallCount,
    isHousekeeping: housekeeping,
    parsedAt: new Date().toISOString(),
  };

  return { session, events };
};
