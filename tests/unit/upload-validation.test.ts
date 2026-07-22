import { describe, expect, it } from "vitest";
import { sanitizeFilename, titleFromFilename, validatePdfUpload } from "@/lib/validation/upload";

const PDF_HEADER = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const BAD_HEADER = new Uint8Array([0x00, 0x01, 0x02, 0x03]);

function baseInput(overrides: Partial<Parameters<typeof validatePdfUpload>[0]> = {}) {
  return {
    filename: "lecture-notes.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    headBytes: PDF_HEADER,
    maxSizeBytes: 20 * 1024 * 1024,
    ...overrides,
  };
}

describe("validatePdfUpload", () => {
  it("accepts a well-formed PDF", () => {
    const result = validatePdfUpload(baseInput());
    expect(result.ok).toBe(true);
  });

  it("rejects non-.pdf extensions", () => {
    const result = validatePdfUpload(baseInput({ filename: "notes.docx" }));
    expect(result).toMatchObject({ ok: false, code: "not_pdf_extension" });
  });

  it("rejects a spoofed MIME type", () => {
    const result = validatePdfUpload(baseInput({ mimeType: "text/plain" }));
    expect(result).toMatchObject({ ok: false, code: "not_pdf_mime" });
  });

  it("rejects empty files", () => {
    const result = validatePdfUpload(baseInput({ sizeBytes: 0 }));
    expect(result).toMatchObject({ ok: false, code: "empty_file" });
  });

  it("rejects files over the configured size limit", () => {
    const result = validatePdfUpload(baseInput({ sizeBytes: 30 * 1024 * 1024 }));
    expect(result).toMatchObject({ ok: false, code: "too_large" });
  });

  it("rejects a file whose header isn't %PDF-", () => {
    const result = validatePdfUpload(baseInput({ headBytes: BAD_HEADER }));
    expect(result).toMatchObject({ ok: false, code: "bad_pdf_header" });
  });

  it("rejects a corrupt/truncated header", () => {
    const result = validatePdfUpload(baseInput({ headBytes: new Uint8Array([0x25, 0x50]) }));
    expect(result).toMatchObject({ ok: false, code: "bad_pdf_header" });
  });
});

describe("sanitizeFilename", () => {
  it("strips directory traversal attempts", () => {
    expect(sanitizeFilename("../../etc/passwd.pdf")).toBe("passwd.pdf");
    expect(sanitizeFilename("..\\..\\windows\\evil.pdf")).toBe("evil.pdf");
  });

  it("removes unsafe characters and collapses whitespace", () => {
    expect(sanitizeFilename("my <notes>?.pdf")).toBe("my-notes.pdf");
  });

  it("always ends in .pdf", () => {
    expect(sanitizeFilename("weird-name")).toMatch(/\.pdf$/);
  });

  it("falls back to a default name when nothing usable remains", () => {
    expect(sanitizeFilename("???.pdf")).toBe("document.pdf");
  });

  it("truncates very long names", () => {
    const long = `${"a".repeat(200)}.pdf`;
    const result = sanitizeFilename(long);
    expect(result.length).toBeLessThanOrEqual(84);
  });
});

describe("titleFromFilename", () => {
  it("converts dashes/underscores to spaces and title-cases words", () => {
    expect(titleFromFilename("os-lecture_3.pdf")).toBe("Os Lecture 3");
  });

  it("handles an empty stem", () => {
    expect(titleFromFilename(".pdf")).toBe("Untitled document");
  });
});
