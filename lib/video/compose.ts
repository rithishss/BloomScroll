import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

const execFileAsync = promisify(execFile);

const FPS = 30;
const ZOOM_PER_FRAME = 0.0006;
const MAX_ZOOM = 1.12;

export interface ComposedVideo {
  mp4: Buffer;
  durationSeconds: number;
}

async function probeDurationSeconds(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync(ffprobeStatic.path, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "json",
    filePath,
  ]);
  const parsed = JSON.parse(stdout) as { format?: { duration?: string } };
  const duration = Number(parsed.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not determine media duration for ${filePath}.`);
  }
  return duration;
}

/**
 * Composes a still slide image + narration audio into a vertical mp4 with a
 * gentle Ken Burns zoom, timed to exactly the narration's length. Runs the
 * ffmpeg/ffprobe binaries bundled by ffmpeg-static/ffprobe-static (no
 * headless browser, no system ffmpeg install required).
 */
export async function composeReel(slidePng: Buffer, narrationMp3: Buffer): Promise<ComposedVideo> {
  if (!ffmpegPath) {
    throw new Error("ffmpeg binary not found (ffmpeg-static did not resolve for this platform).");
  }
  const dir = await mkdtemp(join(tmpdir(), "bloomscroll-reel-"));
  const imagePath = join(dir, "slide.png");
  const audioPath = join(dir, "narration.mp3");
  const outputPath = join(dir, "reel.mp4");

  try {
    await writeFile(imagePath, slidePng);
    await writeFile(audioPath, narrationMp3);

    const narrationSeconds = await probeDurationSeconds(audioPath);
    const frames = Math.max(1, Math.round(narrationSeconds * FPS));

    await execFileAsync(ffmpegPath, [
      "-y",
      "-loop",
      "1",
      "-i",
      imagePath,
      "-i",
      audioPath,
      "-filter_complex",
      `[0:v]scale=1080:1920,zoompan=z='min(zoom+${ZOOM_PER_FRAME},${MAX_ZOOM})':d=${frames}:s=1080x1920:fps=${FPS}[v]`,
      "-map",
      "[v]",
      "-map",
      "1:a",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-t",
      narrationSeconds.toFixed(3),
      "-movflags",
      "+faststart",
      outputPath,
    ]);

    const mp4 = await readFile(outputPath);
    const durationSeconds = await probeDurationSeconds(outputPath);
    return { mp4, durationSeconds };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
