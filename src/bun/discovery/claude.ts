import type { AgentDiscoverer } from "./types";
import { dedupeCandidates, expandHome, scanGlobCandidates } from "./utils";

const CLAUDE_ROOT = expandHome("~/.claude/projects");

export const claudeDiscoverer: AgentDiscoverer = {
  source: "claude",
  async discover() {
    const [mainSessions, subagentSessions] = await Promise.all([
      scanGlobCandidates(CLAUDE_ROOT, "*/*.jsonl", "claude", 100),
      scanGlobCandidates(CLAUDE_ROOT, "*/*/subagents/agent-*.jsonl", "claude", 100),
    ]);

    return dedupeCandidates([...mainSessions, ...subagentSessions]);
  },
};

export const discoverClaude = claudeDiscoverer.discover;
