import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SessionSource } from "../shared/schema";
import type { AppSettings } from "../shared/types";

export interface ScanStateEntry {
  source: SessionSource;
  fileSize: number;
  mtimeMs: number;
  parsedAt: string;
}

export type ScanStateStore = Record<string, ScanStateEntry>;

export interface DayStats {
  sessions: number;
  messages: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  costUsd: number;
  durationMs: number;
}

export interface DailyAggregateEntry {
  bySource: Record<string, DayStats>;
  byModel: Record<string, DayStats>;
  totals: DayStats;
}

export type DailyStore = Record<string, DailyAggregateEntry>;

const DATA_DIR = join(homedir(), ".ai-stats");
const SCAN_STATE_PATH = join(DATA_DIR, "scan-state.json");
const DAILY_PATH = join(DATA_DIR, "daily.json");
const SETTINGS_PATH = join(DATA_DIR, "settings.json");

const DEFAULT_SETTINGS: AppSettings = {
  scanOnLaunch: true,
  scanIntervalMinutes: 5,
  theme: "system",
  customPaths: {},
};

let scanStateCache: ScanStateStore | null = null;
let dailyCache: DailyStore | null = null;
let settingsCache: AppSettings | null = null;

const clone = <T>(value: T): T => structuredClone(value);

const ensureDataDir = () => {
  mkdirSync(DATA_DIR, { recursive: true });
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

const toStringOr = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.length > 0 ? value : fallback;

const readJson = async <T>(path: string, fallback: T): Promise<T> => {
  try {
    const text = await Bun.file(path).text();
    const parsed = JSON.parse(text) as unknown;
    return parsed as T;
  } catch {
    return fallback;
  }
};

const writeJson = async <T>(path: string, value: T): Promise<void> => {
  ensureDataDir();
  await Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
};

export const createEmptyDayStats = (): DayStats => ({
  sessions: 0,
  messages: 0,
  toolCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
  costUsd: 0,
  durationMs: 0,
});

const normalizeDayStats = (value: unknown): DayStats => {
  if (!isRecord(value)) {
    return createEmptyDayStats();
  }

  return {
    sessions: toNumber(value.sessions),
    messages: toNumber(value.messages),
    toolCalls: toNumber(value.toolCalls),
    inputTokens: toNumber(value.inputTokens),
    outputTokens: toNumber(value.outputTokens),
    cacheReadTokens: toNumber(value.cacheReadTokens),
    cacheWriteTokens: toNumber(value.cacheWriteTokens),
    reasoningTokens: toNumber(value.reasoningTokens),
    costUsd: toNumber(value.costUsd),
    durationMs: toNumber(value.durationMs),
  };
};

const normalizeDailyStore = (value: unknown): DailyStore => {
  if (!isRecord(value)) {
    return {};
  }

  const output: DailyStore = {};

  for (const [date, rawEntry] of Object.entries(value)) {
    if (!isRecord(rawEntry)) {
      continue;
    }

    const bySource: Record<string, DayStats> = {};
    if (isRecord(rawEntry.bySource)) {
      for (const [source, rawStats] of Object.entries(rawEntry.bySource)) {
        bySource[source] = normalizeDayStats(rawStats);
      }
    }

    const byModel: Record<string, DayStats> = {};
    if (isRecord(rawEntry.byModel)) {
      for (const [model, rawStats] of Object.entries(rawEntry.byModel)) {
        byModel[model] = normalizeDayStats(rawStats);
      }
    }

    output[date] = {
      bySource,
      byModel,
      totals: normalizeDayStats(rawEntry.totals),
    };
  }

  return output;
};

const normalizeScanState = (value: unknown): ScanStateStore => {
  if (!isRecord(value)) {
    return {};
  }

  const output: ScanStateStore = {};

  for (const [filePath, rawState] of Object.entries(value)) {
    if (!isRecord(rawState)) {
      continue;
    }

    const source = rawState.source;
    if (typeof source !== "string") {
      continue;
    }

    output[filePath] = {
      source: source as SessionSource,
      fileSize: toNumber(rawState.fileSize),
      mtimeMs: toNumber(rawState.mtimeMs),
      parsedAt: toStringOr(rawState.parsedAt, new Date(0).toISOString()),
    };
  }

  return output;
};

const normalizeSettings = (value: unknown): AppSettings => {
  if (!isRecord(value)) {
    return clone(DEFAULT_SETTINGS);
  }

  const customPathsInput = isRecord(value.customPaths) ? value.customPaths : {};
  const customPaths: AppSettings["customPaths"] = {};

  for (const [source, pathValue] of Object.entries(customPathsInput)) {
    if (typeof pathValue === "string") {
      customPaths[source as SessionSource] = pathValue;
    }
  }

  return {
    scanOnLaunch:
      typeof value.scanOnLaunch === "boolean" ? value.scanOnLaunch : DEFAULT_SETTINGS.scanOnLaunch,
    scanIntervalMinutes:
      typeof value.scanIntervalMinutes === "number" && Number.isFinite(value.scanIntervalMinutes)
        ? Math.max(1, Math.floor(value.scanIntervalMinutes))
        : DEFAULT_SETTINGS.scanIntervalMinutes,
    theme:
      value.theme === "system" || value.theme === "light" || value.theme === "dark"
        ? value.theme
        : DEFAULT_SETTINGS.theme,
    customPaths,
  };
};

export const readScanState = async (): Promise<ScanStateStore> => {
  if (scanStateCache === null) {
    const raw = await readJson<unknown>(SCAN_STATE_PATH, {});
    scanStateCache = normalizeScanState(raw);
  }

  return clone(scanStateCache);
};

export const writeScanState = async (state: ScanStateStore): Promise<void> => {
  scanStateCache = normalizeScanState(state);
  await writeJson(SCAN_STATE_PATH, scanStateCache);
};

export const readDailyStore = async (): Promise<DailyStore> => {
  if (dailyCache === null) {
    const raw = await readJson<unknown>(DAILY_PATH, {});
    dailyCache = normalizeDailyStore(raw);
  }

  return clone(dailyCache);
};

export const writeDailyStore = async (daily: DailyStore): Promise<void> => {
  dailyCache = normalizeDailyStore(daily);
  await writeJson(DAILY_PATH, dailyCache);
};

export const getSettings = async (): Promise<AppSettings> => {
  if (settingsCache === null) {
    const raw = await readJson<unknown>(SETTINGS_PATH, DEFAULT_SETTINGS);
    settingsCache = normalizeSettings(raw);
  }

  return clone(settingsCache);
};

export const setSettings = async (settings: AppSettings): Promise<void> => {
  settingsCache = normalizeSettings(settings);
  await writeJson(SETTINGS_PATH, settingsCache);
};

export const paths = {
  dataDir: DATA_DIR,
  scanState: SCAN_STATE_PATH,
  daily: DAILY_PATH,
  settings: SETTINGS_PATH,
};
