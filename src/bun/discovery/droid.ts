import type { AgentDiscoverer } from "./types";
import { expandHome, scanGlobCandidates } from "./utils";

const DROID_ROOT = expandHome("~/.factory/sessions");

export const droidDiscoverer: AgentDiscoverer = {
  source: "droid",
  async discover() {
    return scanGlobCandidates(DROID_ROOT, "*.jsonl", "droid");
  },
};

export const discoverDroid = droidDiscoverer.discover;
