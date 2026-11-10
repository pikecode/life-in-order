import "dotenv/config";
import { db } from "../src/lib/db";
import { migrateUsage } from "../src/lib/usage";
import { migrateDocuments } from "../src/lib/source-documents";
import { importContent } from "../src/lib/content-import";
try {
  await db.query(`
    CREATE TABLE IF NOT EXISTS source_versions (
      commit_id text PRIMARY KEY, metadata jsonb NOT NULL, manifest jsonb NOT NULL, imported_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS knowledge_entries (
      source_commit text NOT NULL REFERENCES source_versions(commit_id), path text NOT NULL, entry_number integer NOT NULL CHECK(entry_number>0), data jsonb NOT NULL,
      PRIMARY KEY(source_commit,path,entry_number)
    );
    CREATE TABLE IF NOT EXISTS content_releases (
      version text PRIMARY KEY, source_commit text REFERENCES source_versions(commit_id), stages jsonb NOT NULL, fingerprint text NOT NULL, published_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS action_tasks (
      version text NOT NULL REFERENCES content_releases(version), task_id text NOT NULL, position integer NOT NULL CHECK(position>=0), data jsonb NOT NULL,
      source_commit text, source_path text, source_entry integer,
      PRIMARY KEY(version,task_id), UNIQUE(version,position),
      FOREIGN KEY(source_commit,source_path,source_entry) REFERENCES knowledge_entries(source_commit,path,entry_number)
    );
  `);
  await db.query(
    "ALTER TABLE content_releases ADD COLUMN IF NOT EXISTS scenario jsonb",
  );
  await migrateDocuments(db);
  await importContent(db);
  await migrateUsage(db);
  console.log("数据库迁移完成");
} finally {
  await db.end();
}
