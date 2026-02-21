import { readFile } from "node:fs/promises";
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
      // Skip malformed lines and keep parsing remaining JSONL records.
    }
  }

  return records;
};

const extractClaudeMessageText = (content: unknown): string | null => {
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!Array.isArray(content)) {
    return extractText(content);
  }

  const chunks: string[] = [];
  for (const part of content) {
    const block = asRecord(part);
    if (!block) continue;

    const type = getString(block.type);
    if (type === "text") {
      const text = getString(block.text);
      if (text) chunks.push(text);
      continue;
    }

    if (type === "thinking") {
      const thinking = getString(block.thinking);
      if (thinking) chunks.push(thinking);
    }
  }

  const joined = chunks.join("\n").trim();
  return joined.length > 0 ? joined : null;
};

const buildBaseEvent = (
  record: Record<string, unknown>,
  sessionId: string,
  index: number,
  text: string | null,
  kindOverride?: SessionEvent["kind"],
): SessionEvent => {
  const message = asRecord(record.message);
  const rawType = getString(record.type);
  const role = getString(message?.role ?? record.role);
  const usage = asRecord(message?.usage);

  const tokens = usage
    ? normalizeTokenUsage({
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_read_input_tokens: usage.cache_read_input_tokens,
        cache_creation_input_tokens: usage.cache_creation_input_tokens,
      })
    : null;

  return {
    id: getString(record.uuid) ?? getString(message?.id) ?? `${sessionId}:claude:${index}`,
    sessionId,
    kind: kindOverride ?? resolveEventKind(rawType, role),
    timestamp: normalizeTimestamp(record.timestamp),
    role,
    text,
    toolName: null,
    toolInput: null,
    toolOutput: null,
    model: getString(message?.model),
    parentId: getString(record.parentUuid),
    messageId: getString(message?.id),
    isDelta: false,
    tokens,
    costUsd: null,
  };
};

const buildClaudeEvents = (record: Record<string, unknown>, sessionId: string, index: number): SessionEvent[] => {
  const events: SessionEvent[] = [];
  const message = asRecord(record.message);
  const content = message?.content;
  const rawType = getString(record.type);

  let baseText: string | null = null;
  if (rawType === "user" || rawType === "assistant") {
    baseText = extractClaudeMessageText(content);
  }

  if (!baseText) {
    baseText = extractText(content ?? message ?? record.summary ?? record.data);
  }

  const baseEvent = buildBaseEvent(record, sessionId, index, baseText);
  events.push(baseEvent);

  if (!Array.isArray(content)) {
    return events;
  }

  content.forEach((part, partIndex) => {
    const block = asRecord(part);
    if (!block) return;

    const partType = getString(block.type);
    if (partType === "tool_use") {
      events.push({
        ...baseEvent,
        id: `${baseEvent.id}:tool_use:${partIndex}`,
        kind: "tool_call",
        text: null,
        toolName: getString(block.name),
        toolInput: block.input ? JSON.stringify(block.input) : null,
        toolOutput: null,
        parentId: baseEvent.id,
        messageId: getString(block.id) ?? baseEvent.messageId,
        tokens: null,
      });
      return;
    }

    if (partType === "tool_result") {
      events.push({
        ...baseEvent,
        id: `${baseEvent.id}:tool_result:${partIndex}`,
        kind: "tool_result",
        text: null,
        toolName: null,
        toolInput: null,
        toolOutput: extractText(block.content),
        parentId: getString(block.tool_use_id) ?? baseEvent.parentId,
        messageId: getString(block.tool_use_id) ?? baseEvent.messageId,
        tokens: null,
      });
    }
  });

  return events;
};

export const claudeParser: SessionParser = {
  source: "claude",
  async parse(candidate: FileCandidate): Promise<RawParsedSession | null> {
    try {
      const content = await readFile(candidate.path, "utf8");
      const records = parseJsonl(content);
      if (records.length === 0) return null;

      const first = records[0] ?? {};
      const firstMessage = asRecord(first.message);

      const sessionId =
        getString(first.sessionId) ??
        records.map((record) => getString(record.sessionId)).find((value): value is string => Boolean(value)) ??
        candidate.path.split("/").pop()?.replace(/\.jsonl$/, "") ??
        `${Date.now()}`;

      const metadata = {
        cwd:
          getString(first.cwd) ??
          records.map((record) => getString(record.cwd)).find((value): value is string => Boolean(value)) ??
          null,
        gitBranch:
          getString(first.gitBranch) ??
          records.map((record) => getString(record.gitBranch)).find((value): value is string => Boolean(value)) ??
          null,
        model:
          getString(firstMessage?.model) ??
          records
            .map((record) => getString(asRecord(record.message)?.model))
            .find((value): value is string => Boolean(value)) ??
          null,
        cliVersion:
          getString(first.version) ??
          records.map((record) => getString(record.version)).find((value): value is string => Boolean(value)) ??
          null,
        title:
          records
            .map((record) => (getString(record.type) === "summary" ? getString(record.summary) : null))
            .find((value): value is string => Boolean(value)) ??
          null,
      };

      const events: SessionEvent[] = [];
      for (let index = 0; index < records.length; index += 1) {
        const record = records[index] ?? {};
        events.push(...buildClaudeEvents(record, sessionId, index));
      }

      if (events.length === 0) return null;

      return {
        sessionId,
        source: "claude",
        filePath: candidate.path,
        fileSizeBytes: candidate.size,
        metadata,
        events,
      };
    } catch {
      return null;
    }
  },
};

export const parseClaude = claudeParser.parse;
