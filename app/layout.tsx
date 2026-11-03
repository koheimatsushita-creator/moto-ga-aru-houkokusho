import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "もとがある報告書",
  description: "報告書の下書きの文ごとに、訪問記録のどこがもとかを示す確認の道具（架空データの見本）",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
