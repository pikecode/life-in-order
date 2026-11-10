"use client";

import { useFormStatus } from "react-dom";

export default function SearchButton({ label = "搜索" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="primary knowledge-submit" type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "查找中…" : label}
    </button>
  );
}
