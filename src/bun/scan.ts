import type { SessionSource } from "@shared/schema";
import type { DB } from "./db";
import { discoverAll } from "./discovery";
import { normalizeSession } from "./normalizer";
import { parseFile } from "./parsers";

export interface ScanOptions {
  fullScan?: boolean;
  sources?: SessionSource[];
}

export interface ScanResult {
  scanned: number;
  total: number;
  errors: number;
}

export const runScan = async (db: DB, options: ScanOptions = {}): Promise<ScanResult> => {
  const candidates = await discoverAll(options.sources);

  const changed = options.fullScan
    ? candidates
    : candidates.filter((candidate) => {
        const state = db.getScanState(candidate.path);
        return !state || state.mtime_ms !== candidate.mtime || state.file_size !== candidate.size;
      });

  let scanned = 0;
  let errors = 0;
  const affectedDates = new Set<string>();

  for (const candidate of changed) {
    const parsed = await parseFile(candidate);

    if (!parsed) {
      errors += 1;
      db.upsertScanState({
        file_path: candidate.path,
        source: candidate.source,
        file_size: candidate.size,
        mtime_ms: candidate.mtime,
        parsed_at: new Date().toISOString(),
        session_id: null,
      });
      continue;
    }

    const { session, events } = normalizeSession(parsed);

    db.upsertSession(session);
    db.deleteSessionEvents(session.id);
    db.insertEvents(events);
    db.upsertScanState({
      file_path: candidate.path,
      source: candidate.source,
      file_size: candidate.size,
      mtime_ms: candidate.mtime,
      parsed_at: session.parsedAt,
      session_id: session.id,
    });

    if (session.startTime) {
      affectedDates.add(session.startTime.slice(0, 10));
    }

    scanned += 1;
  }

  if (affectedDates.size === 0 && options.fullScan && changed.length > 0) {
    db.rebuildDailyAggregates();
  } else {
    for (const date of affectedDates) {
      db.rebuildDailyAggregates(date);
    }
  }

  return {
    scanned,
    total: candidates.length,
    errors,
  };
};
