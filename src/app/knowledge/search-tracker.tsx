"use client";
import { useEffect } from "react";
import { completeSearch } from "@/lib/usage-client";
export default function SearchTracker(props:Parameters<typeof completeSearch>[0]) {
  // 只消费实际表单提交的标记；预取、刷新和目录浏览没有标记。
  useEffect(()=>{completeSearch(props);});
  return null;
}
