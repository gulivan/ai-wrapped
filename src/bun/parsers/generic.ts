import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { SessionSource } from "@shared/schema";
import type { FileCandidate } from "../discovery";
import type { SessionEvent } from "../session-schema";
import { extractText, normalizeTimestamp, normalizeTokenUsage, resolveEventKind } from "../normalizer";
import type { RawParsedSession } from "./types";

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const parseJsonlRecords = (content: string): Array<Record<string, unknown>> => {
  const records: Array<Record<string, unknown>> = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const record = asRecord(parsed);
      if (record) records.push(record);
    } catch {
      // Skip malformed lines.
    }
  }
  return records;
};

const parseJsonOrJsonl = (path: string, content: string): Array<Record<string, unknown>> => {
  const trimmed = content.trim();
  if (trimmed.length === 0) return [];

  if (path.endsWith(".jsonl")) return parseJsonlRecords(content);

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    if (Array.isArray(parsed)) {
      return parsed.map(asRecord).filter((record): record is Record<string, unknown> => Boolean(record));
    }

    const record = asRecord(parsed);
    if (!record) return [];

    // Gemini-style single JSON session payload.
    if (Array.isArray(record.messages)) {
      const header = {
        _kind: "json_header",
        sessionId: record.sessionId,
        cwd: record.cwd,
        startTime: record.startTime,
        lastUpdated: record.lastUpdated,
      } satisfies Record<string, unknown>;

      const messageRecords = record.messages
        .map(asRecord)
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .map((entry) => ({
          ...entry,
          _kind: "json_message",
        }));

      return [header, ...messageRecords];
    }

    return [record];
  } catch {
    // If `.json` fails as a single JSON object, try JSONL fallback.
    return parseJsonlRecords(content);
  }
};

const deriveSessionId = (candidate: FileCandidate, records: Array<Record<string, unknown>>): string => {
  for (const record of records) {
    const direct = [record.sessionId, record.id, record.uuid];
    for (const value of direct) {
      if (typeof value === "string" && value.trim().length > 0) {
        return value;
      }
    }

    const payload = asRecord(record.payload);
    const payloadId = payload?.id;
    if (typeof payloadId === "string" && payloadId.trim().length > 0) {
      return payloadId;
    }
  }

  return basename(candidate.path).replace(/\.[^.]+$/, "");
};

const getFirstString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
};

const isDeltaEvent = (type: unknown, payload: Record<string, unknown> | null): boolean => {
  if (typeof type === "string" && type.toLowerCase().includes("delta")) return true;
  if (!payload) return false;

  if (typeof payload.isDelta === "boolean") return payload.isDelta;
  if (payload.delta !== undefined || payload.content_delta !== undefined) return true;

  const content = payload.content;
  if (Array.isArray(content)) {
    return content.some((part) => {
      const entry = asRecord(part);
      if (!entry) return false;
      const entryType = entry.type;
      return typeof entryType === "string" && entryType.toLowerCase().includes("delta");
    });
  }

  return false;
};

const buildEventFromRecord = (
  record: Record<string, unknown>,
  sessionId: string,
  lineIndex: number,
  modelFallback: string | null,
): SessionEvent => {
  const payload = asRecord(record.payload);
  const message = asRecord(record.message);

  const rawType = getFirstString(
    record.type,
    payload?.type,
    message?.type,
    (record._kind as string | undefined) ?? null,
  );
  const role = getFirstString(record.role, payload?.role, message?.role);

  const text = extractText(
    payload?.content ??
      payload?.message ??
      message?.content ??
      record.content ??
      record.text ??
      record.summary ??
      payload?.summary,
  );

  const messageId = getFirstString(
    record.messageId,
    record.message_id,
    record.id,
    payload?.id,
    payload?.call_id,
    message?.id,
  );

  const eventId =
    getFirstString(record.uuid, record.id, message?.id, payload?.id, payload?.call_id, messageId) ??
    `${sessionId}:generic:${lineIndex}`;

  const toolInputValue = payload?.arguments ?? payload?.input ?? record.toolInput ?? message?.input;
  const toolOutputValue = payload?.output ?? payload?.result ?? record.toolOutput ?? message?.output;

  const tokens = normalizeTokenUsage(payload?.tokens ?? payload?.usage ?? message?.usage ?? record.tokens);

  return {
    id: eventId,
    sessionId,
    kind: resolveEventKind(rawType, role),
    timestamp: normalizeTimestamp(record.timestamp ?? payload?.timestamp ?? message?.timestamp ?? record.time),
    role,
    text,
    toolName: getFirstString(payload?.name, record.toolName, message?.name),
    toolInput: toolInputValue ? JSON.stringify(toolInputValue) : null,
    toolOutput: toolOutputValue ? extractText(toolOutputValue) : null,
    model: getFirstString(record.model, payload?.model, message?.model, modelFallback),
    parentId: getFirstString(record.parentId, record.parentUuid, payload?.parent_id, message?.parentId),
    messageId,
    isDelta: isDeltaEvent(rawType, payload),
    tokens,
    costUsd: null,
  };
};

export const parseGeneric = async (
  candidate: FileCandidate,
  source: SessionSource = candidate.source,
): Promise<RawParsedSession | null> => {
  try {
    const content = await readFile(candidate.path, "utf8");
    const records = parseJsonOrJsonl(candidate.path, content);
    if (records.length === 0) return null;

    const sessionId = deriveSessionId(candidate, records);

    let cwd: string | null = null;
    let gitBranch: string | null = null;
    let model: string | null = null;
    let cliVersion: string | null = null;
    let title: string | null = null;

    const events: SessionEvent[] = [];

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index] ?? {};
      const payload = asRecord(record.payload);

      cwd = cwd ?? getFirstString(record.cwd, payload?.cwd);
      gitBranch = gitBranch ?? getFirstString(record.gitBranch, payload?.gitBranch, asRecord(payload?.git)?.branch);
      model = model ?? getFirstString(record.model, payload?.model);
      cliVersion = cliVersion ?? getFirstString(record.version, payload?.cli_version, payload?.copilotVersion);
      title = title ?? getFirstString(record.title, record.summary);

      const event = buildEventFromRecord(record, sessionId, index, model);
      events.push(event);
    }

    if (events.length === 0) return null;

    return {
      sessionId,
      source,
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
};
