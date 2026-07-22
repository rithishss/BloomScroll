"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="bottom-right"
      toastOptions={{
        style: {
          background: "var(--card)",
          color: "var(--card-foreground)",
          border: "1px solid var(--border)",
          borderRadius: "1rem",
        },
      }}
    />
  );
}

export { Toaster };
