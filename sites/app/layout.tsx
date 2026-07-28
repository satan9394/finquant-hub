import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FinQuant Hub · 全球量化研究台",
  description: "查询全球股票，生成基于真实行情与新闻证据的研究报告，并持久化研究历史。",
  openGraph: {
    title: "FinQuant Hub · 全球量化研究台",
    description: "查询全球股票，生成基于真实行情与新闻证据的研究报告，并持久化研究历史。",
    images: ["/finquant-social.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
