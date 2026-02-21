import { describe, expect, test } from "bun:test";
import { rawDailyStoreMissingHourDimension } from "./store";

describe("rawDailyStoreMissingHourDimension", () => {
  test("returns false for non-record input", () => {
    expect(rawDailyStoreMissingHourDimension(null)).toBe(false);
    expect(rawDailyStoreMissingHourDimension([])).toBe(false);
  });

  test("ignores entries with zero sessions", () => {
    expect(
      rawDailyStoreMissingHourDimension({
        "2026-02-21": {
          totals: { sessions: 0 },
        },
      }),
    ).toBe(false);
  });

  test("returns true when byHour is missing for active entries", () => {
    expect(
      rawDailyStoreMissingHourDimension({
        "2026-02-21": {
          totals: { sessions: 2 },
        },
      }),
    ).toBe(true);
  });

  test("returns false when byHour is empty for active entries", () => {
    expect(
      rawDailyStoreMissingHourDimension({
        "2026-02-21": {
          totals: { sessions: 1 },
          byHour: {},
          byHourSource: {},
        },
      }),
    ).toBe(false);
  });

  test("returns true when byHour is malformed for active entries", () => {
    expect(
      rawDailyStoreMissingHourDimension({
        "2026-02-21": {
          totals: { sessions: 1 },
          byHour: [],
        },
      }),
    ).toBe(true);
  });

  test("returns true when byHourSource is missing for active entries", () => {
    expect(
      rawDailyStoreMissingHourDimension({
        "2026-02-21": {
          totals: { sessions: 3 },
          byHour: { "09": { sessions: 3 } },
        },
      }),
    ).toBe(true);
  });

  test("returns true when byHourSource is malformed for active entries", () => {
    expect(
      rawDailyStoreMissingHourDimension({
        "2026-02-21": {
          totals: { sessions: 3 },
          byHour: { "09": { sessions: 3 } },
          byHourSource: [],
        },
      }),
    ).toBe(true);
  });

  test("returns false when active entries have populated hour dimensions", () => {
    expect(
      rawDailyStoreMissingHourDimension({
        "2026-02-21": {
          totals: { sessions: 3 },
          byHour: { "09": { sessions: 3 } },
          byHourSource: {
            "09": {
              codex: { sessions: 3 },
            },
          },
        },
      }),
    ).toBe(false);
  });

  test("returns false when byHourSource is empty but present", () => {
    expect(
      rawDailyStoreMissingHourDimension({
        "2026-02-21": {
          totals: { sessions: 2 },
          byHour: {},
          byHourSource: {},
        },
      }),
    ).toBe(false);
  });
});
