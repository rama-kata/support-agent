import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { MotionProvider } from "@/components/motion-provider";
import "./globals.css";

const instrument = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-mono-face", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "cellar · support that checks its own work",
  description:
    "An AI support agent that looks up orders, issues refunds within limits and checks stock, and verifies every action before it says it's done.",
};

export const viewport: Viewport = {
  // Browsers read these as literals, so they can't use CSS variables: white and ink.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#16181B" },
  ],
};


export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrument.variable} ${bricolage.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
