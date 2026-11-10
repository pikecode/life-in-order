import Link from "next/link";

export default function SiteHeader({ current }: { current: "home" | "knowledge" | "library" }) {
  return <header className="workspace-header">
    <Link className="workspace-brand" href="/" aria-label="生活有序首页">
      <span className="workspace-brand-symbol" aria-hidden="true">序<span /></span>
      <span>生活有序<small>LIFE IN ORDER</small></span>
    </Link>
    <nav aria-label="主导航">
      <Link href="/knowledge" aria-current={current === "knowledge" ? "page" : undefined}>知识目录</Link>
      <Link href="/library" aria-current={current === "library" ? "page" : undefined}>专题长文</Link>
    </nav>
  </header>;
}
