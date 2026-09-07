import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Fate Gameplay Toolkit",
  title: "Fate Gameplay Toolkit",
  description: "Fichas universais, regras completas, rolagens justas e Mesas compartilhadas para Fate.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml", sizes: "any" }],
    shortcut: "/favicon.svg",
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Fate Gameplay Toolkit",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  other: { "mobile-web-app-capable": "yes" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
