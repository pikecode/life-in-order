"use client";
import Link from "next/link";
import { cancelPendingSearch } from "@/lib/usage-client";
import type { ReactNode } from "react";

export default function BrowseLink({ href, current, children }: {
  href: string; current?: boolean; children: ReactNode;
}) {
  return <Link href={href} aria-current={current ? "page" : undefined} onNavigate={() => {
    cancelPendingSearch();
    // 再次点击当前目录时 URL 可能不变，仍需清除尚未提交的输入。
    document.querySelector<HTMLFormElement>("#knowledge-search-form")?.reset();
  }}>{children}</Link>;
}
