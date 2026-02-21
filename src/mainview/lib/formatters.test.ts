import { describe, expect, test } from "bun:test";
import { formatUsd } from "./formatters";

describe("formatUsd", () => {
  test("formats with USD separators and two-to-four decimals", () => {
    expect(formatUsd(1234.5)).toBe("$1,234.50");
    expect(formatUsd(1234.5678)).toBe("$1,234.5678");
  });

  test("formats nullish values as zero", () => {
    expect(formatUsd(null)).toBe("$0.00");
    expect(formatUsd(undefined)).toBe("$0.00");
  });
});
