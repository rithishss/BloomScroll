"use client";

import { createContext, useContext } from "react";
import type { DataProvider } from "@/lib/data/provider";

const DataProviderContext = createContext<DataProvider | null>(null);

export function DataProviderProvider({
  provider,
  children,
}: {
  provider: DataProvider;
  children: React.ReactNode;
}) {
  return <DataProviderContext.Provider value={provider}>{children}</DataProviderContext.Provider>;
}

export function useDataProvider(): DataProvider {
  const provider = useContext(DataProviderContext);
  if (!provider) {
    throw new Error("useDataProvider must be used inside a DataProviderProvider");
  }
  return provider;
}
