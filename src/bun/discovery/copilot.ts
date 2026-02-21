import type { AgentDiscoverer } from "./types";
import { expandHome, scanGlobCandidates } from "./utils";

const COPILOT_ROOT = expandHome("~/.copilot/session-state");

export const copilotDiscoverer: AgentDiscoverer = {
  source: "copilot",
  async discover() {
    return scanGlobCandidates(COPILOT_ROOT, "*.jsonl", "copilot");
  },
};

export const discoverCopilot = copilotDiscoverer.discover;
