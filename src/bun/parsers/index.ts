import type { SessionSource } from "../../shared/schema";
import type { FileCandidate } from "../discovery";
import {
  parseAmp,
  parseCodebuff,
  parseGoose,
  parseHermes,
  parseKilo,
  parseKimi,
  parseOpenclaw,
  parsePi,
  parseQwen,
} from "./additional";
import { claudeParser } from "./claude";
import { codexParser } from "./codex";
import { parseCopilot } from "./copilot";
import { parseDroid } from "./droid";
import { parseGemini } from "./gemini";
import { parseGeneric } from "./generic";
import { parseOpencode } from "./opencode";
import type { RawParsedSession, SessionParser } from "./types";

type FileParser = (candidate: FileCandidate) => Promise<RawParsedSession | RawParsedSession[] | null>;

const PARSERS: Record<SessionSource, FileParser> = {
  claude: claudeParser.parse,
  codex: codexParser.parse,
  gemini: parseGemini,
  opencode: parseOpencode,
  droid: parseDroid,
  copilot: parseCopilot,
  amp: parseAmp,
  codebuff: parseCodebuff,
  goose: parseGoose,
  hermes: parseHermes,
  kilo: parseKilo,
  kimi: parseKimi,
  openclaw: parseOpenclaw,
  pi: parsePi,
  qwen: parseQwen,
};

export const parseFile = async (candidate: FileCandidate): Promise<RawParsedSession[]> => {
  try {
    const parser = PARSERS[candidate.source];
    const parsed = await parser(candidate);
    if (parsed) return Array.isArray(parsed) ? parsed : [parsed];
    const generic = await parseGeneric(candidate, candidate.source);
    return generic ? [generic] : [];
  } catch (error) {
    console.error(`[parse] Failed ${candidate.source} ${candidate.path}`, error);
    try {
      const generic = await parseGeneric(candidate, candidate.source);
      return generic ? [generic] : [];
    } catch {
      return [];
    }
  }
};

export type { RawParsedSession } from "./types";
