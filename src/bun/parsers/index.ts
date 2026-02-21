import type { SessionSource } from "../../shared/schema";
import type { FileCandidate } from "../discovery";
import { claudeParser } from "./claude";
import { codexParser } from "./codex";
import { parseCopilot } from "./copilot";
import { parseDroid } from "./droid";
import { parseGemini } from "./gemini";
import { parseGeneric } from "./generic";
import { parseOpencode } from "./opencode";
import type { RawParsedSession, SessionParser } from "./types";

const PARSERS: Record<SessionSource, SessionParser["parse"]> = {
  claude: claudeParser.parse,
  codex: codexParser.parse,
  gemini: parseGemini,
  opencode: parseOpencode,
  droid: parseDroid,
  copilot: parseCopilot,
};

export const parseFile = async (candidate: FileCandidate): Promise<RawParsedSession | null> => {
  try {
    const parser = PARSERS[candidate.source];
    const parsed = await parser(candidate);
    if (parsed) return parsed;
    return await parseGeneric(candidate, candidate.source);
  } catch (error) {
    console.error(`[parse] Failed ${candidate.source} ${candidate.path}`, error);
    try {
      return await parseGeneric(candidate, candidate.source);
    } catch {
      return null;
    }
  }
};

export type { RawParsedSession } from "./types";
