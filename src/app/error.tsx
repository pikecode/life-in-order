"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="legal">
      <h1>暂时无法加载知识</h1>
      <p>
        内容服务或数据库暂时不可用，请稍后重试。
      </p>
      <button className="primary" onClick={reset}>
        重新加载
      </button>
    </main>
  );
}
