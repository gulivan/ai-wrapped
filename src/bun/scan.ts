import type { SessionSource } from "@shared/schema";
import { aggregateSessionsByDate, mergeDailyAggregates } from "./aggregator";
import { discoverAll } from "./discovery";
import { normalizeSession } from "./normalizer";
import { parseFile } from "./parsers";
import type { Session } from "./session-schema";
import { readDailyStore, readScanState, writeDailyStore, writeScanState } from "./store";

export interface ScanOptions {
  fullScan?: boolean;
  sources?: SessionSource[];
}

export interface ScanResult {
  scanned: number;
  total: number;
  errors: number;
}

export const runScan = async (options: ScanOptions = {}): Promise<ScanResult> => {
  const candidates = await discoverAll(options.sources);
  const scanState = await readScanState();

  const changed = options.fullScan
    ? candidates
    : candidates.filter((candidate) => {
        const state = scanState[candidate.path];
        return !state || state.mtimeMs !== candidate.mtime || state.fileSize !== candidate.size;
      });

  let scanned = 0;
  let errors = 0;
  const sessions: Session[] = [];

  for (const candidate of changed) {
    const parsed = await parseFile(candidate);

    if (!parsed) {
      errors += 1;
      scanState[candidate.path] = {
        source: candidate.source,
        fileSize: candidate.size,
        mtimeMs: candidate.mtime,
        parsedAt: new Date().toISOString(),
      };
      continue;
    }

    const { session } = normalizeSession(parsed);
    sessions.push(session);

    scanState[candidate.path] = {
      source: candidate.source,
      fileSize: candidate.size,
      mtimeMs: candidate.mtime,
      parsedAt: session.parsedAt,
    };

    scanned += 1;
  }

  await writeScanState(scanState);

  if (options.fullScan) {
    await writeDailyStore(aggregateSessionsByDate(sessions));
  } else if (sessions.length > 0) {
    const existingDaily = await readDailyStore();
    const nextDaily = mergeDailyAggregates(existingDaily, aggregateSessionsByDate(sessions));
    await writeDailyStore(nextDaily);
  }

  return {
    scanned,
    total: candidates.length,
    errors,
  };
};
