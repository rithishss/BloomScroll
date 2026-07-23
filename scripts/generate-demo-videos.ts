/**
 * Generates the demo workspace's pre-rendered reel videos from the seeded
 * study cards in lib/demo/seed.ts. Run with:
 *
 *   node --conditions=react-server --import tsx scripts/generate-demo-videos.ts
 *
 * (the --conditions flag makes the "server-only" guard in lib/video/*
 * resolve to its no-op build instead of throwing, since this script runs
 * outside Next's own module resolution).
 *
 * Narration uses the operating system's built-in `say` command rather than
 * OpenAI's TTS API: this script only needs to run once, offline, to produce
 * the small set of bundled demo assets that ship in the repo (same idea as
 * scripts/generate-demo-pdfs.ts generating static demo PDFs) — it is not
 * part of the app's runtime code path. Real-mode ingestion always uses the
 * configured OpenAI TTS voice (lib/video/tts.ts). `say` is macOS-only, so
 * this script is a one-time content-authoring tool, not a portable part of
 * the pipeline.
 */
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { platform } from "node:os";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { buildDemoCards } from "../lib/demo/seed";
import { renderSlidePng } from "../lib/video/slide";
import { composeReel } from "../lib/video/compose";
import { formatPageRange } from "../lib/utils";

const execFileAsync = promisify(execFile);
const VOICE = "Samantha";

async function synthesizeWithSay(script: string, dir: string): Promise<Buffer> {
  const aiffPath = join(dir, "narration.aiff");
  const mp3Path = join(dir, "narration.mp3");
  await execFileAsync("say", ["-v", VOICE, "-o", aiffPath, script]);
  if (!ffmpegPath) throw new Error("ffmpeg-static did not resolve a binary for this platform.");
  await execFileAsync(ffmpegPath, ["-y", "-i", aiffPath, "-codec:a", "libmp3lame", "-qscale:a", "4", mp3Path]);
  return readFile(mp3Path);
}

async function main() {
  if (platform() !== "darwin") {
    throw new Error(
      "This script uses macOS's `say` command for offline narration and only runs on macOS. " +
        "Real-mode ingestion (lib/video/tts.ts) uses OpenAI TTS and works everywhere.",
    );
  }

  const outDir = join(process.cwd(), "public", "demo-videos");
  await mkdir(outDir, { recursive: true });

  const cards = buildDemoCards();
  const durations: Record<string, number> = {};

  for (const card of cards) {
    const key = card.id.replace(/^card-/, "");
    process.stdout.write(`Rendering ${card.id} ("${card.title}")… `);

    const workDir = await mkdtemp(join(tmpdir(), "bloomscroll-demo-video-"));
    try {
      const [slidePng, narrationMp3] = await Promise.all([
        renderSlidePng({
          cardType: card.cardType,
          topic: card.topic,
          title: card.title,
          explanation: card.explanation,
          takeaway: card.takeaway,
          difficulty: card.difficulty,
          documentTitle: card.documentTitle,
          pageLabel: formatPageRange(card.pageStart, card.pageEnd),
        }),
        synthesizeWithSay(card.narrationScript ?? card.explanation, workDir),
      ]);
      const { mp4, durationSeconds } = await composeReel(slidePng, narrationMp3);
      await writeFile(join(outDir, `${card.id}.mp4`), mp4);
      durations[key] = Math.round(durationSeconds * 10) / 10;
      console.log(`${durationSeconds.toFixed(1)}s, ${(mp4.length / 1024).toFixed(0)} KB`);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  console.log("\nPaste this into DEMO_VIDEO_DURATIONS in lib/demo/seed.ts:\n");
  console.log(
    `export const DEMO_VIDEO_DURATIONS: Record<string, number> = ${JSON.stringify(durations, null, 2)};`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
