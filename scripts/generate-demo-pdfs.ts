/**
 * Generates the demo PDFs in public/demo-pdfs/ from the repository-owned
 * course notes in lib/demo/content.ts. Run with: npm run demo:pdfs
 *
 * Each content page becomes one PDF page, so the page numbers cited by demo
 * cards line up exactly with the PDF a visitor opens from the source drawer.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DEMO_DOCS, type DemoDocContent } from "../lib/demo/content";

const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN = 68;
const BODY_SIZE = 11.5;
const BODY_LEADING = 17;

function wrapText(
  text: string,
  font: { widthOfTextAtSize(t: string, s: number): number },
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function buildPdf(doc: DemoDocContent): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(doc.title);
  pdf.setAuthor("BloomScroll demo content");
  pdf.setSubject(doc.subject);

  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const forest = rgb(24 / 255, 59 / 255, 51 / 255);
  const ink = rgb(39 / 255, 51 / 255, 47 / 255);
  const leaf = rgb(111 / 255, 143 / 255, 126 / 255);

  for (const page of doc.pages) {
    const p = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    // Running header
    p.drawText(doc.title, { x: MARGIN, y, size: 9, font: serif, color: leaf });
    y -= 26;

    // Heading
    p.drawText(page.heading, { x: MARGIN, y, size: 18, font: serifBold, color: forest });
    y -= 12;
    p.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 0.75,
      color: leaf,
      opacity: 0.5,
    });
    y -= 24;

    // Body paragraphs
    for (const paragraph of page.body.split("\n")) {
      const lines = wrapText(paragraph, serif, BODY_SIZE, PAGE_WIDTH - MARGIN * 2);
      for (const line of lines) {
        p.drawText(line, { x: MARGIN, y, size: BODY_SIZE, font: serif, color: ink });
        y -= BODY_LEADING;
      }
      y -= BODY_LEADING / 2;
    }

    // Footer page number
    p.drawText(`${page.pageNumber}`, {
      x: PAGE_WIDTH / 2 - 4,
      y: MARGIN / 2,
      size: 10,
      font: serif,
      color: leaf,
    });
  }

  return pdf.save();
}

async function main() {
  const outDir = path.join(process.cwd(), "public", "demo-pdfs");
  await mkdir(outDir, { recursive: true });
  for (const doc of DEMO_DOCS) {
    const bytes = await buildPdf(doc);
    const target = path.join(outDir, doc.filename);
    await writeFile(target, bytes);
    console.log(`Wrote ${target} (${doc.pages.length} pages, ${bytes.length} bytes)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
