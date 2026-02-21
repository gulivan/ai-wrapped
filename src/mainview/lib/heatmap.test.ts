import { describe, expect, test } from "bun:test";
import { computeHeatmapCellSizePx } from "./heatmap";

describe("heatmap helpers", () => {
  test("caps cell size for short ranges to avoid oversized blocks", () => {
    expect(computeHeatmapCellSizePx(1)).toBe(14);
    expect(computeHeatmapCellSizePx(5)).toBe(14);
  });

  test("keeps yearly ranges compact and readable", () => {
    expect(computeHeatmapCellSizePx(53)).toBe(10);
    expect(computeHeatmapCellSizePx(64)).toBe(10);
  });

  test("uses available viewport width when provided", () => {
    expect(computeHeatmapCellSizePx(53, 900)).toBe(13);
  });

  test("handles invalid inputs safely", () => {
    expect(computeHeatmapCellSizePx(0)).toBe(14);
    expect(computeHeatmapCellSizePx(-8)).toBe(14);
    expect(computeHeatmapCellSizePx(8, Number.NaN)).toBe(14);
  });
});
