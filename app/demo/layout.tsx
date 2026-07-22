import type { Metadata } from "next";
import { DemoProviders } from "@/app/demo/demo-providers";

export const metadata: Metadata = {
  title: "Demo workspace",
  robots: { index: false },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <DemoProviders>{children}</DemoProviders>;
}
