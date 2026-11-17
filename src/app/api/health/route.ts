import { db } from "@/lib/db";
import {activeCommit} from "@/lib/content-publication";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const result = await db.query(
      "SELECT count(*)::int AS count FROM knowledge_entries WHERE source_commit=$1 AND EXISTS(SELECT 1 FROM source_documents WHERE source_commit=$1)",
      [await activeCommit()],
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
