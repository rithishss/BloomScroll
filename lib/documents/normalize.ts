/**
 * Page-text normalization for the ingestion pipeline. Whitespace is tidied
 * without touching non-ASCII characters, so mathematical notation (∫, Σ, ω,
 * superscripts, etc.) survives extraction intact.
 */

export interface PageText {
  /** 1-based page number from the original PDF. */
  pageNumber: number;
  text: string;
}

export function normalizePageText(raw: string): string {
  return (
    raw
      // Strip control characters that pdf extractors sometimes emit (keep \n and \t).
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      // Windows/old-Mac newlines → \n
      .replace(/\r\n?/g, "\n")
      // Collapse runs of spaces/tabs but never across newlines.
      .replace(/[ \t]+/g, " ")
      // Trim trailing spaces per line.
      .replace(/ +\n/g, "\n")
      .replace(/\n +/g, "\n")
      // At most one blank line in a row.
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Normalizes every page and removes pages with no meaningful text while
 * preserving each page's original number (page 7 stays page 7 even if pages
 * 5–6 were blank).
 */
export function toCleanPages(pages: PageText[]): PageText[] {
  return pages
    .map((p) => ({ pageNumber: p.pageNumber, text: normalizePageText(p.text) }))
    .filter((p) => p.text.length >= 3);
}

/** Rough token estimate (≈4 chars/token for English text). Used to size chunks. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * True when the extractable text is so sparse the PDF is probably scanned
 * images. The caller surfaces an honest "no OCR" explanation.
 */
export function looksScanned(pages: PageText[], totalPageCount: number): boolean {
  if (totalPageCount === 0) return true;
  const textualPages = toCleanPages(pages).filter((p) => p.text.length > 40).length;
  return textualPages / totalPageCount < 0.2;
}
