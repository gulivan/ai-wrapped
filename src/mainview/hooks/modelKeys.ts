import type { DashboardSummary } from "@shared/schema";

export const collectModelKeys = (models: DashboardSummary["byModel"]): string[] => {
  const keys: string[] = [];
  const seen = new Set<string>();

  for (const entry of models) {
    const raw = entry.model;
    if (raw.trim().length === 0 || seen.has(raw)) continue;
    seen.add(raw);
    keys.push(raw);
  }

  return keys;
};
