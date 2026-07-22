import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/config";

describe("parseServerEnv", () => {
  it("returns null supabase/openai config when credentials are absent", () => {
    const config = parseServerEnv({});
    expect(config.supabase).toBeNull();
    expect(config.openai).toBeNull();
  });

  it("applies sane defaults for model names and upload size", () => {
    const config = parseServerEnv({});
    expect(config.maxPdfSizeMb).toBe(20);
    expect(config.maxPdfSizeBytes).toBe(20 * 1024 * 1024);
    expect(config.embeddingDimensions).toBe(1536);
  });

  it("builds a supabase config only when all three values are present", () => {
    const partial = parseServerEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-key",
      // SUPABASE_SERVICE_ROLE_KEY intentionally missing
    });
    expect(partial.supabase).toBeNull();

    const full = parseServerEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
    });
    expect(full.supabase).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "anon-key",
      serviceRoleKey: "service-key",
    });
  });

  it("builds an openai config from an API key with default models", () => {
    const config = parseServerEnv({ OPENAI_API_KEY: "sk-test" });
    expect(config.openai).toEqual({
      apiKey: "sk-test",
      baseUrl: null,
      chatModel: "gpt-4o-mini",
      embeddingModel: "text-embedding-3-small",
    });
  });

  it("honors overridden model names and a custom base URL", () => {
    const config = parseServerEnv({
      OPENAI_API_KEY: "sk-test",
      OPENAI_CHAT_MODEL: "gpt-4.1",
      OPENAI_EMBEDDING_MODEL: "text-embedding-3-large",
      OPENAI_BASE_URL: "https://my-proxy.example.com",
    });
    expect(config.openai).toMatchObject({
      chatModel: "gpt-4.1",
      embeddingModel: "text-embedding-3-large",
      baseUrl: "https://my-proxy.example.com",
    });
  });

  it("coerces MAX_PDF_SIZE_MB from a string env var", () => {
    const config = parseServerEnv({ MAX_PDF_SIZE_MB: "35" });
    expect(config.maxPdfSizeMb).toBe(35);
    expect(config.maxPdfSizeBytes).toBe(35 * 1024 * 1024);
  });

  it("rejects a non-numeric MAX_PDF_SIZE_MB", () => {
    expect(() => parseServerEnv({ MAX_PDF_SIZE_MB: "not-a-number" })).toThrow();
  });

  it("rejects an invalid Supabase URL", () => {
    expect(() =>
      parseServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "service-key",
      }),
    ).toThrow();
  });
});
