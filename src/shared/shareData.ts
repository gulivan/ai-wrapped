import { SESSION_SOURCES, type SessionSource } from "./schema";
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";

export interface SharePayloadHourlyAgentBreakdown {
  source: SessionSource;
  label: string;
  sessions: number;
  tokens: number;
  costUsd: number;
}

export interface ShareSummaryAgentRow {
  source: SessionSource;
  label: string;
  percentage: number;
  tokens: number;
}

export interface ShareSummaryPayload {
  v: 1;
  range: string;
  dateFrom: string;
  dateTo: string;
  totalSessions: number;
  totalCostUsd: number;
  totalTokens: number;
  totalToolCalls: number;
  activeDays: number;
  dateSpanDays: number;
  longestStreakDays: number;
  topAgents: ShareSummaryAgentRow[];
}

export interface SharePayload {
  v: 1;
  range: string;
  dateFrom: string;
  dateTo: string;
  totalSessions: number;
  totalCostUsd: number;
  totalTokens: number;
  totalToolCalls: number;
  totalDurationMs: number;
  averageSessionDurationMs: number;
  longestSessionEstimateMs: number;
  currentStreakDays: number;
  currentStreakStartDate: string | null;
  activeDays: number;
  dateSpanDays: number;
  modelBreakdown: Array<{ model: string; tokens: number; sessions: number; costUsd: number }>;
  agentBreakdown: Array<{ source: SessionSource; label: string; tokens: number; sessions: number; costUsd: number }>;
  timeline: Array<{
    date: string;
    tokens: number;
    sessions: number;
    costUsd: number;
    durationMs: number;
    messages: number;
    toolCalls: number;
  }>;
  dailyAgentTokensByDate: Record<string, Record<SessionSource, number>>;
  dailyAgentCostsByDate: Record<string, Record<SessionSource, number>>;
  dailyModelCostsByDate: Record<string, Record<string, number>>;
  dailyAverageCostUsd: number;
  mostExpensiveDay: {
    date: string;
    tokens: number;
    sessions: number;
    costUsd: number;
    durationMs: number;
    messages: number;
    toolCalls: number;
  } | null;
  topRepos: Array<{ repo: string; sessions: number; tokens: number; costUsd: number; durationMs: number }>;
  hourlyBreakdown: Array<{
    hour: number;
    label: string;
    sessions: number;
    tokens: number;
    costUsd: number;
    durationMs: number;
    byAgent: SharePayloadHourlyAgentBreakdown[];
  }>;
  weekendSessionPercent: number;
  busiestDayOfWeek: string;
  busiestSingleDay: { date: string; tokens: number } | null;
}

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isSessionSource = (value: unknown): value is SessionSource =>
  typeof value === "string" && SESSION_SOURCES.includes(value as SessionSource);

const isTimelineRow = (value: unknown): value is SharePayload["timeline"][number] => {
  if (!isObjectRecord(value)) return false;

  return (
    typeof value.date === "string" &&
    isFiniteNumber(value.tokens) &&
    isFiniteNumber(value.sessions) &&
    isFiniteNumber(value.costUsd) &&
    isFiniteNumber(value.durationMs) &&
    isFiniteNumber(value.messages) &&
    isFiniteNumber(value.toolCalls)
  );
};

const isModelBreakdownRow = (value: unknown): value is SharePayload["modelBreakdown"][number] => {
  if (!isObjectRecord(value)) return false;

  return (
    typeof value.model === "string" &&
    isFiniteNumber(value.tokens) &&
    isFiniteNumber(value.sessions) &&
    isFiniteNumber(value.costUsd)
  );
};

const isAgentBreakdownRow = (value: unknown): value is SharePayload["agentBreakdown"][number] => {
  if (!isObjectRecord(value)) return false;

  return (
    isSessionSource(value.source) &&
    typeof value.label === "string" &&
    isFiniteNumber(value.tokens) &&
    isFiniteNumber(value.sessions) &&
    isFiniteNumber(value.costUsd)
  );
};

const isHourlyAgentBreakdownRow = (
  value: unknown,
): value is SharePayloadHourlyAgentBreakdown => {
  if (!isObjectRecord(value)) return false;

  return (
    isSessionSource(value.source) &&
    typeof value.label === "string" &&
    isFiniteNumber(value.sessions) &&
    isFiniteNumber(value.tokens) &&
    isFiniteNumber(value.costUsd)
  );
};

const isHourlyBreakdownRow = (value: unknown): value is SharePayload["hourlyBreakdown"][number] => {
  if (!isObjectRecord(value)) return false;

  return (
    isFiniteNumber(value.hour) &&
    typeof value.label === "string" &&
    isFiniteNumber(value.sessions) &&
    isFiniteNumber(value.tokens) &&
    isFiniteNumber(value.costUsd) &&
    isFiniteNumber(value.durationMs) &&
    Array.isArray(value.byAgent) &&
    value.byAgent.every((row) => isHourlyAgentBreakdownRow(row))
  );
};

const isTopRepoRow = (value: unknown): value is SharePayload["topRepos"][number] => {
  if (!isObjectRecord(value)) return false;

  return (
    typeof value.repo === "string" &&
    isFiniteNumber(value.sessions) &&
    isFiniteNumber(value.tokens) &&
    isFiniteNumber(value.costUsd) &&
    isFiniteNumber(value.durationMs)
  );
};

const isDailyAgentMap = (value: unknown): value is SharePayload["dailyAgentTokensByDate"] => {
  if (!isObjectRecord(value)) return false;

  return Object.values(value).every((entry) => {
    if (!isObjectRecord(entry)) return false;
    return Object.entries(entry).every(
      ([source, numericValue]) => isSessionSource(source) && isFiniteNumber(numericValue),
    );
  });
};

const isDailyModelMap = (value: unknown): value is SharePayload["dailyModelCostsByDate"] => {
  if (!isObjectRecord(value)) return false;

  return Object.values(value).every((entry) => {
    if (!isObjectRecord(entry)) return false;
    return Object.values(entry).every((numericValue) => isFiniteNumber(numericValue));
  });
};

const isBusiestSingleDay = (value: unknown): value is NonNullable<SharePayload["busiestSingleDay"]> => {
  if (!isObjectRecord(value)) return false;
  return typeof value.date === "string" && isFiniteNumber(value.tokens);
};

const isShareSummaryAgentRow = (value: unknown): value is ShareSummaryPayload["topAgents"][number] => {
  if (!isObjectRecord(value)) return false;

  return (
    isSessionSource(value.source) &&
    typeof value.label === "string" &&
    isFiniteNumber(value.percentage) &&
    isFiniteNumber(value.tokens)
  );
};

const isSharePayload = (value: unknown): value is SharePayload => {
  if (!isObjectRecord(value) || value.v !== 1) return false;

  return (
    typeof value.range === "string" &&
    typeof value.dateFrom === "string" &&
    typeof value.dateTo === "string" &&
    isFiniteNumber(value.totalSessions) &&
    isFiniteNumber(value.totalCostUsd) &&
    isFiniteNumber(value.totalTokens) &&
    isFiniteNumber(value.totalToolCalls) &&
    isFiniteNumber(value.totalDurationMs) &&
    isFiniteNumber(value.averageSessionDurationMs) &&
    isFiniteNumber(value.longestSessionEstimateMs) &&
    isFiniteNumber(value.currentStreakDays) &&
    (value.currentStreakStartDate === null || typeof value.currentStreakStartDate === "string") &&
    isFiniteNumber(value.activeDays) &&
    isFiniteNumber(value.dateSpanDays) &&
    Array.isArray(value.modelBreakdown) &&
    value.modelBreakdown.every((row) => isModelBreakdownRow(row)) &&
    Array.isArray(value.agentBreakdown) &&
    value.agentBreakdown.every((row) => isAgentBreakdownRow(row)) &&
    Array.isArray(value.timeline) &&
    value.timeline.every((row) => isTimelineRow(row)) &&
    isDailyAgentMap(value.dailyAgentTokensByDate) &&
    isDailyAgentMap(value.dailyAgentCostsByDate) &&
    isDailyModelMap(value.dailyModelCostsByDate) &&
    isFiniteNumber(value.dailyAverageCostUsd) &&
    (value.mostExpensiveDay === null || isTimelineRow(value.mostExpensiveDay)) &&
    Array.isArray(value.topRepos) &&
    value.topRepos.every((row) => isTopRepoRow(row)) &&
    Array.isArray(value.hourlyBreakdown) &&
    value.hourlyBreakdown.every((row) => isHourlyBreakdownRow(row)) &&
    isFiniteNumber(value.weekendSessionPercent) &&
    typeof value.busiestDayOfWeek === "string" &&
    (value.busiestSingleDay === null || isBusiestSingleDay(value.busiestSingleDay))
  );
};

const isShareSummaryPayload = (value: unknown): value is ShareSummaryPayload => {
  if (!isObjectRecord(value) || value.v !== 1) return false;

  return (
    typeof value.range === "string" &&
    typeof value.dateFrom === "string" &&
    typeof value.dateTo === "string" &&
    isFiniteNumber(value.totalSessions) &&
    isFiniteNumber(value.totalCostUsd) &&
    isFiniteNumber(value.totalTokens) &&
    isFiniteNumber(value.totalToolCalls) &&
    isFiniteNumber(value.activeDays) &&
    isFiniteNumber(value.dateSpanDays) &&
    (!("longestStreakDays" in value) || isFiniteNumber(value.longestStreakDays)) &&
    Array.isArray(value.topAgents) &&
    value.topAgents.every((row) => isShareSummaryAgentRow(row))
  );
};

const clampPercentage = (value: number): number => Math.max(0, Math.min(100, value));
const roundToOneDecimal = (value: number): number => Math.round(value * 10) / 10;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const computeLongestStreakDays = (timeline: SharePayload["timeline"]): number => {
  const activeDayTimestamps = Array.from(
    new Set(
      timeline
        .filter((entry) => entry.sessions > 0)
        .map((entry) => Date.parse(`${entry.date}T00:00:00Z`))
        .filter((timestamp) => Number.isFinite(timestamp)),
    ),
  ).sort((left, right) => left - right);

  if (activeDayTimestamps.length === 0) return 0;

  let longest = 1;
  let current = 1;
  for (let index = 1; index < activeDayTimestamps.length; index += 1) {
    const previous = activeDayTimestamps[index - 1];
    const currentValue = activeDayTimestamps[index];
    if (currentValue - previous === ONE_DAY_MS) {
      current += 1;
      longest = Math.max(longest, current);
      continue;
    }

    current = 1;
  }

  return longest;
};

export const toShareSummaryPayload = (payload: SharePayload): ShareSummaryPayload => {
  const tokenTotal = payload.agentBreakdown.reduce((sum, entry) => sum + Math.max(0, entry.tokens), 0);
  const sessionTotal = payload.agentBreakdown.reduce((sum, entry) => sum + Math.max(0, entry.sessions), 0);
  const useTokens = tokenTotal > 0;
  const denominator = useTokens ? tokenTotal : sessionTotal;

  const topAgents = payload.agentBreakdown
    .filter((entry) => entry.tokens > 0 || entry.sessions > 0)
    .sort((left, right) => {
      if (right.tokens !== left.tokens) return right.tokens - left.tokens;
      if (right.sessions !== left.sessions) return right.sessions - left.sessions;
      return right.costUsd - left.costUsd;
    })
    .slice(0, 3)
    .map((entry) => {
      const baseValue = useTokens ? entry.tokens : entry.sessions;
      const percentage =
        denominator > 0 ? roundToOneDecimal(clampPercentage((baseValue / denominator) * 100)) : 0;

      return {
        source: entry.source,
        label: entry.label,
        percentage,
        tokens: Math.max(0, entry.tokens),
      } satisfies ShareSummaryAgentRow;
    });

  return {
    v: 1,
    range: payload.range,
    dateFrom: payload.dateFrom,
    dateTo: payload.dateTo,
    totalSessions: payload.totalSessions,
    totalCostUsd: payload.totalCostUsd,
    totalTokens: payload.totalTokens,
    totalToolCalls: payload.totalToolCalls,
    activeDays: payload.activeDays,
    dateSpanDays: payload.dateSpanDays,
    longestStreakDays: computeLongestStreakDays(payload.timeline),
    topAgents,
  };
};

export const encodeShareData = (payload: SharePayload): string =>
  compressToEncodedURIComponent(JSON.stringify(payload));

export const encodeShareSummaryData = (payload: ShareSummaryPayload): string =>
  compressToEncodedURIComponent(JSON.stringify(payload));

export const decodeShareData = (hash: string): SharePayload | null => {
  if (typeof hash !== "string" || hash.length === 0) return null;

  const encoded = hash.startsWith("#") ? hash.slice(1) : hash;
  if (encoded.length === 0) return null;

  const decompressed = decompressFromEncodedURIComponent(encoded);
  if (!decompressed) return null;

  try {
    const parsed: unknown = JSON.parse(decompressed);
    if (!isSharePayload(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const decodeShareSummaryData = (encoded: string): ShareSummaryPayload | null => {
  if (typeof encoded !== "string" || encoded.length === 0) return null;

  const normalized = encoded.replaceAll(" ", "+");
  const decompressed = decompressFromEncodedURIComponent(normalized);
  if (!decompressed) return null;

  try {
    const parsed: unknown = JSON.parse(decompressed);
    if (!isShareSummaryPayload(parsed)) return null;

    const longestStreakDays = Math.max(
      0,
      Math.round(
        isFiniteNumber((parsed as { longestStreakDays?: unknown }).longestStreakDays)
          ? ((parsed as { longestStreakDays: number }).longestStreakDays ?? 0)
          : 0,
      ),
    );

    return {
      ...parsed,
      longestStreakDays,
    };
  } catch {
    return null;
  }
};
