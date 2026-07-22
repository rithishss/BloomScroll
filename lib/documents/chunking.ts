import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { estimateTokens, type PageText } from "@/lib/documents/normalize";

/**
 * Chunking with page-metadata preservation. Pages are concatenated with
 * their character offsets recorded; LangChain's recursive splitter cuts the
 * combined text (~900 tokens per chunk, ~125 token overlap), and each chunk
 * is mapped back to the page range its characters came from.
 */

export interface ChunkWithPages {
  chunkIndex: number;
  content: string;
  pageStart: number;
  pageEnd: number;
  tokenCount: number;
}

// ~4 chars/token → 3600 chars ≈ 900 tokens, 500 chars ≈ 125 tokens overlap.
const CHUNK_SIZE_CHARS = 3600;
const CHUNK_OVERLAP_CHARS = 500;
const PAGE_SEPARATOR = "\n\n";

export async function chunkPages(pages: PageText[]): Promise<ChunkWithPages[]> {
  if (pages.length === 0) return [];

  // Record where each page's text lives in the combined string.
  let combined = "";
  const spans: { pageNumber: number; start: number; end: number }[] = [];
  for (const page of pages) {
    if (combined.length > 0) combined += PAGE_SEPARATOR;
    const start = combined.length;
    combined += page.text;
    spans.push({ pageNumber: page.pageNumber, start, end: combined.length });
  }

  // Small documents shouldn't be fragmented unnecessarily.
  if (combined.length <= CHUNK_SIZE_CHARS) {
    return [
      {
        chunkIndex: 0,
        content: combined,
        pageStart: pages[0].pageNumber,
        pageEnd: pages[pages.length - 1].pageNumber,
        tokenCount: estimateTokens(combined),
      },
    ];
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE_CHARS,
    chunkOverlap: CHUNK_OVERLAP_CHARS,
  });
  const pieces = await splitter.splitText(combined);

  const chunks: ChunkWithPages[] = [];
  let searchFrom = 0;
  for (const piece of pieces) {
    // Chunks appear in order; search from just before the previous chunk's
    // end so overlapping text still resolves to the right offset.
    const start = combined.indexOf(piece, Math.max(0, searchFrom - CHUNK_OVERLAP_CHARS * 2));
    const resolvedStart = start === -1 ? searchFrom : start;
    const resolvedEnd = resolvedStart + piece.length;
    searchFrom = resolvedEnd;

    const touching = spans.filter((s) => s.start < resolvedEnd && s.end > resolvedStart);
    const pageStart = touching.length > 0 ? touching[0].pageNumber : spans[0].pageNumber;
    const pageEnd =
      touching.length > 0
        ? touching[touching.length - 1].pageNumber
        : spans[spans.length - 1].pageNumber;

    chunks.push({
      chunkIndex: chunks.length,
      content: piece,
      pageStart,
      pageEnd,
      tokenCount: estimateTokens(piece),
    });
  }
  return chunks;
}
