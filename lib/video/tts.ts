import "server-only";
import OpenAI from "openai";
import { serverConfig } from "@/lib/config.server";

/**
 * Text-to-speech, isolated behind its own thin wrapper so the model/voice
 * are configurable (OPENAI_TTS_MODEL, OPENAI_TTS_VOICE) like every other AI
 * capability in the app. Narration audio is synthesized once per card
 * during ingestion, never per playback.
 */
export function isTtsConfigured(): boolean {
  return serverConfig().openai !== null;
}

export async function synthesizeNarration(script: string): Promise<Buffer> {
  const config = serverConfig().openai;
  if (!config) {
    throw new Error("OpenAI is not configured (OPENAI_API_KEY missing).");
  }
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl ?? undefined });
  const response = await client.audio.speech.create({
    model: config.ttsModel,
    voice: config.ttsVoice as OpenAI.Audio.Speech.SpeechCreateParams["voice"],
    input: script,
    response_format: "mp3",
  });
  return Buffer.from(await response.arrayBuffer());
}
