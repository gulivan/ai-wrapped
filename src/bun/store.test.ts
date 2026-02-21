import { describe, expect, test } from "bun:test";
import { rawAggregationMetaNeedsTimeZoneBackfill, rawDailyStoreMissingHourDimension } from "./store";

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

describe("rawAggregationMetaNeedsTimeZoneBackfill", () => {
  test("returns true when meta is missing or malformed", () => {
    expect(rawAggregationMetaNeedsTimeZoneBackfill(null, "America/Los_Angeles")).toBe(true);
    expect(rawAggregationMetaNeedsTimeZoneBackfill({}, "America/Los_Angeles")).toBe(true);
    expect(
      rawAggregationMetaNeedsTimeZoneBackfill(
        { version: "1", timeZone: "America/Los_Angeles" },
        "America/Los_Angeles",
      ),
    ).toBe(true);
  });

  test("returns true when version changes", () => {
    expect(
      rawAggregationMetaNeedsTimeZoneBackfill(
        { version: 2, timeZone: "America/Los_Angeles" },
        "America/Los_Angeles",
      ),
    ).toBe(true);
  });

  test("returns true when timezone changes", () => {
    expect(
      rawAggregationMetaNeedsTimeZoneBackfill(
        { version: 1, timeZone: "UTC" },
        "America/Los_Angeles",
      ),
    ).toBe(true);
  });

  test("returns false for matching version and timezone", () => {
    expect(
      rawAggregationMetaNeedsTimeZoneBackfill(
        { version: 1, timeZone: "America/Los_Angeles" },
        "America/Los_Angeles",
      ),
    ).toBe(false);
  });
});
