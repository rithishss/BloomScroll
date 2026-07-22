import "server-only";
import { parseServerEnv, type ServerConfig } from "@/lib/config";

let cached: ServerConfig | null = null;

/** Lazily parsed server config. Secrets never leave server modules. */
export function serverConfig(): ServerConfig {
  cached ??= parseServerEnv(process.env);
  return cached;
}
