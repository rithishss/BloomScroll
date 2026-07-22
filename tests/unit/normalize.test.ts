import { describe, expect, it } from "vitest";
import {
  estimateTokens,
  looksScanned,
  normalizePageText,
  toCleanPages,
} from "@/lib/documents/normalize";

describe("normalizePageText", () => {
  it("collapses runs of spaces and tabs without touching newlines", () => {
    expect(normalizePageText("hello   world\tfoo")).toBe("hello world foo");
  });

  it("normalizes Windows and old-Mac line endings to \\n", () => {
    expect(normalizePageText("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("collapses 3+ blank lines to a single blank line", () => {
    expect(normalizePageText("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  it("preserves mathematical notation and non-ASCII symbols", () => {
    const math = "X(jw) = integral of x(t) e^(-jwt) dt, sum over k, delta[n], Sigma, omega";
    expect(normalizePageText(math)).toContain("integral of x(t) e^(-jwt) dt");
    expect(normalizePageText("∫ Σ ω δ")).toBe("∫ Σ ω δ");
  });

  it("collapses tabs to spaces while preserving newlines", () => {
    const withTab = "hello world\nnext\tline";
    expect(normalizePageText(withTab)).toBe("hello world\nnext line");
  });

  it("strips non-printing control characters", () => {
    const withControl = `hello${String.fromCharCode(1)}world`;
    expect(normalizePageText(withControl)).toBe("helloworld");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizePageText("   padded text   ")).toBe("padded text");
  });
});

describe("toCleanPages", () => {
  it("drops empty/whitespace-only pages while preserving original page numbers", () => {
    const pages = [
      { pageNumber: 1, text: "Real content here" },
      { pageNumber: 2, text: "   " },
      { pageNumber: 3, text: "" },
      { pageNumber: 4, text: "More real content" },
    ];
    const result = toCleanPages(pages);
    expect(result.map((p) => p.pageNumber)).toEqual([1, 4]);
  });

  it("normalizes text on every retained page", () => {
    const result = toCleanPages([{ pageNumber: 1, text: "a   b\r\nc" }]);
    expect(result[0].text).toBe("a b\nc");
  });
});

describe("estimateTokens", () => {
  it("estimates roughly 4 characters per token", () => {
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });

  it("rounds up for partial tokens", () => {
    expect(estimateTokens("abc")).toBe(1);
  });
});

describe("looksScanned", () => {
  it("flags a document with zero pages", () => {
    expect(looksScanned([], 5)).toBe(true);
  });

  it("flags a document where almost no pages have substantial text", () => {
    const pages = [
      { pageNumber: 1, text: "x" },
      { pageNumber: 2, text: "" },
      { pageNumber: 3, text: "" },
      { pageNumber: 4, text: "" },
      { pageNumber: 5, text: "" },
    ];
    expect(looksScanned(pages, 5)).toBe(true);
  });

  it("does not flag a normal text-based document", () => {
    const substantial = "This page contains a normal amount of extracted lecture text.".repeat(2);
    const pages = Array.from({ length: 5 }, (_, i) => ({ pageNumber: i + 1, text: substantial }));
    expect(looksScanned(pages, 5)).toBe(false);
  });
});
