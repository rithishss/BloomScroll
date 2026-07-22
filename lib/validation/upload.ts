/**
 * Server-side upload validation. Everything here is pure so it can be unit
 * tested; API routes call these before any storage or database write.
 */

export interface UploadValidationInput {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  /** First bytes of the file; the PDF header check needs ≥ 5 bytes. */
  headBytes: Uint8Array;
  maxSizeBytes: number;
}

export type UploadValidationResult =
  { ok: true; sanitizedFilename: string } | { ok: false; code: UploadErrorCode; message: string };

export type UploadErrorCode =
  "not_pdf_extension" | "not_pdf_mime" | "empty_file" | "too_large" | "bad_pdf_header";

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/**
 * Strips directory components and unsafe characters, preventing path
 * traversal (`../../x.pdf`) and storage-key injection. Always returns a name
 * ending in `.pdf`.
 */
export function sanitizeFilename(raw: string): string {
  // Take only the final path segment (handles both separators).
  const base = raw.split(/[/\\]/).pop() ?? "document.pdf";
  const withoutExt = base.replace(/\.pdf$/i, "");
  const safe = withoutExt
    .replace(/[^a-zA-Z0-9._ -]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ /g, "-")
    .slice(0, 80);
  return `${safe || "document"}.pdf`;
}

/** Derives a human title from a filename: "os-lecture_3.pdf" → "Os Lecture 3". */
export function titleFromFilename(filename: string): string {
  const base = filename
    .replace(/\.pdf$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  if (!base) return "Untitled document";
  return base
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
    .slice(0, 120);
}

export function validatePdfUpload(input: UploadValidationInput): UploadValidationResult {
  if (!/\.pdf$/i.test(input.filename)) {
    return { ok: false, code: "not_pdf_extension", message: "Only PDF files are accepted." };
  }
  if (input.mimeType !== "application/pdf") {
    return {
      ok: false,
      code: "not_pdf_mime",
      message: "The file does not identify as a PDF (unexpected MIME type).",
    };
  }
  if (input.sizeBytes <= 0) {
    return { ok: false, code: "empty_file", message: "The file is empty." };
  }
  if (input.sizeBytes > input.maxSizeBytes) {
    const maxMb = Math.round(input.maxSizeBytes / (1024 * 1024));
    return {
      ok: false,
      code: "too_large",
      message: `The file exceeds the ${maxMb} MB limit.`,
    };
  }
  if (
    input.headBytes.length < PDF_MAGIC.length ||
    !PDF_MAGIC.every((b, i) => input.headBytes[i] === b)
  ) {
    return {
      ok: false,
      code: "bad_pdf_header",
      message: "The file does not start with a valid PDF header; it may be corrupt or renamed.",
    };
  }
  return { ok: true, sanitizedFilename: sanitizeFilename(input.filename) };
}
