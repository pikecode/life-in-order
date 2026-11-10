import { db } from "@/lib/db";
import { contentVersion } from "../../../../content/moving";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const result = await db.query(
      "SELECT count(*)::int AS count FROM knowledge_entries k JOIN content_releases r ON r.source_commit=k.source_commit WHERE r.version=$1 AND r.scenario IS NOT NULL AND EXISTS(SELECT 1 FROM action_tasks a WHERE a.version=r.version)",
      [contentVersion],
    );
    if (!result.rows[0].count) throw new Error("知识未就绪");
    return Response.json(
      { status: "ready" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
