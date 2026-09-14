import type { Metadata } from "next";
import { Barlow_Condensed, Manrope, Source_Serif_4 } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";
import "./fate-design.css";

const display = Barlow_Condensed({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-fate-display", display: "swap" });
const interfaceFont = Manrope({ subsets: ["latin"], variable: "--font-fate-ui", display: "swap" });
const reading = Source_Serif_4({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-fate-reading", display: "swap", preload: false });

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
    <html lang="pt-BR" className={`${display.variable} ${interfaceFont.variable} ${reading.variable}`} suppressHydrationWarning>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
