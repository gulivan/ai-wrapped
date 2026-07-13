import type { SessionSource } from "../../shared/schema";
import {
  ampDiscoverer,
  codebuffDiscoverer,
  gooseDiscoverer,
  hermesDiscoverer,
  kiloDiscoverer,
  kimiDiscoverer,
  openclawDiscoverer,
  piDiscoverer,
  qwenDiscoverer,
} from "./additional";
import { claudeDiscoverer } from "./claude";
import { codexDiscoverer } from "./codex";
import { copilotDiscoverer } from "./copilot";
import { droidDiscoverer } from "./droid";
import { geminiDiscoverer } from "./gemini";
import { opencodeDiscoverer } from "./opencode";
import type { AgentDiscoverer, FileCandidate } from "./types";

const DISCOVERERS: AgentDiscoverer[] = [
  claudeDiscoverer,
  codexDiscoverer,
  geminiDiscoverer,
  opencodeDiscoverer,
  droidDiscoverer,
  copilotDiscoverer,
  ampDiscoverer,
  codebuffDiscoverer,
  gooseDiscoverer,
  hermesDiscoverer,
  kiloDiscoverer,
  kimiDiscoverer,
  openclawDiscoverer,
  piDiscoverer,
  qwenDiscoverer,
];

export const discoverAll = async (sources?: SessionSource[]): Promise<FileCandidate[]> => {
  const discoverers = sources?.length
    ? DISCOVERERS.filter((discoverer) => sources.includes(discoverer.source))
    : DISCOVERERS;

  const results = await Promise.all(discoverers.map((discoverer) => discoverer.discover().catch(() => [])));
  return results.flat().sort((a, b) => a.path.localeCompare(b.path));
};

export type { FileCandidate } from "./types";
