import type { AgentDiscoverer } from "./types";
import { expandHome, scanGlobCandidates } from "./utils";

const OPENCODE_STORAGE_ROOT = expandHome("~/.local/share/opencode/storage");

export const opencodeDiscoverer: AgentDiscoverer = {
  source: "opencode",
  async discover() {
    return scanGlobCandidates(OPENCODE_STORAGE_ROOT, "session/*/*.json", "opencode");
  },
};

export const discoverOpencode = opencodeDiscoverer.discover;
