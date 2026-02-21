import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SessionSource } from "@shared/schema";
import type { FileCandidate } from "./types";

export const expandHome = (path: string): string => {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
};

export const scanGlobCandidates = async (
  cwd: string,
  pattern: string,
  source: SessionSource,
  minBytes = 0,
): Promise<FileCandidate[]> => {
  const files: FileCandidate[] = [];

  try {
    const glob = new Bun.Glob(pattern);
    for await (const path of glob.scan({ cwd, absolute: true, onlyFiles: true })) {
      const stats = await stat(path).catch(() => null);
      if (!stats || !stats.isFile()) continue;
      if (stats.size < minBytes) continue;
      files.push({
        path,
        source,
        mtime: stats.mtimeMs,
        size: stats.size,
      });
    }
  } catch {
    return [];
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
};

export const dedupeCandidates = (candidates: FileCandidate[]): FileCandidate[] => {
  const byPath = new Map<string, FileCandidate>();
  for (const candidate of candidates) {
    byPath.set(candidate.path, candidate);
  }
  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
};
