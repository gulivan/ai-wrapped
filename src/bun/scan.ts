import type { SessionSource } from "../shared/schema";
import {
  aggregateSessionsByDate,
  mergeDailyAggregates,
  resolveAggregationTimeZone,
} from "./aggregator";
import { discoverAll } from "./discovery";
import { normalizeSession } from "./normalizer";
import { parseFile } from "./parsers";
import type { Session } from "./session-schema";
import {
  dailyStoreNeedsTimeZoneBackfill,
  readDailyStore,
  readScanState,
  writeAggregationMeta,
  writeDailyStore,
  writeScanState,
} from "./store";
import { prefetchPricing } from "./pricing";

export interface ScanOptions {
  fullScan?: boolean;
  sources?: SessionSource[];
  timeZone?: string;
}

export interface ScanResult {
  scanned: number;
  total: number;
  errors: number;
}

export const runScan = async (options: ScanOptions = {}): Promise<ScanResult> => {
  await prefetchPricing();
  const aggregationTimeZone = resolveAggregationTimeZone(options.timeZone);
  const shouldFullScan =
    Boolean(options.fullScan) || (await dailyStoreNeedsTimeZoneBackfill(aggregationTimeZone));
  const candidates = await discoverAll(options.sources);
  const scanState = await readScanState();

  const changed = shouldFullScan
    ? candidates
    : candidates.filter((candidate) => {
        const state = scanState[candidate.path];
        return !state || state.mtimeMs !== candidate.mtime || state.fileSize !== candidate.size;
      });

  let scanned = 0;
  let errors = 0;
  const sessions: Session[] = [];

  for (const candidate of changed) {
    const parsedSessions = await parseFile(candidate);

    if (parsedSessions.length === 0) {
      errors += 1;
      scanState[candidate.path] = {
        source: candidate.source,
        fileSize: candidate.size,
        mtimeMs: candidate.mtime,
        parsedAt: new Date().toISOString(),
      };
      continue;
    }

    for (const parsed of parsedSessions) {
      const { session } = normalizeSession(parsed);
      sessions.push(session);
    }

    scanState[candidate.path] = {
      source: candidate.source,
      fileSize: candidate.size,
      mtimeMs: candidate.mtime,
      parsedAt: new Date().toISOString(),
    };

    scanned += 1;
  }

  await writeScanState(scanState);

  if (shouldFullScan) {
    await writeDailyStore(aggregateSessionsByDate(sessions, { timeZone: aggregationTimeZone }));
    await writeAggregationMeta(aggregationTimeZone);
  } else if (sessions.length > 0) {
    const existingDaily = await readDailyStore();
    const nextDaily = mergeDailyAggregates(
      existingDaily,
      aggregateSessionsByDate(sessions, { timeZone: aggregationTimeZone }),
    );
    await writeDailyStore(nextDaily);
    await writeAggregationMeta(aggregationTimeZone);
  }

  return {
    scanned,
    total: candidates.length,
    errors,
  };
};
