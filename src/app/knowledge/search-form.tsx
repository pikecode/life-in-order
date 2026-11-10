"use client";
import { useState } from "react";
import Form from "next/form";
import SearchButton from "./search-button";
import { beginSearch } from "@/lib/usage-client";

export default function KnowledgeSearchForm({ query, topic, chapter, mode, scopeLabel, initialScope }: {
  query: string; topic: string; chapter: string; mode: "keyword" | "hybrid";
  scopeLabel: string; initialScope: "all" | "current";
}) {
  const [scope, setScope] = useState(initialScope);
  const [draft, setDraft] = useState(query);
  const dirty = draft.trim() !== query.trim();
  return <Form id="knowledge-search-form" action="/knowledge" scroll={false} autoComplete="off"
    onSubmit={event => beginSearch(event.currentTarget)}
    onReset={() => { setDraft(""); setScope("all"); }}>
    <label htmlFor="knowledge-query">你想查找什么知识？</label>
    <input type="hidden" name="topic" value={scope === "current" ? topic : ""} />
    <input type="hidden" name="chapter" value={scope === "current" ? chapter : ""} />
    <div className="knowledge-search">
      <input id="knowledge-query" type="search" name="q" maxLength={500} value={draft}
        onChange={event => setDraft(event.target.value)} autoComplete="off" spellCheck={false}
        placeholder="例如：房东说墙脏了，要扣我的押金" />
      <SearchButton />
    </div>
    <div className="search-options">
      <label htmlFor="knowledge-scope">搜索范围
        <select id="knowledge-scope" name="scope" value={scope}
          onChange={event => setScope(event.target.value === "current" ? "current" : "all")}>
          <option value="all">全部知识</option>
          {topic && <option value="current">当前目录：{scopeLabel}</option>}
        </select>
      </label>
      <label htmlFor="knowledge-mode">查找方式
        <select id="knowledge-mode" name="mode" defaultValue={mode}>
          <option value="hybrid">智能匹配（语义＋关键词）</option>
          <option value="keyword">仅关键词</option>
        </select>
      </label>
    </div>
    <p className="search-draft-note" role="status">{dirty
      ? "输入已修改，点击搜索更新；下方仍是上一次提交的结果。"
      : "提交后更新结果。默认搜索全部知识，也可以选择当前目录。"}</p>
  </Form>;
}
