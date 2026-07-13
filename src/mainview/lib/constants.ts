import type { SessionSource } from "@shared/schema";

export const SOURCE_LABELS: Record<SessionSource, string> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini",
  opencode: "OpenCode",
  droid: "Droid",
  copilot: "Copilot",
  amp: "Amp",
  codebuff: "Codebuff",
  goose: "Goose",
  hermes: "Hermes",
  kilo: "Kilo",
  kimi: "Kimi",
  openclaw: "OpenClaw",
  pi: "pi",
  qwen: "Qwen Code",
};

export const SOURCE_COLORS: Record<SessionSource, string> = {
  claude: "#f59e0b",
  codex: "#14b8a6",
  gemini: "#60a5fa",
  opencode: "#f97316",
  droid: "#34d399",
  copilot: "#f43f5e",
  amp: "#a78bfa",
  codebuff: "#fb7185",
  goose: "#22c55e",
  hermes: "#e879f9",
  kilo: "#facc15",
  kimi: "#fb923c",
  openclaw: "#38bdf8",
  pi: "#94a3b8",
  qwen: "#2dd4bf",
};

export const CHART_COLORS = [
  "#7dd3fc",
  "#86efac",
  "#fca5a5",
  "#fcd34d",
  "#c4b5fd",
  "#fdba74",
  "#67e8f9",
  "#f9a8d4",
];

export const DEFAULT_PAGE_SIZE = 20;
