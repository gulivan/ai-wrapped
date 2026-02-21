import type { SessionSource } from "@shared/schema";

export interface FileCandidate {
  path: string;
  source: SessionSource;
  mtime: number;
  size: number;
}

export interface AgentDiscoverer {
  source: SessionSource;
  discover(): Promise<FileCandidate[]>;
}
