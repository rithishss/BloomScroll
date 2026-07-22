import "server-only";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { toCleanPages, type PageText } from "@/lib/documents/normalize";

export interface ExtractedPdf {
  pages: PageText[];
  pageCount: number;
}

export class PdfExtractionError extends Error {
  constructor(
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
    this.name = "PdfExtractionError";
  }
}

/**
 * Page-by-page text extraction via LangChain's PDFLoader (pdf-parse under
 * the hood). Empty pages are dropped while original page numbers are kept,
 * and PDFs with no extractable text produce an honest "probably scanned"
 * error — OCR is not implemented and we never pretend it is.
 */
export async function extractPdfPages(data: Blob): Promise<ExtractedPdf> {
  let docs;
  try {
    const loader = new PDFLoader(data, { splitPages: true, parsedItemSeparator: "" });
    docs = await loader.load();
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    const encrypted = /encrypt/i.test(message);
    throw new PdfExtractionError(
      `pdf extraction failed: ${message}`,
      encrypted
        ? "This PDF is password-protected. Remove the encryption and upload it again."
        : "This PDF could not be read — it may be corrupt or use an unsupported format.",
    );
  }

  const rawPages: PageText[] = docs.map((doc, i) => {
    const meta = doc.metadata as { loc?: { pageNumber?: number } };
    return {
      pageNumber: meta.loc?.pageNumber ?? i + 1,
      text: doc.pageContent,
    };
  });
  const pageCount = rawPages.length;
  const pages = toCleanPages(rawPages);

  const substantialPages = pages.filter((p) => p.text.length > 40).length;
  if (pageCount === 0 || pages.length === 0 || substantialPages / pageCount < 0.2) {
    throw new PdfExtractionError(
      "no extractable text",
      "Almost no text could be extracted — this PDF is probably scanned images. BloomScroll doesn't run OCR yet, so please upload a text-based PDF.",
    );
  }

  return { pages, pageCount };
}
