import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { MotionProvider } from "@/components/motion-provider";
import { LiveProvider } from "@/components/live-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sherlock.ai",
  description: "An investigator for document collections: where information came from, and what it affects.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try { var theme = localStorage.getItem("sherlock-appearance"); document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light"; } catch { document.documentElement.dataset.theme = "light"; }`,
          }}
        />
      </head>
      <body className="min-h-full bg-bg text-fg">
        <MotionProvider>
          <LiveProvider>{children}</LiveProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
