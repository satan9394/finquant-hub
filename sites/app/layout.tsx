import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./hardening.css";

const title = "FinQuant Hub · 全球量化研究台";
const description = "查询全球股票，生成基于真实行情与新闻证据的研究报告，并持久化研究历史。";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = (requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000").split(",")[0].trim();
  const forwardedProtocol = (requestHeaders.get("x-forwarded-proto") ?? "https").split(",")[0].trim();
  const protocol = forwardedProtocol === "http" ? "http" : "https";
  const base = new URL(`${protocol}://${host}`);
  const image = new URL("/og.png", base).href;

  return {
    metadataBase: base,
    title,
    description,
    icons: { icon: "/favicon.svg" },
    openGraph: {
      title,
      description,
      images: [{ url: image, width: 1731, height: 909, alt: "FinQuant Hub — Research, with receipts" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
