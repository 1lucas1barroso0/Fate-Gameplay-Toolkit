"use client";

import { ThemeProvider } from "next-themes";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" themes={["light", "dark"]} enableSystem={false} disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
