import { NextResponse } from "next/server";
import { ZodError } from "zod";

/** Consistent typed API error envelope: { error: { code, message } }. */
export type ApiErrorCode =
  | "unauthorized"
  | "not_configured"
  | "not_found"
  | "bad_request"
  | "conflict"
  | "rate_limited"
  | "server_error";

const STATUS: Record<ApiErrorCode, number> = {
  unauthorized: 401,
  not_configured: 503,
  not_found: 404,
  bad_request: 400,
  conflict: 409,
  rate_limited: 429,
  server_error: 500,
};

export function apiError(code: ApiErrorCode, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status: STATUS[code] });
}

export function apiErrorFromException(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return apiError(
      "bad_request",
      first ? `${first.path.join(".")}: ${first.message}` : "Invalid request",
    );
  }
  // Never leak internals; the server logs the real error.
  console.error("[api] unhandled error:", err instanceof Error ? err.message : "unknown");
  return apiError("server_error", "Something went wrong. Please try again.");
}

export const NOT_CONFIGURED_MESSAGE =
  "Supabase is not configured on this deployment. Explore the demo at /demo, or see the README for real-mode setup.";
