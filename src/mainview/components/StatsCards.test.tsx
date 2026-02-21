import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import StatsCards from "./StatsCards";

describe("StatsCards", () => {
  test("renders spec-required dashboard cards", () => {
    const html = renderToStaticMarkup(
      createElement(StatsCards, {
        totalTokens: 154320,
        totalCostUsd: 12.5,
        totalSessions: 42,
        totalToolCalls: 91,
      }),
    );

    expect(html).toContain("Total Tokens");
    expect(html).toContain("Total Cost");
    expect(html).toContain("Total Sessions");
    expect(html).toContain("Total Tool Calls");
    expect(html).toContain("154.3K");
    expect(html).toContain("$12.50");
    expect(html).toContain(">42<");
    expect(html).toContain(">91<");
  });
});
