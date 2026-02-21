import type { SessionSource } from "@shared/schema";

export const SOURCE_LABELS: Record<SessionSource, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
  opencode: "OpenCode",
  droid: "Droid",
  copilot: "Copilot",
};

export const SOURCE_COLORS: Record<SessionSource, string> = {
  claude: "#f59e0b",
  codex: "#14b8a6",
  gemini: "#60a5fa",
  opencode: "#f97316",
  droid: "#34d399",
  copilot: "#f43f5e",
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
