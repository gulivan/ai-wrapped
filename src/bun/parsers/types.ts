import type { SessionSource } from "@shared/schema";
import type { SessionEvent } from "../session-schema";
import type { FileCandidate } from "../discovery";

export interface RawParsedSession {
  sessionId: string;
  source: SessionSource;
  filePath: string;
  fileSizeBytes: number;
  metadata: {
    cwd: string | null;
    gitBranch: string | null;
    model: string | null;
    cliVersion: string | null;
    title: string | null;
  };
  events: SessionEvent[];
}

export interface SessionParser {
  source: SessionSource;
  parse(candidate: FileCandidate): Promise<RawParsedSession | null>;
}
