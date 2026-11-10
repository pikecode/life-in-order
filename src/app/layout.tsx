import type { Metadata } from "next";
import "./globals.css";
import "./workbench.css";
export const metadata: Metadata = {
  title: "生活有序 · Life in Order",
  description: "查找有出处的生活知识，按主题探索、连续阅读，追溯成本收益与原始来源。",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
