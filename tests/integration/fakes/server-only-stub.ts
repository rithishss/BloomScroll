// Vitest runs in Node, not Next's "react-server" condition, so the real
// server-only package (which throws outside that condition) is aliased to
// this no-op for tests. Production builds still use the real guard.
export {};
