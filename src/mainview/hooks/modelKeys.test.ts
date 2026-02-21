import { describe, expect, test } from "bun:test";
import { EMPTY_TOKEN_USAGE } from "@shared/schema";
import { collectModelKeys } from "./modelKeys";

const makeModelEntry = (model: string) => ({
  model,
  sessions: 1,
  tokens: { ...EMPTY_TOKEN_USAGE },
  costUsd: 0,
});

describe("collectModelKeys", () => {
  test("preserves exact model keys while dropping blank values", () => {
    const result = collectModelKeys([
      makeModelEntry("gpt-5"),
      makeModelEntry(" gpt-5 "),
      makeModelEntry(""),
      makeModelEntry("   "),
      makeModelEntry("claude-sonnet"),
    ]);

    expect(result).toEqual(["gpt-5", " gpt-5 ", "claude-sonnet"]);
  });

  test("deduplicates exact duplicate keys in insertion order", () => {
    const result = collectModelKeys([
      makeModelEntry("gpt-5"),
      makeModelEntry("gpt-5"),
      makeModelEntry("claude-sonnet"),
      makeModelEntry("claude-sonnet"),
    ]);

    expect(result).toEqual(["gpt-5", "claude-sonnet"]);
  });
});
