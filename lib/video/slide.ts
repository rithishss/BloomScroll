import "server-only";
import sharp from "sharp";
import type { CardType, Difficulty } from "@/lib/types";
import { CARD_TYPE_LABELS, DIFFICULTY_LABELS } from "@/lib/types";

/**
 * Renders the single still frame behind a narrated reel: an SVG "slide" in
 * the app's editorial-botanical palette, rasterized to PNG via sharp
 * (libvips/librsvg — no headless browser needed). ffmpeg then animates this
 * still with a gentle Ken Burns pan/zoom and layers the narration audio
 * over it (see lib/video/compose.ts).
 *
 * Fonts are system serif/sans stacks rather than the web app's Fraunces/
 * Instrument Sans — embedding those as base64 @font-face data would add a
 * fragile external font-fetch dependency to the render pipeline for a
 * visual difference most viewers won't consciously notice.
 */

export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1920;

const PALETTE = {
  paper: "#F7F4EC",
  forest: "#183B33",
  leaf: "#6F8F7E",
  blossom: "#E98591",
  pollen: "#D9A63A",
  sage: "#E5ECE5",
  ink: "#27332F",
};

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Helvetica, Arial, sans-serif";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Approximate proportional-font word wrap (no canvas metrics available
 * server-side); conservative average character width keeps lines from
 * overflowing the slide at the cost of not being pixel-perfect. */
function wrapText(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    const consumed = lines.slice(0, -1).join(" ").length + 1;
    const remaining = text.length - consumed;
    if (remaining > last.length) lines[maxLines - 1] = `${last.slice(0, maxCharsPerLine - 1)}…`;
  }
  return lines;
}

function petalMark(cx: number, cy: number, scale: number, color: string): string {
  const petals = [0, 72, 144, 216, 288];
  const petalShapes = petals
    .map(
      (angle) =>
        `<ellipse cx="${cx}" cy="${cy - 22 * scale}" rx="${13 * scale}" ry="${22 * scale}" fill="${color}" opacity="0.85" transform="rotate(${angle} ${cx} ${cy})"/>`,
    )
    .join("");
  return `${petalShapes}<circle cx="${cx}" cy="${cy}" r="${9 * scale}" fill="${PALETTE.pollen}"/>`;
}

export interface SlideContent {
  cardType: CardType;
  topic: string;
  title: string;
  explanation: string;
  takeaway: string | null;
  difficulty: Difficulty;
  documentTitle: string;
  pageLabel: string;
}

export function buildSlideSvg(content: SlideContent): string {
  const margin = 84;
  const contentWidth = SLIDE_WIDTH - margin * 2;
  const maxCharsPerLine = Math.floor(contentWidth / 30);

  const titleLines = wrapText(content.title, Math.floor(contentWidth / 42), 3);
  const explanationLines = wrapText(content.explanation, maxCharsPerLine, 11);
  const takeawayLines = content.takeaway ? wrapText(content.takeaway, maxCharsPerLine - 6, 3) : [];

  const titleLineHeight = 76;
  const bodyLineHeight = 52;
  const titleSize = 66;
  const bodySize = 38;
  const takeawaySize = 34;
  // SVG <text> `y` is a baseline, not a box top, so each block's baseline
  // is placed at `cursor + ascent` (≈0.78em) and the cursor advances past
  // `descent` (≈0.22em) — otherwise a large font's cap-height overlaps
  // whatever was positioned just above it.
  const ascent = (size: number) => size * 0.78;
  const descent = (size: number) => size * 0.22;

  // Total content block height, so it can be vertically centered in the
  // space between the header mark and the footer instead of always
  // starting at a fixed y (which leaves an ugly gap for shorter cards).
  const badgesBlock = 56 + 34;
  const titleBlock =
    ascent(titleSize) + (titleLines.length - 1) * titleLineHeight + descent(titleSize) + 40;
  const bodyBlock = ascent(bodySize) + (explanationLines.length - 1) * bodyLineHeight + descent(bodySize);
  const takeawayBlock =
    takeawayLines.length > 0
      ? 56 + ascent(takeawaySize) + (takeawayLines.length - 1) * 44 + descent(takeawaySize) + 40
      : 0;
  const contentHeight = badgesBlock + titleBlock + bodyBlock + takeawayBlock;

  const availableTop = 260;
  const availableBottom = SLIDE_HEIGHT - 260;
  const centeredStart = availableTop + Math.max(0, (availableBottom - availableTop - contentHeight) / 2);

  let cursor = centeredStart;
  const badgesY = cursor;
  cursor += badgesBlock;

  const titleY = cursor + ascent(titleSize);
  cursor += ascent(titleSize) + (titleLines.length - 1) * titleLineHeight + descent(titleSize) + 40;

  const bodyY = cursor + ascent(bodySize);
  cursor += ascent(bodySize) + (explanationLines.length - 1) * bodyLineHeight + descent(bodySize);

  let takeawayY = 0;
  if (takeawayLines.length > 0) {
    cursor += 56;
    takeawayY = cursor + ascent(takeawaySize);
    cursor += ascent(takeawaySize) + (takeawayLines.length - 1) * 44 + descent(takeawaySize) + 40;
  }

  const typeLabel = CARD_TYPE_LABELS[content.cardType].toUpperCase();
  const difficultyLabel = DIFFICULTY_LABELS[content.difficulty].toUpperCase();

  const titleTspans = titleLines
    .map((line, i) => `<tspan x="${margin}" dy="${i === 0 ? 0 : titleLineHeight}">${escapeXml(line)}</tspan>`)
    .join("");
  const bodyTspans = explanationLines
    .map((line, i) => `<tspan x="${margin}" dy="${i === 0 ? 0 : bodyLineHeight}">${escapeXml(line)}</tspan>`)
    .join("");
  const takeawayTspans = takeawayLines
    .map((line, i) => `<tspan x="${margin + 40}" dy="${i === 0 ? 0 : 44}">${escapeXml(line)}</tspan>`)
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SLIDE_WIDTH}" height="${SLIDE_HEIGHT}" viewBox="0 0 ${SLIDE_WIDTH} ${SLIDE_HEIGHT}">
  <defs>
    <radialGradient id="bloomA" cx="82%" cy="6%" r="55%">
      <stop offset="0%" stop-color="${PALETTE.blossom}" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="${PALETTE.blossom}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bloomB" cx="6%" cy="18%" r="50%">
      <stop offset="0%" stop-color="${PALETTE.pollen}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${PALETTE.pollen}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="bloomC" cx="50%" cy="108%" r="60%">
      <stop offset="0%" stop-color="${PALETTE.leaf}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${PALETTE.leaf}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${SLIDE_WIDTH}" height="${SLIDE_HEIGHT}" fill="${PALETTE.paper}"/>
  <rect width="${SLIDE_WIDTH}" height="${SLIDE_HEIGHT}" fill="url(#bloomA)"/>
  <rect width="${SLIDE_WIDTH}" height="${SLIDE_HEIGHT}" fill="url(#bloomB)"/>
  <rect width="${SLIDE_WIDTH}" height="${SLIDE_HEIGHT}" fill="url(#bloomC)"/>

  ${petalMark(margin + 36, 150, 1.6, PALETTE.leaf)}
  <text x="${margin + 92}" y="162" font-family="${SERIF}" font-size="40" font-weight="700" fill="${PALETTE.forest}">BloomScroll</text>

  <g font-family="${SANS}" font-size="26" font-weight="700" letter-spacing="2">
    <rect x="${margin}" y="${badgesY}" width="${typeLabel.length * 17 + 44}" height="56" rx="28" fill="${PALETTE.sage}"/>
    <text x="${margin + 22}" y="${badgesY + 37}" fill="${PALETTE.forest}">${escapeXml(typeLabel)}</text>

    <rect x="${margin + typeLabel.length * 17 + 60}" y="${badgesY}" width="${content.topic.length * 15 + 44}" height="56" rx="28" fill="none" stroke="${PALETTE.forest}" stroke-opacity="0.25" stroke-width="2"/>
    <text x="${margin + typeLabel.length * 17 + 82}" y="${badgesY + 37}" fill="${PALETTE.ink}" letter-spacing="0">${escapeXml(content.topic.toUpperCase())}</text>
  </g>

  <text x="${margin}" y="${titleY}" font-family="${SERIF}" font-size="66" font-weight="700" fill="${PALETTE.forest}">${titleTspans}</text>

  <text x="${margin}" y="${bodyY}" font-family="${SANS}" font-size="38" fill="${PALETTE.ink}" line-height="1.4">${bodyTspans}</text>

  ${
    takeawayLines.length > 0
      ? (() => {
          const boxTop = takeawayY - ascent(takeawaySize) - 24;
          const boxBottom = takeawayY + (takeawayLines.length - 1) * 44 + descent(takeawaySize) + 24;
          return `<rect x="${margin}" y="${boxTop}" width="${contentWidth}" height="${boxBottom - boxTop}" rx="20" fill="${PALETTE.sage}" opacity="0.7"/>
  <text x="${margin + 40}" y="${takeawayY}" font-family="${SANS}" font-style="italic" font-size="34" fill="${PALETTE.forest}">${takeawayTspans}</text>`;
        })()
      : ""
  }

  <g font-family="${SANS}" font-size="28" fill="${PALETTE.leaf}">
    <text x="${margin}" y="${SLIDE_HEIGHT - 140}">${escapeXml(difficultyLabel)}</text>
  </g>
  <line x1="${margin}" y1="${SLIDE_HEIGHT - 110}" x2="${SLIDE_WIDTH - margin}" y2="${SLIDE_HEIGHT - 110}" stroke="${PALETTE.forest}" stroke-opacity="0.15" stroke-width="2"/>
  <text x="${margin}" y="${SLIDE_HEIGHT - 60}" font-family="${SANS}" font-size="30" fill="${PALETTE.ink}" opacity="0.75">${escapeXml(content.documentTitle)} · ${escapeXml(content.pageLabel)}</text>
</svg>`;
}

/** Rasterizes the slide SVG to a PNG buffer at video resolution. */
export async function renderSlidePng(content: SlideContent): Promise<Buffer> {
  const svg = buildSlideSvg(content);
  return sharp(Buffer.from(svg), { density: 144 })
    .resize(SLIDE_WIDTH, SLIDE_HEIGHT)
    .png()
    .toBuffer();
}
