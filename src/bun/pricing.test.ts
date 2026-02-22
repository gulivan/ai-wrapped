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

  test("does not remap gpt-5.3-codex to gpt-5.2-codex pricing", async () => {
    globalThis.fetch = ((async () =>
      new Response(
        JSON.stringify({
          openai: {
            id: "openai",
            models: {
              "gpt-5.2-codex": {
                id: "gpt-5.2-codex",
                cost: {
                  input: 9,
                  output: 27,
                  cache_read: 0,
                  cache_write: 0,
                },
              },
            },
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

    const cost53 = computeCost(usage, "gpt-5.3-codex");
    const cost52 = computeCost(usage, "gpt-5.2-codex");

    expect(cost53).toBeNull();
    expect(cost52).not.toBeNull();
  });

  test("does not match unknown model names via remote substring", async () => {
    globalThis.fetch = ((async () =>
      new Response(
        JSON.stringify({
          openai: {
            id: "openai",
            models: {
              "gpt-5": {
                id: "gpt-5",
                cost: {
                  input: 1.25,
                  output: 10,
                  cache_read: 0.125,
                  cache_write: 0,
                },
              },
            },
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

  test("prefers exact provider/model pricing for provider-qualified model names", async () => {
    globalThis.fetch = ((async () =>
      new Response(
        JSON.stringify({
          openai: {
            id: "openai",
            models: {
              "gpt-5": {
                id: "gpt-5",
                cost: {
                  input: 1,
                  output: 1,
                  cache_read: 0,
                  cache_write: 0,
                },
              },
            },
          },
          openrouter: {
            id: "openrouter",
            models: {
              "openai/gpt-5": {
                id: "openai/gpt-5",
                cost: {
                  input: 9,
                  output: 9,
                  cache_read: 0,
                  cache_write: 0,
                },
              },
            },
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      )) as unknown) as typeof fetch;

    await prefetchPricing();

    const usage = {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    };

    expect(computeCost(usage, "gpt-5") ?? 0).toBeCloseTo(1, 12);
    expect(computeCost(usage, "openrouter/openai/gpt-5") ?? 0).toBeCloseTo(9, 12);
  });
});
