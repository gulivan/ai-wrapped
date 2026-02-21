import { describe, expect, test } from "bun:test";
import { getOpenExternalCommand, tryResolveAllowedExternalUrl } from "./external";

describe("external URL helpers", () => {
  test("allows only configured hosts over http/https without credentials", () => {
    expect(tryResolveAllowedExternalUrl("https://x.com/gulivan_dev")).toBe(
      "https://x.com/gulivan_dev",
    );
    expect(tryResolveAllowedExternalUrl("https://github.com/gulivan/ai-wrapped")).toBe(
      "https://github.com/gulivan/ai-wrapped",
    );
    expect(tryResolveAllowedExternalUrl("https://user:pass@github.com/private")).toBeNull();
    expect(tryResolveAllowedExternalUrl("javascript:alert(1)")).toBeNull();
    expect(tryResolveAllowedExternalUrl("https://example.com")).toBeNull();
  });

  test("builds non-shell commands for each platform", () => {
    expect(getOpenExternalCommand("https://x.com", "darwin")).toEqual(["open", "https://x.com"]);
    expect(getOpenExternalCommand("https://x.com", "linux")).toEqual([
      "xdg-open",
      "https://x.com",
    ]);
    expect(getOpenExternalCommand("https://x.com", "win32")).toEqual([
      "rundll32.exe",
      "url.dll,FileProtocolHandler",
      "https://x.com",
    ]);
  });
});
