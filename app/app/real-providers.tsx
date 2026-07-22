"use client";

import { useState } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { DataProviderProvider } from "@/lib/data/provider-context";
import { RealProvider } from "@/lib/data/real-provider";

export function RealProviders({ children }: { children: React.ReactNode }) {
  const [provider] = useState(() => new RealProvider());
  return (
    <DataProviderProvider provider={provider}>
      <AppShell basePath="/app">{children}</AppShell>
    </DataProviderProvider>
  );
}
