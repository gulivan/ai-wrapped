import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { SessionSource, TokenUsage } from "../../shared/schema";
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

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const extractCostUsd = (
  record: Record<string, unknown>,
  payload: Record<string, unknown> | null,
  message: Record<string, unknown> | null,
): number | null => {
  const candidates: unknown[] = [
    record.costUSD,
    record.costUsd,
    record.cost_usd,
    record.total_cost_usd,
    payload?.costUSD,
    payload?.costUsd,
    payload?.cost_usd,
    payload?.total_cost_usd,
    message?.costUSD,
    message?.costUsd,
    message?.cost_usd,
    getNested(record, ["cost", "total_cost_usd"]),
    getNested(record, ["cost", "usd"]),
    getNested(payload, ["cost", "total_cost_usd"]),
    getNested(payload, ["cost", "usd"]),
    getNested(payload, ["info", "costUSD"]),
    getNested(payload, ["info", "costUsd"]),
    getNested(payload, ["info", "cost_usd"]),
    getNested(payload, ["info", "total_cost_usd"]),
    getNested(payload, ["info", "last_cost_usd"]),
  ];

  for (const candidate of candidates) {
    const parsed = toFiniteNumber(candidate);
    if (parsed !== null) return parsed;
  }

  return null;
};

const tokenUsageTotal = (tokens: TokenUsage): number =>
  tokens.inputTokens +
  tokens.outputTokens +
  tokens.cacheReadTokens +
  tokens.cacheWriteTokens +
  tokens.reasoningTokens;

const subtractTokenUsage = (current: TokenUsage, previous: TokenUsage | null): TokenUsage => ({
  inputTokens: Math.max(0, current.inputTokens - (previous?.inputTokens ?? 0)),
  outputTokens: Math.max(0, current.outputTokens - (previous?.outputTokens ?? 0)),
  cacheReadTokens: Math.max(0, current.cacheReadTokens - (previous?.cacheReadTokens ?? 0)),
  cacheWriteTokens: Math.max(0, current.cacheWriteTokens - (previous?.cacheWriteTokens ?? 0)),
  reasoningTokens: Math.max(0, current.reasoningTokens - (previous?.reasoningTokens ?? 0)),
});

const toTokenCountEventUsage = (tokens: TokenUsage | null): TokenUsage | null => {
  if (!tokens) return null;

  const normalized: TokenUsage = {
    inputTokens: Math.max(0, tokens.inputTokens - tokens.cacheReadTokens),
    outputTokens: Math.max(0, tokens.outputTokens - tokens.reasoningTokens),
    cacheReadTokens: tokens.cacheReadTokens,
    cacheWriteTokens: tokens.cacheWriteTokens,
    reasoningTokens: tokens.reasoningTokens,
  };

  return tokenUsageTotal(normalized) > 0 ? normalized : null;
};

const isTokenCountType = (rawType: string | null): boolean => {
  if (!rawType) return false;
  return rawType.toLowerCase() === "token_count";
};

const extractTokenCountUsage = (
  payload: Record<string, unknown> | null,
  previousTotals: TokenUsage | null,
  previousTotalCostUsd: number | null,
): {
  shouldOverrideTokens: boolean;
  tokens: SessionEvent["tokens"];
  nextTotals: TokenUsage | null;
  costUsd: number | null;
  nextTotalCostUsd: number | null;
} => {
  const info = asRecord(payload?.info);
  const totalUsage = normalizeTokenUsage(info?.total_token_usage);
  const lastUsage = normalizeTokenUsage(info?.last_token_usage);
  const totalCostUsd = toFiniteNumber(
    info?.total_cost_usd ??
      info?.totalCostUsd ??
      info?.totalCostUSD ??
      getNested(info, ["total_cost", "usd"]) ??
      payload?.total_cost_usd ??
      payload?.totalCostUsd ??
      payload?.totalCostUSD ??
      getNested(payload, ["total_cost", "usd"]),
  );
  const lastCostUsd = toFiniteNumber(
    info?.last_cost_usd ??
      info?.lastCostUsd ??
      info?.lastCostUSD ??
      getNested(info, ["last_cost", "usd"]) ??
      payload?.last_cost_usd ??
      payload?.lastCostUsd ??
      payload?.lastCostUSD ??
      payload?.cost_usd ??
      payload?.costUsd ??
      payload?.costUSD ??
      getNested(payload, ["last_cost", "usd"]) ??
      getNested(payload, ["cost", "usd"]) ??
      payload?.cost,
  );

  const resolveCostFromTokenCount = (): { costUsd: number | null; nextTotalCostUsd: number | null } => {
    if (totalCostUsd !== null) {
      if (previousTotalCostUsd !== null) {
        return {
          costUsd: Math.max(0, totalCostUsd - previousTotalCostUsd),
          nextTotalCostUsd: totalCostUsd,
        };
      }

      return {
        costUsd: Math.max(0, totalCostUsd),
        nextTotalCostUsd: totalCostUsd,
      };
    }

    if (lastCostUsd !== null) {
      return {
        costUsd: Math.max(0, lastCostUsd),
        nextTotalCostUsd: previousTotalCostUsd,
      };
    }

    return {
      costUsd: null,
      nextTotalCostUsd: previousTotalCostUsd,
    };
  };

  if (totalUsage) {
    const deltaUsage = subtractTokenUsage(totalUsage, previousTotals);
    const deltaTokens = toTokenCountEventUsage(deltaUsage);
    const { costUsd, nextTotalCostUsd } = resolveCostFromTokenCount();
    if (deltaTokens) {
      return { shouldOverrideTokens: true, tokens: deltaTokens, costUsd, nextTotals: totalUsage, nextTotalCostUsd };
    }

    if (!previousTotals && lastUsage) {
      return {
        shouldOverrideTokens: true,
        tokens: toTokenCountEventUsage(lastUsage),
        costUsd,
        nextTotals: totalUsage,
        nextTotalCostUsd,
      };
    }

    return { shouldOverrideTokens: true, tokens: null, costUsd, nextTotals: totalUsage, nextTotalCostUsd };
  }

  if (lastUsage) {
    const { costUsd, nextTotalCostUsd } = resolveCostFromTokenCount();
    return {
      shouldOverrideTokens: true,
      tokens: toTokenCountEventUsage(lastUsage),
      costUsd,
      nextTotals: previousTotals,
      nextTotalCostUsd,
    };
  }

  const { costUsd, nextTotalCostUsd } = resolveCostFromTokenCount();
  return {
    shouldOverrideTokens: false,
    tokens: null,
    costUsd,
    nextTotals: previousTotals,
    nextTotalCostUsd,
  };
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
  previousTokenCountTotals: TokenUsage | null,
  previousTokenCountTotalCostUsd: number | null,
): {
  event: SessionEvent;
  nextTokenCountTotals: TokenUsage | null;
  nextTokenCountTotalCostUsd: number | null;
} => {
  const payload = asRecord(record.payload);
  const message = asRecord(record.message);

  const rawType = getFirstString(
    record.type,
    payload?.type,
    message?.type,
    (record._kind as string | undefined) ?? null,
  );
  const payloadType = getFirstString(payload?.type, message?.type);
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
  const isTokenCount = isTokenCountType(payloadType) || isTokenCountType(rawType);
  const tokenCountUsage = isTokenCount
    ? extractTokenCountUsage(payload, previousTokenCountTotals, previousTokenCountTotalCostUsd)
    : {
        shouldOverrideTokens: false,
        tokens: null,
        costUsd: null,
        nextTotals: previousTokenCountTotals,
        nextTotalCostUsd: previousTokenCountTotalCostUsd,
      };
  const tokensPayload =
    payload?.tokens ??
    payload?.usage ??
    getNested(payload, ["info", "last_token_usage"]) ??
    getNested(payload, ["completion", "usage"]) ??
    message?.usage ??
    message?.tokens ??
    record.tokens ??
    record.usage ??
    getNested(record, ["completion", "usage"]) ??
    getNested(record, ["data", "usage"]);
  const fallbackTokens = normalizeTokenUsage(tokensPayload);
  const tokens = tokenCountUsage.shouldOverrideTokens ? tokenCountUsage.tokens : fallbackTokens;
  const fallbackCostUsd = extractCostUsd(record, payload, message);
  const costUsd = isTokenCount ? tokenCountUsage.costUsd : fallbackCostUsd;

  return {
    nextTokenCountTotals: tokenCountUsage.nextTotals,
    nextTokenCountTotalCostUsd: tokenCountUsage.nextTotalCostUsd,
    event: {
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
      costUsd,
    },
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
    let previousTokenCountTotals: TokenUsage | null = null;
    let previousTokenCountTotalCostUsd: number | null = null;

    const events: SessionEvent[] = [];

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index] ?? {};
      const payload = asRecord(record.payload);

      cwd = cwd ?? getFirstString(record.cwd, payload?.cwd);
      gitBranch = gitBranch ?? getFirstString(record.gitBranch, payload?.gitBranch, asRecord(payload?.git)?.branch);
      model = model ?? getFirstString(record.model, payload?.model);
      cliVersion = cliVersion ?? getFirstString(record.version, payload?.cli_version, payload?.copilotVersion);
      title = title ?? getFirstString(record.title, record.summary);

      const { event, nextTokenCountTotals, nextTokenCountTotalCostUsd } = buildEventFromRecord(
        record,
        sessionId,
        index,
        model,
        previousTokenCountTotals,
        previousTokenCountTotalCostUsd,
      );
      previousTokenCountTotals = nextTokenCountTotals;
      previousTokenCountTotalCostUsd = nextTokenCountTotalCostUsd;
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
