import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "땅땅 — 입찰은 지원서로, 확정은 땅땅",
    template: "%s · 땅땅",
  },
  description: "하이퍼로컬 중고나눔·소액거래 앱 땅땅. 지원서로 받고, 판매자가 땅땅 치면 그 순간 결제까지 끝나요.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
