import { describe, expect, it } from "vitest";
import { chunkPages } from "@/lib/documents/chunking";

describe("chunkPages", () => {
  it("returns an empty array for no pages", async () => {
    expect(await chunkPages([])).toEqual([]);
  });

  it("keeps a small document as a single chunk spanning its full page range", async () => {
    const pages = [
      { pageNumber: 1, text: "Short intro." },
      { pageNumber: 2, text: "Short conclusion." },
    ];
    const chunks = await chunkPages(pages);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageStart).toBe(1);
    expect(chunks[0].pageEnd).toBe(2);
    expect(chunks[0].content).toContain("Short intro.");
    expect(chunks[0].content).toContain("Short conclusion.");
  });

  it("splits a long document into multiple chunks with sequential indexes", async () => {
    // Build enough text to exceed the ~3600-char chunk size across several pages.
    const paragraph = "This is a dense sentence about operating systems and scheduling. ".repeat(
      40,
    );
    const pages = Array.from({ length: 6 }, (_, i) => ({
      pageNumber: i + 1,
      text: paragraph,
    }));
    const chunks = await chunkPages(pages);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk, i) => expect(chunk.chunkIndex).toBe(i));
  });

  it("assigns each chunk a page range that increases monotonically", async () => {
    const paragraph = "This is a dense sentence about operating systems and scheduling. ".repeat(
      40,
    );
    const pages = Array.from({ length: 8 }, (_, i) => ({
      pageNumber: i + 1,
      text: paragraph,
    }));
    const chunks = await chunkPages(pages);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].pageStart).toBeGreaterThanOrEqual(chunks[i - 1].pageStart);
      expect(chunks[i].pageEnd).toBeGreaterThanOrEqual(chunks[i - 1].pageEnd);
    }
    // The first and last chunk should anchor the document's actual page bounds.
    expect(chunks[0].pageStart).toBe(1);
    expect(chunks[chunks.length - 1].pageEnd).toBe(8);
  });

  it("preserves original (non-contiguous) page numbers", async () => {
    const paragraph = "This is a dense sentence about signals and systems. ".repeat(40);
    const pages = [
      { pageNumber: 3, text: paragraph },
      { pageNumber: 4, text: paragraph },
      { pageNumber: 9, text: paragraph },
      { pageNumber: 10, text: paragraph },
    ];
    const chunks = await chunkPages(pages);
    const allPageNumbers = new Set(chunks.flatMap((c) => [c.pageStart, c.pageEnd]));
    for (const p of allPageNumbers) {
      expect([3, 4, 9, 10]).toContain(p);
    }
  });

  it("estimates a positive token count for every chunk", async () => {
    const chunks = await chunkPages([{ pageNumber: 1, text: "Some reasonably sized content." }]);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeGreaterThan(0);
    }
  });
});
