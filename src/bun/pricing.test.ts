import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { __resetPricingStateForTests, computeCost, prefetchPricing } from "./pricing";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  __resetPricingStateForTests();
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("computeCost", () => {
  test("matches ccusage codex billing for cached input and reasoning output", () => {
    const cost = computeCost(
      {
        // Codex parser stores non-cached input and non-reasoning output separately.
        inputTokens: 500,
        outputTokens: 90,
        cacheReadTokens: 250,
        cacheWriteTokens: 0,
        reasoningTokens: 10,
      },
      "gpt-5-codex",
    );

    expect(cost).not.toBeNull();
    expect(cost ?? 0).toBeCloseTo(0.00165625, 12);
  });

  test("returns zero for openrouter free models", () => {
    const cost = computeCost(
      {
        inputTokens: 10_000,
        outputTokens: 2_000,
        cacheReadTokens: 500,
        cacheWriteTokens: 100,
        reasoningTokens: 200,
      },
      "openrouter/openai/gpt-5:free",
    );

    expect(cost).toBe(0);
  });

  test("falls back gpt-5.3-codex variants to gpt-5.2-codex pricing", () => {
    const usage = {
      inputTokens: 1_000,
      outputTokens: 120,
      cacheReadTokens: 300,
      cacheWriteTokens: 0,
      reasoningTokens: 30,
    };

    const cost53 = computeCost(usage, "gpt-5.3-codex-build-20260221");
    const cost52 = computeCost(usage, "gpt-5.2-codex-build-20260221");

    expect(cost53).not.toBeNull();
    expect(cost52).not.toBeNull();
    expect(cost53 ?? 0).toBeCloseTo(cost52 ?? 0, 12);
  });

  test("does not match unknown model names via remote substring", async () => {
    globalThis.fetch = ((async () =>
      new Response(
        JSON.stringify({
          "gpt-5": {
            input_cost_per_token: 0.00000125,
            output_cost_per_token: 0.00001,
            cache_read_input_token_cost: 0.000000125,
            cache_creation_input_token_cost: 0,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      )) as unknown) as typeof fetch;

    await prefetchPricing();

    const usage = {
      inputTokens: 1_000,
      outputTokens: 120,
      cacheReadTokens: 300,
      cacheWriteTokens: 0,
      reasoningTokens: 30,
    };

    expect(computeCost(usage, "gpt-5")).not.toBeNull();
    expect(computeCost(usage, "foo-gpt-5")).toBeNull();
  });

  test("does not retry remote pricing fetch during cooldown after failure", async () => {
    let fetchCalls = 0;
    globalThis.fetch = ((async () => {
      fetchCalls += 1;
      throw new Error("offline");
    }) as unknown) as typeof fetch;

    await prefetchPricing();
    await prefetchPricing();

    expect(fetchCalls).toBe(1);
  });
});
