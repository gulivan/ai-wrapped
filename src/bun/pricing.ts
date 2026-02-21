import type { TokenUsage } from "@shared/schema";

export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
  cacheReadPer1M: number;
  cacheWritePer1M: number;
}

export const PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-6": { inputPer1M: 15, outputPer1M: 75, cacheReadPer1M: 1.5, cacheWritePer1M: 18.75 },
  "claude-opus-4-5-20251101": { inputPer1M: 15, outputPer1M: 75, cacheReadPer1M: 1.5, cacheWritePer1M: 18.75 },
  "claude-sonnet-4-20250514": { inputPer1M: 3, outputPer1M: 15, cacheReadPer1M: 0.3, cacheWritePer1M: 3.75 },
  "claude-3-5-sonnet-20241022": { inputPer1M: 3, outputPer1M: 15, cacheReadPer1M: 0.3, cacheWritePer1M: 3.75 },
  "claude-3-5-haiku-20241022": { inputPer1M: 0.8, outputPer1M: 4, cacheReadPer1M: 0.08, cacheWritePer1M: 1 },

  "gpt-5.2-codex": { inputPer1M: 2, outputPer1M: 8, cacheReadPer1M: 0.5, cacheWritePer1M: 0 },
  "gpt-5.3-codex": { inputPer1M: 2, outputPer1M: 8, cacheReadPer1M: 0.5, cacheWritePer1M: 0 },
  "gpt-5-codex": { inputPer1M: 2, outputPer1M: 8, cacheReadPer1M: 0.5, cacheWritePer1M: 0 },
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10, cacheReadPer1M: 1.25, cacheWritePer1M: 0 },
  o1: { inputPer1M: 15, outputPer1M: 60, cacheReadPer1M: 7.5, cacheWritePer1M: 0 },
  o3: { inputPer1M: 10, outputPer1M: 40, cacheReadPer1M: 2.5, cacheWritePer1M: 0 },

  "gemini-2.5-pro": { inputPer1M: 1.25, outputPer1M: 10, cacheReadPer1M: 0.315, cacheWritePer1M: 4.5 },
  "gemini-2.5-flash": { inputPer1M: 0.15, outputPer1M: 0.6, cacheReadPer1M: 0.0375, cacheWritePer1M: 1 },
};

const findPricingByPrefix = (model: string): ModelPricing | null => {
  const normalizedModel = model.toLowerCase();
  const keys = Object.keys(PRICING).sort((a, b) => b.length - a.length);

  for (const key of keys) {
    if (normalizedModel === key || normalizedModel.startsWith(`${key}-`)) {
      return PRICING[key] ?? null;
    }
  }

  return null;
};

export const computeCost = (tokens: TokenUsage | null, model: string | null): number | null => {
  if (!tokens || !model) return null;
  const pricing = PRICING[model.toLowerCase()] ?? findPricingByPrefix(model);
  if (!pricing) return null;

  return (
    (tokens.inputTokens * pricing.inputPer1M) / 1_000_000 +
    (tokens.outputTokens * pricing.outputPer1M) / 1_000_000 +
    (tokens.cacheReadTokens * pricing.cacheReadPer1M) / 1_000_000 +
    (tokens.cacheWriteTokens * pricing.cacheWritePer1M) / 1_000_000
  );
};
