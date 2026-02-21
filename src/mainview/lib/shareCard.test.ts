import { describe, expect, test } from "bun:test";
import { buildCardDownloadName, downloadBlobAsFile, resolveCurrentCardIndex } from "./shareCard";

describe("shareCard helpers", () => {
  test("resolveCurrentCardIndex prefers intersected card index", () => {
    expect(resolveCurrentCardIndex(4, 2)).toBe(4);
    expect(resolveCurrentCardIndex(0, 2)).toBe(2);
  });

  test("buildCardDownloadName uses card index and yyyy-mm-dd date", () => {
    const filename = buildCardDownloadName(7, new Date("2026-02-21T12:00:00.000Z"));
    expect(filename).toBe("ai-wrapped-card-7-2026-02-21.png");
  });

  test("downloadBlobAsFile writes, clicks, removes, and revokes object URL", () => {
    let clicked = false;
    let removed = false;
    const anchor = {
      href: "",
      download: "",
      click: () => {
        clicked = true;
      },
      remove: () => {
        removed = true;
      },
    } as unknown as HTMLAnchorElement;

    const appended: unknown[] = [];
    const documentRef = {
      createElement: (tag: string) => {
        expect(tag).toBe("a");
        return anchor;
      },
      body: {
        appendChild: (node: unknown) => {
          appended.push(node);
          return node;
        },
      },
    } as unknown as Pick<Document, "createElement" | "body">;

    const revoked: string[] = [];
    const urlApi = {
      createObjectURL: (_blob: Blob) => "blob:mock-url",
      revokeObjectURL: (href: string) => {
        revoked.push(href);
      },
    };

    downloadBlobAsFile(new Blob(["x"]), "wrapped.png", documentRef, urlApi);

    expect(anchor.href).toBe("blob:mock-url");
    expect(anchor.download).toBe("wrapped.png");
    expect(appended).toHaveLength(1);
    expect(clicked).toBe(true);
    expect(removed).toBe(true);
    expect(revoked).toEqual(["blob:mock-url"]);
  });
});
