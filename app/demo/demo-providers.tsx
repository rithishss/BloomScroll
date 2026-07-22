"use client";

import { useState } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { DataProviderProvider } from "@/lib/data/provider-context";
import { DemoProvider } from "@/lib/demo/provider";

/**
 * Client boundary for the demo workspace. One DemoProvider instance lives
 * for the whole browsing session so simulated processing timers survive
 * route changes within /demo.
 */
export function DemoProviders({ children }: { children: React.ReactNode }) {
  const [provider] = useState(() => new DemoProvider());
  return (
    <DataProviderProvider provider={provider}>
      <AppShell basePath="/demo">{children}</AppShell>
    </DataProviderProvider>
  );
}
