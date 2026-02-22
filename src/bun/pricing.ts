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

interface ModelsDevProviderPricingEntry {
  providerId: string;
  pricing: ModelPricing;
}

interface ModelsDevPricingDataset {
  byProviderModel: Map<string, ModelPricing>;
  byModel: Map<string, ModelsDevProviderPricingEntry[]>;
}

const MODELS_DEV_PRICING_URL = "https://models.dev/api.json";
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
]);

const PROVIDER_PREFIXES = [
  "anthropic/",
  "openai/",
  "google/",
  "xai/",
  "x-ai/",
  "azure/",
  "vertex/",
  "openrouter/",
  "openrouter/openai/",
  "openrouter/anthropic/",
  "openrouter/google/",
  "openrouter/x-ai/",
];

const PROVIDER_PRIORITY_ORDER = [
  "openai",
  "anthropic",
  "google",
  "xai",
  "x-ai",
  "deepseek",
  "mistral",
  "cohere",
  "meta",
  "alibaba",
  "amazon-bedrock",
  "azure",
  "vertex",
  "openrouter",
];

const PROVIDER_PRIORITY_RANK = new Map<string, number>(
  PROVIDER_PRIORITY_ORDER.map((providerId, index) => [providerId, index]),
);

let modelsDevPricingCache: ModelsDevPricingDataset | null = null;
let modelPricingCache = new Map<string, ModelPricing>();
let lastPricingRefreshAt = 0;
let pricingRefreshPromise: Promise<void> | null = null;

export const __resetPricingStateForTests = (): void => {
  modelsDevPricingCache = null;
  modelPricingCache = new Map();
  lastPricingRefreshAt = 0;
  pricingRefreshPromise = null;
};

const applyModelAlias = (model: string): string => {
  const normalized = model.toLowerCase();
  const directAlias = MODEL_ALIASES.get(normalized);
  return directAlias ?? normalized;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const normalizeModelsDevCost = (value: unknown): ModelPricing | null => {
  const record = asRecord(value);
  if (!record) return null;

  const input = record.input;
  const output = record.output;
  if (!isFiniteNumber(input) || !isFiniteNumber(output)) {
    return null;
  }

  return {
    inputPer1M: input,
    outputPer1M: output,
    cacheReadPer1M: isFiniteNumber(record.cache_read) ? record.cache_read : 0,
    cacheWritePer1M: isFiniteNumber(record.cache_write) ? record.cache_write : 0,
  };
};

const upsertProviderModelPricing = (
  byModel: Map<string, ModelsDevProviderPricingEntry[]>,
  modelId: string,
  providerId: string,
  pricing: ModelPricing,
): void => {
  const existing = byModel.get(modelId) ?? [];
  const next = { providerId, pricing };
  const index = existing.findIndex((entry) => entry.providerId === providerId);
  if (index >= 0) {
    existing[index] = next;
  } else {
    existing.push(next);
  }
  byModel.set(modelId, existing);
};

const toModelsDevPricingDataset = (raw: unknown): ModelsDevPricingDataset => {
  const root = asRecord(raw);
  const byProviderModel = new Map<string, ModelPricing>();
  const byModel = new Map<string, ModelsDevProviderPricingEntry[]>();

  if (!root) {
    return { byProviderModel, byModel };
  }

  for (const [providerKey, providerData] of Object.entries(root)) {
    const providerRecord = asRecord(providerData);
    if (!providerRecord) continue;

    const providerIdRaw =
      typeof providerRecord.id === "string" && providerRecord.id.trim().length > 0
        ? providerRecord.id
        : providerKey;
    const providerId = providerIdRaw.toLowerCase();

    const modelsRecord = asRecord(providerRecord.models);
    if (!modelsRecord) continue;

    for (const [modelKey, modelData] of Object.entries(modelsRecord)) {
      const modelRecord = asRecord(modelData);
      if (!modelRecord) continue;

      const modelIdRaw =
        typeof modelRecord.id === "string" && modelRecord.id.trim().length > 0
          ? modelRecord.id
          : modelKey;
      const modelId = modelIdRaw.toLowerCase();

      const pricing = normalizeModelsDevCost(modelRecord.cost);
      if (!pricing) continue;

      byProviderModel.set(`${providerId}/${modelId}`, pricing);
      upsertProviderModelPricing(byModel, modelId, providerId, pricing);
    }
  }

  return { byProviderModel, byModel };
};

const refreshPricingCache = async (): Promise<void> => {
  const response = await fetch(MODELS_DEV_PRICING_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch pricing data (${response.status} ${response.statusText})`);
  }

  const payload = (await response.json()) as unknown;
  const dataset = toModelsDevPricingDataset(payload);
  if (dataset.byProviderModel.size === 0) {
    throw new Error("Models.dev pricing payload did not contain any usable model rates");
  }

  modelsDevPricingCache = dataset;
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

const buildModelCandidates = (model: string): string[] => {
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
      if (candidate.startsWith(prefix) && candidate.length > prefix.length) {
        candidates.add(candidate.slice(prefix.length));
      }
    }
  }

  return Array.from(candidates).filter((candidate) => candidate.length > 0);
};

const splitProviderModel = (value: string): { providerId: string; modelId: string } | null => {
  const slashIndex = value.indexOf("/");
  if (slashIndex <= 0 || slashIndex >= value.length - 1) return null;

  return {
    providerId: value.slice(0, slashIndex),
    modelId: value.slice(slashIndex + 1),
  };
};

const providerPriority = (providerId: string): number => PROVIDER_PRIORITY_RANK.get(providerId) ?? 10_000;

const selectPreferredProviderPricing = (
  options: ModelsDevProviderPricingEntry[],
  providerHint?: string,
): ModelsDevProviderPricingEntry | null => {
  if (options.length === 0) return null;

  let best: ModelsDevProviderPricingEntry | null = null;
  let bestRank = Number.POSITIVE_INFINITY;

  for (const option of options) {
    const rank = providerHint && option.providerId === providerHint ? -1 : providerPriority(option.providerId);
    if (!best || rank < bestRank || (rank === bestRank && option.providerId < best.providerId)) {
      best = option;
      bestRank = rank;
    }
  }

  return best;
};

const findModelsDevPricing = (model: string): ModelPricing | null => {
  if (!modelsDevPricingCache) return null;

  const candidates = buildModelCandidates(model);

  for (const candidate of candidates) {
    const split = splitProviderModel(candidate);
    if (!split) continue;

    const exact = modelsDevPricingCache.byProviderModel.get(`${split.providerId}/${split.modelId}`);
    if (exact) return exact;
  }

  const lookupCandidates: Array<{ modelId: string; providerHint?: string }> = [];
  const seen = new Set<string>();
  const pushLookupCandidate = (modelId: string, providerHint?: string): void => {
    const key = `${providerHint ?? ""}|${modelId}`;
    if (seen.has(key)) return;
    seen.add(key);
    lookupCandidates.push({ modelId, providerHint });
  };

  for (const candidate of candidates) {
    pushLookupCandidate(candidate);

    const split = splitProviderModel(candidate);
    if (split) {
      pushLookupCandidate(split.modelId, split.providerId);
    }
  }

  let best: ModelsDevProviderPricingEntry | null = null;
  let bestRank = Number.POSITIVE_INFINITY;

  for (const lookup of lookupCandidates) {
    const options = modelsDevPricingCache.byModel.get(lookup.modelId);
    if (!options || options.length === 0) continue;

    const selected = selectPreferredProviderPricing(options, lookup.providerHint);
    if (!selected) continue;

    const rank =
      lookup.providerHint && selected.providerId === lookup.providerHint ? -1 : providerPriority(selected.providerId);

    if (!best || rank < bestRank || (rank === bestRank && selected.providerId < best.providerId)) {
      best = selected;
      bestRank = rank;
    }

    if (bestRank === -1) break;
  }

  return best?.pricing ?? null;
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

  const modelsDevMatch = findModelsDevPricing(normalizedModel);
  const resolved = modelsDevMatch
    ? modelsDevMatch
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
