import type { AgentDiscoverer, FileCandidate } from "./types";
import { dedupeCandidates, expandHome, scanGlobCandidates } from "./utils";

const scanMany = async (
  roots: Array<{ root: string; pattern: string }>,
  source: AgentDiscoverer["source"],
): Promise<FileCandidate[]> => {
  const results = await Promise.all(
    roots.map(({ root, pattern }) => scanGlobCandidates(expandHome(root), pattern, source, 1)),
  );
  return dedupeCandidates(results.flat());
};

export const ampDiscoverer: AgentDiscoverer = {
  source: "amp",
  discover: () => scanMany([{ root: "~/.local/share/amp", pattern: "threads/T-*.json" }], "amp"),
};

export const codebuffDiscoverer: AgentDiscoverer = {
  source: "codebuff",
  discover: () =>
    scanMany(
      ["manicode", "manicode-dev", "manicode-staging"].map((channel) => ({
        root: `~/.config/${channel}/projects`,
        pattern: "*/*/*/chat-messages.json",
      })),
      "codebuff",
    ),
};

export const gooseDiscoverer: AgentDiscoverer = {
  source: "goose",
  discover: () =>
    scanMany(
      [
        { root: "~/.local/share/goose/sessions", pattern: "sessions.db" },
        { root: "~/Library/Application Support/goose/sessions", pattern: "sessions.db" },
        { root: "~/.local/share/Block/goose/sessions", pattern: "sessions.db" },
      ],
      "goose",
    ),
};

export const hermesDiscoverer: AgentDiscoverer = {
  source: "hermes",
  discover: () => scanMany([{ root: "~/.hermes", pattern: "state.db" }], "hermes"),
};

export const kiloDiscoverer: AgentDiscoverer = {
  source: "kilo",
  discover: () => scanMany([{ root: "~/.local/share/kilo", pattern: "kilo.db" }], "kilo"),
};

export const kimiDiscoverer: AgentDiscoverer = {
  source: "kimi",
  discover: () =>
    scanMany(
      [
        { root: "~/.kimi/sessions", pattern: "*/*/wire.jsonl" },
        { root: "~/.kimi/sessions", pattern: "*/*/agents/*/wire.jsonl" },
        { root: "~/.kimi-code/sessions", pattern: "*/*/wire.jsonl" },
        { root: "~/.kimi-code/sessions", pattern: "*/*/agents/*/wire.jsonl" },
      ],
      "kimi",
    ),
};

export const openclawDiscoverer: AgentDiscoverer = {
  source: "openclaw",
  discover: () =>
    scanMany(
      ["~/.openclaw", "~/.clawdbot", "~/.moltbot", "~/.moldbot"].map((root) => ({
        root,
        pattern: "**/*.jsonl*",
      })),
      "openclaw",
    ),
};

export const piDiscoverer: AgentDiscoverer = {
  source: "pi",
  discover: () => scanMany([{ root: "~/.pi/agent/sessions", pattern: "**/*.jsonl" }], "pi"),
};

export const qwenDiscoverer: AgentDiscoverer = {
  source: "qwen",
  discover: () => scanMany([{ root: "~/.qwen/projects", pattern: "*/chats/*.jsonl" }], "qwen"),
};
