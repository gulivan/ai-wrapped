import type { TokenUsage } from "../shared/schema";

export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
  cacheReadPer1M: number;
  cacheWritePer1M: number;
  inputPer1MAbove200k?: number;
  outputPer1MAbove200k?: number;
  cacheReadPer1MAbove200k?: number;
  cacheWritePer1MAbove200k?: number;
}

interface LiteLLMModelPricing {
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_creation_input_token_cost?: number;
  cache_read_input_token_cost?: number;
  input_cost_per_token_above_200k_tokens?: number;
  output_cost_per_token_above_200k_tokens?: number;
  cache_creation_input_token_cost_above_200k_tokens?: number;
  cache_read_input_token_cost_above_200k_tokens?: number;
}

const LITELLM_PRICING_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const MILLION = 1_000_000;
const TIERED_THRESHOLD = 200_000;
const PRICING_REFRESH_MS = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 2_500;

export const PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-6": { inputPer1M: 15, outputPer1M: 75, cacheReadPer1M: 1.5, cacheWritePer1M: 18.75 },
  "claude-opus-4-5-20251101": { inputPer1M: 15, outputPer1M: 75, cacheReadPer1M: 1.5, cacheWritePer1M: 18.75 },
  "claude-sonnet-4-20250514": { inputPer1M: 3, outputPer1M: 15, cacheReadPer1M: 0.3, cacheWritePer1M: 3.75 },
  "claude-3-5-sonnet-20241022": { inputPer1M: 3, outputPer1M: 15, cacheReadPer1M: 0.3, cacheWritePer1M: 3.75 },
  "claude-3-5-haiku-20241022": { inputPer1M: 0.8, outputPer1M: 4, cacheReadPer1M: 0.08, cacheWritePer1M: 1 },

  "gpt-5": { inputPer1M: 1.25, outputPer1M: 10, cacheReadPer1M: 0.125, cacheWritePer1M: 0 },
  "gpt-5.2-codex": { inputPer1M: 1.25, outputPer1M: 10, cacheReadPer1M: 0.125, cacheWritePer1M: 0 },
  "gpt-5-codex": { inputPer1M: 1.25, outputPer1M: 10, cacheReadPer1M: 0.125, cacheWritePer1M: 0 },
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10, cacheReadPer1M: 1.25, cacheWritePer1M: 0 },
  o1: { inputPer1M: 15, outputPer1M: 60, cacheReadPer1M: 7.5, cacheWritePer1M: 0 },
  o3: { inputPer1M: 10, outputPer1M: 40, cacheReadPer1M: 2.5, cacheWritePer1M: 0 },

  "gemini-2.5-pro": { inputPer1M: 1.25, outputPer1M: 10, cacheReadPer1M: 0.315, cacheWritePer1M: 4.5 },
  "gemini-2.5-flash": { inputPer1M: 0.15, outputPer1M: 0.6, cacheReadPer1M: 0.0375, cacheWritePer1M: 1 },
};

const FREE_MODEL_PRICING: ModelPricing = {
  inputPer1M: 0,
  outputPer1M: 0,
  cacheReadPer1M: 0,
  cacheWritePer1M: 0,
};

const MODEL_ALIASES = new Map<string, string>([
  ["gpt-5-codex", "gpt-5"],
  ["gpt-5.3-codex", "gpt-5.2-codex"],
]);

const PROVIDER_PREFIXES = ["anthropic/", "openai/", "azure/", "openrouter/openai/"];

let liteLLMPricingCache: Map<string, LiteLLMModelPricing> | null = null;
let modelPricingCache = new Map<string, ModelPricing>();
let lastPricingRefreshAt = 0;
let pricingRefreshPromise: Promise<void> | null = null;

export const __resetPricingStateForTests = (): void => {
  liteLLMPricingCache = null;
  modelPricingCache = new Map();
  lastPricingRefreshAt = 0;
  pricingRefreshPromise = null;
};

const applyModelAlias = (model: string): string => {
  const gpt53Remapped = model.toLowerCase().replace(/gpt-5\.3-codex/g, "gpt-5.2-codex");
  const directAlias = MODEL_ALIASES.get(gpt53Remapped);
  return directAlias ?? gpt53Remapped;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const toPerMillion = (value: unknown, fallback?: unknown): number => {
  const perToken = isFiniteNumber(value) ? value : isFiniteNumber(fallback) ? fallback : 0;
  return perToken * MILLION;
};

const toOptionalPerMillion = (value: unknown): number | undefined => {
  if (!isFiniteNumber(value)) return undefined;
  return value * MILLION;
};

const normalizeLiteLLMEntry = (value: unknown): LiteLLMModelPricing | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const pricing: LiteLLMModelPricing = {};

  const assignIfFinite = <K extends keyof LiteLLMModelPricing>(key: K, sourceValue: unknown): void => {
    if (isFiniteNumber(sourceValue)) {
      pricing[key] = sourceValue;
    }
  };

  assignIfFinite("input_cost_per_token", record.input_cost_per_token);
  assignIfFinite("output_cost_per_token", record.output_cost_per_token);
  assignIfFinite("cache_creation_input_token_cost", record.cache_creation_input_token_cost);
  assignIfFinite("cache_read_input_token_cost", record.cache_read_input_token_cost);
  assignIfFinite("input_cost_per_token_above_200k_tokens", record.input_cost_per_token_above_200k_tokens);
  assignIfFinite("output_cost_per_token_above_200k_tokens", record.output_cost_per_token_above_200k_tokens);
  assignIfFinite(
    "cache_creation_input_token_cost_above_200k_tokens",
    record.cache_creation_input_token_cost_above_200k_tokens,
  );
  assignIfFinite(
    "cache_read_input_token_cost_above_200k_tokens",
    record.cache_read_input_token_cost_above_200k_tokens,
  );

  if (Object.keys(pricing).length === 0) {
    return null;
  }

  return pricing;
};

const toLiteLLMPricingMap = (raw: unknown): Map<string, LiteLLMModelPricing> => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return new Map();
  }

  const output = new Map<string, LiteLLMModelPricing>();

  for (const [modelName, modelData] of Object.entries(raw as Record<string, unknown>)) {
    const normalized = normalizeLiteLLMEntry(modelData);
    if (!normalized) continue;

    output.set(modelName.toLowerCase(), normalized);
  }

  return output;
};

const refreshPricingCache = async (): Promise<void> => {
  const response = await fetch(LITELLM_PRICING_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch pricing data (${response.status} ${response.statusText})`);
  }

  const payload = (await response.json()) as unknown;
  const dataset = toLiteLLMPricingMap(payload);
  if (dataset.size === 0) {
    throw new Error("LiteLLM pricing payload did not contain any usable model rates");
  }

  liteLLMPricingCache = dataset;
  modelPricingCache = new Map();
  lastPricingRefreshAt = Date.now();
};

const shouldRefreshPricing = (): boolean => {
  if (lastPricingRefreshAt === 0) return true;
  return Date.now() - lastPricingRefreshAt >= PRICING_REFRESH_MS;
};

export const prefetchPricing = async (): Promise<void> => {
  if (!shouldRefreshPricing()) return;
  if (pricingRefreshPromise) {
    await pricingRefreshPromise;
    return;
  }

  pricingRefreshPromise = (async () => {
    try {
      await refreshPricingCache();
    } catch {
      // Keep local fallback pricing when remote pricing fetch fails.
      lastPricingRefreshAt = Date.now();
    } finally {
      pricingRefreshPromise = null;
    }
  })();

  await pricingRefreshPromise;
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

const isOpenRouterFreeModel = (model: string): boolean => {
  const normalized = model.trim().toLowerCase();
  return normalized === "openrouter/free" || (normalized.startsWith("openrouter/") && normalized.endsWith(":free"));
};

const toModelPricing = (pricing: LiteLLMModelPricing): ModelPricing => ({
  inputPer1M: toPerMillion(pricing.input_cost_per_token),
  outputPer1M: toPerMillion(pricing.output_cost_per_token),
  cacheReadPer1M: toPerMillion(pricing.cache_read_input_token_cost, pricing.input_cost_per_token),
  cacheWritePer1M: toPerMillion(pricing.cache_creation_input_token_cost),
  inputPer1MAbove200k: toOptionalPerMillion(pricing.input_cost_per_token_above_200k_tokens),
  outputPer1MAbove200k: toOptionalPerMillion(pricing.output_cost_per_token_above_200k_tokens),
  cacheReadPer1MAbove200k: toOptionalPerMillion(pricing.cache_read_input_token_cost_above_200k_tokens),
  cacheWritePer1MAbove200k: toOptionalPerMillion(pricing.cache_creation_input_token_cost_above_200k_tokens),
});

const findLiteLLMPricing = (model: string): LiteLLMModelPricing | null => {
  if (!liteLLMPricingCache) return null;

  const normalizedModel = model.toLowerCase();
  const aliasedModel = applyModelAlias(normalizedModel);
  const candidates = new Set<string>([normalizedModel, aliasedModel]);

  for (const candidate of Array.from(candidates)) {
    const directAlias = MODEL_ALIASES.get(candidate);
    if (directAlias) {
      candidates.add(directAlias);
      candidates.add(applyModelAlias(directAlias));
    }

    for (const prefix of PROVIDER_PREFIXES) {
      candidates.add(`${prefix}${candidate}`);
    }
  }

  for (const candidate of candidates) {
    const pricing = liteLLMPricingCache.get(candidate);
    if (pricing) {
      return pricing;
    }
  }

  return null;
};

const resolveModelPricing = (model: string): ModelPricing | null => {
  const normalizedModel = model.toLowerCase().trim();
  if (normalizedModel.length === 0) return null;
  const aliasedModel = applyModelAlias(normalizedModel);

  if (isOpenRouterFreeModel(normalizedModel)) {
    return FREE_MODEL_PRICING;
  }

  const cached = modelPricingCache.get(normalizedModel) ?? modelPricingCache.get(aliasedModel);
  if (cached) return cached;

  const liteLLMMatch = findLiteLLMPricing(normalizedModel);
  const resolved = liteLLMMatch
    ? toModelPricing(liteLLMMatch)
    : PRICING[aliasedModel] ?? findPricingByPrefix(aliasedModel) ?? PRICING[normalizedModel] ?? findPricingByPrefix(normalizedModel);

  if (resolved) {
    modelPricingCache.set(normalizedModel, resolved);
    if (aliasedModel !== normalizedModel) {
      modelPricingCache.set(aliasedModel, resolved);
    }
  }

  return resolved ?? null;
};

const calculateTieredCost = (tokens: number, basePer1M: number, tieredPer1M?: number): number => {
  if (!Number.isFinite(tokens) || tokens <= 0) return 0;

  if (Number.isFinite(tieredPer1M) && tokens > TIERED_THRESHOLD) {
    const below = Math.min(tokens, TIERED_THRESHOLD);
    const above = Math.max(0, tokens - TIERED_THRESHOLD);
    const baseCost = (below * basePer1M) / MILLION;
    const tieredCost = (above * (tieredPer1M as number)) / MILLION;
    return baseCost + tieredCost;
  }

  return (tokens * basePer1M) / MILLION;
};

export const computeCost = (tokens: TokenUsage | null, model: string | null): number | null => {
  if (!tokens || !model) return null;
  const pricing = resolveModelPricing(model);
  if (!pricing) return null;

  // Codex reports reasoning tokens separately, but they're billed as output tokens.
  const billableOutputTokens = Math.max(0, tokens.outputTokens + tokens.reasoningTokens);

  return (
    calculateTieredCost(tokens.inputTokens, pricing.inputPer1M, pricing.inputPer1MAbove200k) +
    calculateTieredCost(billableOutputTokens, pricing.outputPer1M, pricing.outputPer1MAbove200k) +
    calculateTieredCost(tokens.cacheReadTokens, pricing.cacheReadPer1M, pricing.cacheReadPer1MAbove200k) +
    calculateTieredCost(tokens.cacheWriteTokens, pricing.cacheWritePer1M, pricing.cacheWritePer1MAbove200k)
  );
};
