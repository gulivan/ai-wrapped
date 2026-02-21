import { join } from "node:path";
import type { AgentDiscoverer } from "./types";
import { expandHome, scanGlobCandidates } from "./utils";

const resolveCodexRoot = (): string => {
  const codexHome = process.env.CODEX_HOME;
  if (codexHome && codexHome.trim().length > 0) {
    return join(codexHome, "sessions");
  }
  return expandHome("~/.codex/sessions");
};

export const codexDiscoverer: AgentDiscoverer = {
  source: "codex",
  async discover() {
    return scanGlobCandidates(resolveCodexRoot(), "????/??/??/rollout-*.jsonl", "codex");
  },
};

export const discoverCodex = codexDiscoverer.discover;
