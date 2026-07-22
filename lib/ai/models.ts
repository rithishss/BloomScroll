import "server-only";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { serverConfig } from "@/lib/config.server";

/**
 * Provider abstraction: model names and endpoints come from env vars
 * (OPENAI_CHAT_MODEL, OPENAI_EMBEDDING_MODEL, optional OPENAI_BASE_URL for
 * any OpenAI-compatible host). Nothing else in the codebase names a model.
 */

export function isAiConfigured(): boolean {
  return serverConfig().openai !== null;
}

export function getChatModel(options?: { temperature?: number }): ChatOpenAI {
  const config = serverConfig().openai;
  if (!config) {
    throw new Error("OpenAI is not configured (OPENAI_API_KEY missing).");
  }
  return new ChatOpenAI({
    model: config.chatModel,
    temperature: options?.temperature ?? 0.4,
    apiKey: config.apiKey,
    configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined,
    maxRetries: 2,
  });
}

export function getEmbeddings(): OpenAIEmbeddings {
  const config = serverConfig().openai;
  if (!config) {
    throw new Error("OpenAI is not configured (OPENAI_API_KEY missing).");
  }
  return new OpenAIEmbeddings({
    model: config.embeddingModel,
    apiKey: config.apiKey,
    configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined,
    maxRetries: 2,
  });
}

/** pgvector expects a string literal like "[0.1,0.2,...]" through PostgREST. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
