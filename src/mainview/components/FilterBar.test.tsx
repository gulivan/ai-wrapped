import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import FilterBar from "./FilterBar";

describe("FilterBar", () => {
  test("renders a model dropdown with options", () => {
    const html = renderToStaticMarkup(
      createElement(FilterBar, {
        sources: ["codex"],
        onSourcesChange: () => {},
        dateFrom: "",
        dateTo: "",
        onDateFromChange: () => {},
        onDateToChange: () => {},
        repoName: "",
        repoOptions: ["ai-stats"],
        onRepoChange: () => {},
        model: "",
        modelOptions: ["gpt-5", "claude-3.7"],
        onModelChange: () => {},
        sortBy: "date",
        sortDir: "desc",
        onSortByChange: () => {},
        onSortDirChange: () => {},
      }),
    );

    expect(html).toContain("Model");
    expect(html).toContain("All models");
    expect(html).toContain("gpt-5");
    expect(html).toContain("claude-3.7");
  });
});
