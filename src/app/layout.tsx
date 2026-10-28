import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const sora = localFont({
  variable: "--font-sora",
  display: "swap",
  src: [
    { path: "../fonts/Sora-Regular.ttf", weight: "400", style: "normal" },
    { path: "../fonts/Sora-Bold.ttf", weight: "700", style: "normal" },
    { path: "../fonts/Sora-ExtraBold.ttf", weight: "800", style: "normal" },
  ],
});

const aspekta = localFont({
  variable: "--font-aspekta",
  display: "swap",
  src: [
    { path: "../fonts/Aspekta-100.otf", weight: "100", style: "normal" },
    { path: "../fonts/Aspekta-500.otf", weight: "500", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "Palliser Labs — Client Portal",
  description: "Your projects, files and conversations with Palliser Labs.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sora.variable} ${aspekta.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
