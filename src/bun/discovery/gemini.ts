import type { AgentDiscoverer } from "./types";
import { expandHome, scanGlobCandidates } from "./utils";

const GEMINI_ROOT = expandHome("~/.gemini/tmp");

export const geminiDiscoverer: AgentDiscoverer = {
  source: "gemini",
  async discover() {
    return scanGlobCandidates(GEMINI_ROOT, "*/chats/session-*.json", "gemini");
  },
};

export const discoverGemini = geminiDiscoverer.discover;
