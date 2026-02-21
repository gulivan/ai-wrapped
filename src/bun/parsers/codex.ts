import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { FileCandidate } from "../discovery";
import { extractText, normalizeTimestamp, normalizeTokenUsage, resolveEventKind } from "../normalizer";
import type { SessionEvent } from "../session-schema";
import type { RawParsedSession, SessionParser } from "./types";

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const getString = (value: unknown): string | null => {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
};

const parseJsonl = (content: string): Array<Record<string, unknown>> => {
  const records: Array<Record<string, unknown>> = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const record = asRecord(parsed);
      if (record) records.push(record);
    } catch {
      // Skip malformed JSONL lines.
    }
  }
  return records;
};

const extractCodexSessionId = (candidate: FileCandidate, records: Array<Record<string, unknown>>): string => {
  for (const record of records) {
    if (record.type === "session_meta") {
      const payload = asRecord(record.payload);
      const payloadId = getString(payload?.id);
      if (payloadId) return payloadId;
    }
  }

  const match = basename(candidate.path).match(/^rollout-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-(.+)\.jsonl$/);
  if (match?.[1]) return match[1];

  return basename(candidate.path).replace(/\.jsonl$/, "");
};

const detectDelta = (payloadType: string | null, payload: Record<string, unknown> | null): boolean => {
  if (payloadType?.toLowerCase().includes("delta")) return true;
  if (!payload) return false;

  if (typeof payload.isDelta === "boolean") return payload.isDelta;
  if (payload.delta !== undefined || payload.content_delta !== undefined) return true;

  if (Array.isArray(payload.content)) {
    return payload.content.some((entry) => {
      const block = asRecord(entry);
      if (!block) return false;
      const blockType = getString(block.type);
      return Boolean(blockType && blockType.toLowerCase().includes("delta"));
    });
  }

  return false;
};

const extractCodexText = (record: Record<string, unknown>, payload: Record<string, unknown> | null): string | null => {
  if (payload) {
    const payloadText = extractText(payload.content ?? payload.message ?? payload.text ?? payload.summary ?? payload);
    if (payloadText) return payloadText;
  }

  return extractText(record.content ?? record.text ?? record.message ?? record);
};

interface CodexUsageTotals {
  inputTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toCodexUsageTotals = (value: unknown): CodexUsageTotals | null => {
  const record = asRecord(value);
  if (!record) return null;

  const inputTokens = toFiniteNumber(record.input_tokens);
  const cacheReadTokens = toFiniteNumber(record.cached_input_tokens) ?? 0;
  const outputTokens = toFiniteNumber(record.output_tokens);
  const reasoningTokens = toFiniteNumber(record.reasoning_output_tokens) ?? 0;

  if (inputTokens === null && outputTokens === null) return null;

  return {
    inputTokens: Math.max(0, inputTokens ?? 0),
    cacheReadTokens: Math.max(0, cacheReadTokens),
    outputTokens: Math.max(0, outputTokens ?? 0),
    reasoningTokens: Math.max(0, reasoningTokens),
  };
};

const subtractUsageTotals = (current: CodexUsageTotals, previous: CodexUsageTotals | null): CodexUsageTotals => {
  if (!previous) return current;

  return {
    inputTokens: Math.max(0, current.inputTokens - previous.inputTokens),
    cacheReadTokens: Math.max(0, current.cacheReadTokens - previous.cacheReadTokens),
    outputTokens: Math.max(0, current.outputTokens - previous.outputTokens),
    reasoningTokens: Math.max(0, current.reasoningTokens - previous.reasoningTokens),
  };
};

const toTokenUsage = (usage: CodexUsageTotals): SessionEvent["tokens"] => {
  const uncachedInputTokens = Math.max(0, usage.inputTokens - usage.cacheReadTokens);
  const nonReasoningOutputTokens = Math.max(0, usage.outputTokens - usage.reasoningTokens);

  if (
    uncachedInputTokens === 0 &&
    nonReasoningOutputTokens === 0 &&
    usage.cacheReadTokens === 0 &&
    usage.reasoningTokens === 0
  ) {
    return null;
  }

  return {
    inputTokens: uncachedInputTokens,
    outputTokens: nonReasoningOutputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: 0,
    reasoningTokens: usage.reasoningTokens,
  };
};

const extractTokenCountUsage = (
  payload: Record<string, unknown> | null,
  previousTotals: CodexUsageTotals | null,
): { tokens: SessionEvent["tokens"]; nextTotals: CodexUsageTotals | null } => {
  const info = asRecord(payload?.info);
  const totalUsage = toCodexUsageTotals(info?.total_token_usage);
  const lastUsage = toCodexUsageTotals(info?.last_token_usage);

  if (totalUsage) {
    const deltaUsage = subtractUsageTotals(totalUsage, previousTotals);
    const deltaTokens = toTokenUsage(deltaUsage);
    if (deltaTokens) {
      return { tokens: deltaTokens, nextTotals: totalUsage };
    }

    if (!previousTotals && lastUsage) {
      return { tokens: toTokenUsage(lastUsage), nextTotals: totalUsage };
    }

    return { tokens: null, nextTotals: totalUsage };
  }

  if (lastUsage) {
    return { tokens: toTokenUsage(lastUsage), nextTotals: previousTotals };
  }

  return { tokens: null, nextTotals: previousTotals };
};

const createEvent = (
  sessionId: string,
  lineIndex: number,
  record: Record<string, unknown>,
  kind: SessionEvent["kind"],
  options: {
    role?: string | null;
    text?: string | null;
    toolName?: string | null;
    toolInput?: string | null;
    toolOutput?: string | null;
    model?: string | null;
    parentId?: string | null;
    messageId?: string | null;
    isDelta?: boolean;
    kindType?: string | null;
    tokens?: SessionEvent["tokens"];
  } = {},
): SessionEvent => {
  const payload = asRecord(record.payload);

  const kindType = options.kindType ?? getString(payload?.type) ?? getString(record.type);
  const messageId = options.messageId ?? getString(payload?.id) ?? getString(payload?.call_id);
  const eventScope = kindType ?? kind;
  const idSuffix = messageId ? `${eventScope}:${messageId}` : `${eventScope}:${lineIndex}`;

  return {
    // Keep IDs unique across event kinds and repeated delta frames.
    id: `${sessionId}:${kind}:${idSuffix}:${lineIndex}`,
    sessionId,
    kind,
    timestamp: normalizeTimestamp(record.timestamp),
    role: options.role ?? getString(payload?.role) ?? getString(record.role),
    text: options.text ?? null,
    toolName: options.toolName ?? null,
    toolInput: options.toolInput ?? null,
    toolOutput: options.toolOutput ?? null,
    model: options.model ?? null,
    parentId: options.parentId ?? null,
    messageId,
    isDelta: Boolean(options.isDelta),
    tokens: options.tokens ?? null,
    costUsd: null,
  };
};

export const codexParser: SessionParser = {
  source: "codex",
  async parse(candidate: FileCandidate): Promise<RawParsedSession | null> {
    try {
      const content = await readFile(candidate.path, "utf8");
      const records = parseJsonl(content);
      if (records.length === 0) return null;

      const sessionId = extractCodexSessionId(candidate, records);

      let cwd: string | null = null;
      let gitBranch: string | null = null;
      let model: string | null = null;
      let cliVersion: string | null = null;
      let title: string | null = null;
      let previousCodexTotalUsage: CodexUsageTotals | null = null;

      const events: SessionEvent[] = [];

      for (let lineIndex = 0; lineIndex < records.length; lineIndex += 1) {
        const record = records[lineIndex] ?? {};
        const type = getString(record.type);
        const payload = asRecord(record.payload);
        const payloadType = getString(payload?.type);

        if (type === "session_meta") {
          const git = asRecord(payload?.git);

          cwd = cwd ?? getString(payload?.cwd);
          gitBranch = gitBranch ?? getString(git?.branch);
          cliVersion = cliVersion ?? getString(payload?.cli_version);
          model = model ?? getString(payload?.model_provider);

          events.push(
            createEvent(sessionId, lineIndex, record, "meta", {
              text: extractText(payload),
              messageId: getString(payload?.id),
              kindType: type,
            }),
          );
          continue;
        }

        if (type === "turn_context") {
          model = getString(payload?.model) ?? model;
          cwd = getString(payload?.cwd) ?? cwd;

          events.push(
            createEvent(sessionId, lineIndex, record, "meta", {
              text: extractText(payload),
              model,
              kindType: type,
            }),
          );
          continue;
        }

        if (type === "response_item") {
          if (payloadType === "message") {
            const role = getString(payload?.role);
            const text = extractCodexText(record, payload);

            if (!title && role === "user" && text) {
              title = text.slice(0, 200);
            }

            events.push(
              createEvent(sessionId, lineIndex, record, resolveEventKind(payloadType, role), {
                role,
                text,
                model,
                isDelta: detectDelta(payloadType, payload),
                kindType: payloadType,
              }),
            );
            continue;
          }

          if (payloadType === "function_call" || payloadType === "custom_tool_call" || payloadType === "web_search_call") {
            const toolInput = payload?.arguments ?? payload?.input ?? payload?.query;

            events.push(
              createEvent(sessionId, lineIndex, record, "tool_call", {
                role: "assistant",
                toolName: getString(payload?.name),
                toolInput: toolInput ? JSON.stringify(toolInput) : null,
                model,
                messageId: getString(payload?.call_id) ?? getString(payload?.id),
                isDelta: detectDelta(payloadType, payload),
                kindType: payloadType,
              }),
            );
            continue;
          }

          if (
            payloadType === "function_call_output" ||
            payloadType === "custom_tool_call_output" ||
            payloadType === "web_search_call_output"
          ) {
            events.push(
              createEvent(sessionId, lineIndex, record, "tool_result", {
                role: "tool",
                toolOutput: extractText(payload?.output ?? payload?.result),
                parentId: getString(payload?.call_id),
                messageId: getString(payload?.call_id) ?? getString(payload?.id),
                model,
                isDelta: detectDelta(payloadType, payload),
                kindType: payloadType,
              }),
            );
            continue;
          }

          events.push(
            createEvent(sessionId, lineIndex, record, resolveEventKind(payloadType, null), {
              text: extractCodexText(record, payload),
              model,
              isDelta: detectDelta(payloadType, payload),
              kindType: payloadType,
              tokens: normalizeTokenUsage(payload?.usage ?? payload?.tokens ?? asRecord(payload?.data)?.usage),
            }),
          );
          continue;
        }

        if (type === "event_msg") {
          const messageType = payloadType;

          if (messageType === "token_count") {
            const { tokens, nextTotals } = extractTokenCountUsage(payload, previousCodexTotalUsage);
            previousCodexTotalUsage = nextTotals;

            events.push(
              createEvent(sessionId, lineIndex, record, "meta", {
                role: "meta",
                text: getString(payload?.text) ?? getString(payload?.message) ?? extractCodexText(record, payload),
                model,
                kindType: messageType,
                tokens,
              }),
            );
            continue;
          }

          if (messageType === "user_message") {
            const text = getString(payload?.message) ?? extractText(payload);
            if (!title && text) {
              title = text.slice(0, 200);
            }

            events.push(
              createEvent(sessionId, lineIndex, record, "user", {
                role: "user",
                text,
                model,
                kindType: messageType,
              }),
            );
            continue;
          }

          if (messageType === "agent_message") {
            events.push(
              createEvent(sessionId, lineIndex, record, "assistant", {
                role: "assistant",
                text: getString(payload?.message) ?? extractText(payload),
                model,
                kindType: messageType,
              }),
            );
            continue;
          }

          events.push(
            createEvent(sessionId, lineIndex, record, resolveEventKind(messageType, null), {
              text: getString(payload?.text) ?? getString(payload?.message) ?? extractCodexText(record, payload),
              model,
              kindType: messageType,
            }),
          );
          continue;
        }

        events.push(
          createEvent(sessionId, lineIndex, record, resolveEventKind(type, null), {
            text: extractCodexText(record, payload),
            model,
            kindType: type,
            isDelta: detectDelta(type, payload ?? asRecord(record)),
          }),
        );
      }

      if (events.length === 0) return null;

      return {
        sessionId,
        source: "codex",
        filePath: candidate.path,
        fileSizeBytes: candidate.size,
        metadata: {
          cwd,
          gitBranch,
          model,
          cliVersion,
          title,
        },
        events,
      };
    } catch {
      return null;
    }
  },
};

export const parseCodex = codexParser.parse;
