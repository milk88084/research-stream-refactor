import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "研究串流重構 Prototype" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
